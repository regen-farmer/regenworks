var express = require("express");
var router = express.Router();
var unique = require("array-unique");
var Budget = require("../models/budget");
var Project = require("../models/project");
var System = require("../models/system");
var Posting = require("../models/posting");
var middleware = require("../middleware");

// BUDGET INDEX ROUTE

// BUDGET NEW ROUTE

// BUDGET CREATE ROUTE

// BUDGET SHOW ROUTE
router.get("/budgets/:id", middleware.isLoggedIn, function(req, res){ // CHECK OWNERSHIP ASAP
    Budget.findById(req.params.id).populate("postings").exec(function(err, foundBudget){
        if(err){
            console.log(err);
        } else {
            total = 0;
            for(i=0;i<foundBudget.postings.length;i++){
                if(foundBudget.postings[i].postType === "labor" || foundBudget.postings[i].postType === "material"){
                    total = total - (foundBudget.postings[i].value * foundBudget.postings[i].amount);
                } else if(foundBudget.postings[i].postType === "product" || foundBudget.postings[i].postType === "service"){
                    total = total + (foundBudget.postings[i].value * foundBudget.postings[i].amount);
                }
            }
            res.render("budgets/show", {budget: foundBudget, total: total});
        }
    });
});

// BUDGET EDIT ROUTE
router.get("/budgets/:id/edit", middleware.isLoggedIn, function(req, res){
    Budget.findById(req.params.id, function(err, foundBudget){
        if(err){
            console.log(err);
        } else {
            res.render("budgets/edit", {budget: foundBudget});
        }
    });
});

// BUDGET UPDATE ROUTE
router.post("/budgets/:id", middleware.isLoggedIn, function(req, res){
    Budget.findByIdAndUpdate(req.params.id, req.body.budget, function(err, updatedBudget){
        if(err){
            console.log(err);
        } else {
            res.redirect("/budgets/" + updatedBudget._id);
        }
    });
});

// BUDGET DETELE ROUTE

// PROJECT BUDGET NEW ROUTE
router.get("/projects/:id/budgets/new", middleware.isLoggedIn, function(req, res){
    Project.findById(req.params.id).populate("system").exec(function(err, foundProject){
        if(err){
            console.log(err);
        } else {
            System.findById(foundProject.system).populate("model.species").exec(function(err, foundSystem){
                if(err){
                    console.log(err);
                } else {
                    // FIND ALL SPECIES IN SYSTEM
                    var allSpecies = [];
                    foundSystem.model.forEach(function(species){
                        allSpecies.push(species.species);
                    });
                    // FIND UNIQUE SPECIES / REMOVE DUPLICATES
                    var uniqueSpecies = unique(allSpecies);
                    res.render("budgets/new", {project: foundProject, species: uniqueSpecies});
                }
            });
        }
    });
});

// PROJECT BUDGET CREATE ROUTE
router.post("/projects/:id/budgets", middleware.isLoggedIn, function(req, res){
    Project.findById(req.params.id, function(err, foundProject){
        if(err){
            console.log(err);
        } else {
            Budget.create(req.body.budget, function(err, createdBudget){
                if(err){
                    console.log(err);
                } else {
                    // BUDGET OWNER
                    createdBudget.owner.id = req.user._id;
                    createdBudget.owner.username = req.user.username;
                    createdBudget.save();
                    // SAVE BUDGET TO PROJECT
                    foundProject.budget = createdBudget;
                    foundProject.save();
                    res.redirect("/projects/" + foundProject._id);
                }
            });
        }
    });
});

// GENERATE NEW PROJECT ESTABLISHMENT BUDGET
router.get("/projects/:id/generateestablishment", middleware.isLoggedIn, function(req, res){
    // FIND PROJECT
    Project.findById(req.params.id).populate("system").exec(function(err, foundProject){
        if(err){
            console.log(err);
        } else {
            System.findById(foundProject.system).populate("model.species").exec(function(err, foundSystem){
                if(err){
                    console.log(err);
                } else {
                    // FIND ALL SPECIES IN SYSTEM
                    var allSpecies = [];
                    foundSystem.model.forEach(function(species){
                        allSpecies.push(species.species);
                    });
                    console.log(allSpecies.length);
                    // FIND UNIQUE SPECIES / REMOVE DUPLICATES
                    var uniqueSpecies = unique(allSpecies);
                    // SEND ARRAY OF SUBTYPES
                    var subtypes = ["bed", "plant", "method"];
                    res.render("budgets/establishnew", {project: foundProject, species: uniqueSpecies, subtypes: subtypes});
                }
            });
        }
    });
});

// GENERATE ESTABLISHMENT BUDGET CREATE ROUTE
router.post("/projects/:id/generateestablishment", middleware.isLoggedIn, function(req, res){
    // FIND PROJECT
    Project.findById(req.params.id, function(err, foundProject){
        if(err){
            console.log(err);
        } else {
            // CREATE BUDGET AND PLACE IN PROJECT
            var budget = req.body.budget;
            Budget.create(budget, function(err, createdBudget){
                if(err){
                    console.log(err);
                } else {
                    foundProject.budgets.establishment = createdBudget;
                    foundProject.save();
                    // PARSE QUERY
                    var speciesPostings = req.body.speciespostings;
                    var speciesPostingsArray = [];
                    for(i=0;i<speciesPostings.length;i++){
                        // REMOVE NONE ONES
                        if(!(speciesPostings[i] === "none")){
                            var splitPostings = speciesPostings[i].split(" ");
                            speciesPostingsArray.push(splitPostings);
                        }
                    }
                    console.log(speciesPostingsArray);
                    // FIND SYSTEM
                    System.findById(foundProject.system).populate("model.species").exec(function(err, foundSystem){
                        if(err){
                            console.log(err);
                        } else {
                            // UNIQUE SPECIES
                            var allSpecies = [];
                            foundSystem.model.forEach(function(species){
                                allSpecies.push(species.species);
                            });
                            var uniqueSpecies = unique(allSpecies);
                            // SOMEWHERE CALCULATE TREE COUNT

                            // FIND SPECIES ACTIVITIES AND CREATE POSTINGS
                            var postings = [];
                            // RUN THROUGH ALL POSTINGS
                            for(i=0;i<speciesPostingsArray.length;i++){
                                for(j=0;j<uniqueSpecies.length;j++){
                                    // RUN THROUGH ALL ACTIVITIES
                                    if(speciesPostingsArray[i][0] === uniqueSpecies[j].id){
                                        // CREATE THE POSTING HERE AND PUSH
                                        var posting = {
                                            name:  uniqueSpecies[j].nameCommon + " " + uniqueSpecies[j].activities[speciesPostingsArray[i][1]].subtype + ": " + uniqueSpecies[j].activities[speciesPostingsArray[i][1]].name,
                                            postType: "material",
                                            amount: 1,
                                            value: uniqueSpecies[j].activities[speciesPostingsArray[i][1]].price,
                                            year: 1
                                        };
                                        // SET POSTTYPE DEPENDING ON POSTINGS TYPE
                                        if(uniqueSpecies[j].activities[speciesPostingsArray[i][1]].subtype === "bed" || uniqueSpecies[j].activities[speciesPostingsArray[i][1]].subtype === "method"){
                                            posting.postType = "labor";
                                        }
                                        postings.push(posting);
                                    }
                                }
                            }
                            console.log(postings);
                            // SETUP POSTINGS FOR AREA ACTIVITIES - HOW TO GET VALUES FOR THESE?!

                            // CREATE POSTINGS
                            Posting.insertMany(postings, function(err, createdPostings){
                                if(err){
                                    console.log(err);
                                } else {
                                    // ADD POSTINGS TO BUDGET
                                    Budget.findByIdAndUpdate(foundBudget._id, { $push: { postings: { $each: createdPostings } } }, function(err, updatedBudget){
                                        if(err){
                                            console.log(err);
                                        } else {
                                            console.log("Postings added to budget");
                                            res.redirect("/projects/" + foundProject._id);
                                        }
                                    });
                                }
                            });
                        }
                    });
                }
            });
        }
    });
});


// GENERATE NEW PROJECT CASH-FLOW BUDGET
router.get("/projects/:id/generatemanagement", middleware.isLoggedIn, function(req, res){
    // FIND PROJECT
    Project.findById(req.params.id, function(err, foundProject){
        if(err){
            console.log(err);
        } else {
            // FIND SYSTEM
            System.findById(foundProject.system).populate("model.species").exec(function(err, foundSystem){
                if(err){
                    console.log(err);
                } else {
                    // FIND ALL SPECIES IN SYSTEM
                    var allSpecies = [];
                    foundSystem.model.forEach(function(species){
                        allSpecies.push(species.species);
                    });
                    console.log(allSpecies.length);
                    // FIND UNIQUE SPECIES / REMOVE DUPLICATES
                    var uniqueSpecies = unique(allSpecies);
                    // SEND ARRAY OF SUBTYPES
                    var subtypes = ["compost", "pruning", "weedcontrol", "harvest"];
                    res.render("budgets/managementnew", {project: foundProject, species: uniqueSpecies, subtypes: subtypes});
                }
            });
        }
    });
});

// GENERATE CASH-FLOW BUDGET CREATE ROUTE
router.post("/projects/:id/generatemanagement", middleware.isLoggedIn, function(req, res){
    // FIND PROJECT
    Project.findById(req.params.id, function(err, foundProject){
        if(err){
            console.log(err);
        } else {
            // CREATE BUDGET AND PLACE IN PROJECT
            var budget = req.body.budget;
            Budget.create(budget, function(err, createdBudget){
                if(err){
                    console.log(err);
                } else {
                    foundProject.budgets.management = createdBudget;
                    foundProject.save();
                    // PARSE QUERY
                    var speciesPostings = req.body.speciespostings;
                    var speciesPostingsArray = [];
                    for(i=0;i<speciesPostings.length;i++){
                        // REMOVE NONE ONES
                        if(!(speciesPostings[i] === "none")){
                            var splitPostings = speciesPostings[i].split(" ");
                            speciesPostingsArray.push(splitPostings);
                        }
                    }
                    console.log(speciesPostingsArray);
                    // FIND SYSTEM
                    System.findById(foundProject.system).populate("model.species").exec(function(err, foundSystem){
                        if(err){
                            console.log(err);
                        } else {
                            // UNIQUE SPECIES
                            var allSpecies = [];
                            foundSystem.model.forEach(function(species){
                                allSpecies.push(species.species);
                            });
                            var uniqueSpecies = unique(allSpecies);
                            // SOMEWHERE CALCULATE TREE COUNT

                            // FIND SPECIES ACTIVITIES AND CREATE POSTINGS
                            var postings = [];
                            var period = req.body.period;
                            // RUN THROUGH ALL POSTINGS
                            for(i=0;i<speciesPostingsArray.length;i++){
                                for(j=0;j<uniqueSpecies.length;j++){
                                    // RUN THROUGH ALL ACTIVITIES
                                    if(speciesPostingsArray[i][0] === uniqueSpecies[j].id){
                                        // ITERATE FOR EACH YEAR
                                        for(k=0;k<period;k++){
                                            // CREATE THE POSTING HERE AND PUSH
                                            var posting = {
                                                name:  uniqueSpecies[j].nameCommon + " " + uniqueSpecies[j].activities[speciesPostingsArray[i][1]].subtype + ": " + uniqueSpecies[j].activities[speciesPostingsArray[i][1]].name,
                                                postType: "material",
                                                amount: 1,
                                                value: uniqueSpecies[j].activities[speciesPostingsArray[i][1]].price,
                                                year: k + 1
                                            };
                                            // SET POSTTYPE DEPENDING ON POSTINGS TYPE
                                            if(uniqueSpecies[j].activities[speciesPostingsArray[i][1]].subtype === "pruning" || uniqueSpecies[j].activities[speciesPostingsArray[i][1]].subtype === "harvest"){
                                                posting.postType = "labor";
                                            }
                                            postings.push(posting);
                                        }
                                    }
                                }
                            }
                            console.log(postings.length);
                            // SETUP POSTINGS FOR AREA ACTIVITIES - HOW TO GET VALUES FOR THESE?!

                            // CREATE POSTINGS
                            Posting.insertMany(postings, function(err, createdPostings){
                                if(err){
                                    console.log(err);
                                } else {
                                    // ADD POSTINGS TO BUDGET
                                    Budget.findByIdAndUpdate(foundBudget._id, { $push: { postings: { $each: createdPostings } } }, function(err, updatedBudget){
                                        if(err){
                                            console.log(err);
                                        } else {
                                            console.log("Postings added to budget");
                                            res.redirect("/projects/" + foundProject._id);
                                        }
                                    });
                                }
                            });
                        }
                    });
                }
            });
        }
    });
});

// NOTES FOR BOTH ACTIVITIES AND BUDGETS
// var budgetEstablishment = {
//     currency: "usd",
//     name: "Establishment budget"
// };
// Budget.create(budgetEstablishment, function(err, createdBudget){
//     if(err){
//         console.log(err);
//     } else {
//         // BUDGET OWNER
//         createdBudget.owner.id = req.user._id;
//         createdBudget.owner.username = req.user.username;
//         createdBudget.save();
//         // CREATE POSTINGS
//         // FIND ALL SPECIES IN PROJECT SYSTEM
//         var allSpecies = [];
//         foundSystem.model.forEach(function(species){
//             allSpecies.push(species.species.id);
//         });
//         // FIND UNIQUE SPECIES / REMOVE DUPLICATES
//         var uniqueSpecies = unique(allSpecies);
//         Species.find({"_id": uniqueSpecies}, function(err, foundSpecies){
//             if(err) {
//                 console.log(err);
//             } else {
//                 var activities = [];
//                 var postings = [];
//                 for(i=0;foundSpecies.length > i;i++){
//                     for(j=0;foundSpecies[i].activities.length > j;j++){
//                         // CHECK IF ESTABLISHMENT - DIFFERENTIATE ACTIVITIES
//                         if(foundSpecies[i].activities[j].activityType === "establish"){
//                             var activity = {
//                                 name: foundSpecies[i].activities[j].name + " " + foundSpecies[i].nameCommon,
//                                 automated: true,
//                                 status: true
//                             };
//                             activities.push(activity);
//                         }
//                     }
//                      var posting = {
//                          name: foundSpecies[i].nameCommon + " plants",
//                          postType: "material",
//                          amount: 1,
//                          value: 1
//                      };
//                      if(foundSpecies[i].price > 0){
//                          posting.value = foundSpecies[i].price;
//                      }
//                      postings.push(posting);
//                 }
//                 // CREATE ACTIVITIES
//                 activities.forEach(function(activity){
//                     Activity.create(activity, function(err, createdActivity){
//                         if(err){
//                             console.log(err);
//                         } else {
//                             createdActivity.owner.id = req.user._id;
//                             createdActivity.owner.username = req.user.username;
//                             createdActivity.save();
//                             // PUSH TO PROJECT
//                             createdProject.activities.push(createdActivity);
//                             createdProject.save();
//                         }
//                     });
//                 });
//                 // SAVE POSTINGS
//                 Budget.findByIdAndUpdate(createdBudget._id, {$addToSet: {postings: { $each: postings }}}, function(err, updatedBudget){
//                     if(err){
//                         console.log(err);
//                     } else {
//                         var budgetManagement = {
//                             currency: "usd",
//                             name: "Management budget"
//                         };
//                         Budget.create(budgetManagement, function(err, createdManagementBudget){
//                             if(err){
//                                 console.log(err);
//                             } else {
//                                 // BUDGET OWNER
//                                 createdManagementBudget.owner.id = req.user._id;
//                                 createdManagementBudget.owner.username = req.user.username;
//                                 createdManagementBudget.save();
//                                 // SET AS PROJECT BUDGET
//                                 createdProject.budgets.management = createdManagementBudget;
//                                 createdProject.save();
//                                 // req.flash("success", "Successfully added comment");
//                                 res.redirect("/projects/" + createdProject._id);
//                             }
//                         })
//                     }
//                 });
//             }
//         });
//     }
// });
//

// MOVED TO POSTINGS ROUTE
/*// BUDGET POSTING NEW
router.get("/budgets/:id/postings/new", middleware.isLoggedIn, function(req, res){
    Budget.findById(req.params.id, function(err, foundBudget){
        if(err){
            console.log(err);
        } else {
            res.render("budgets/postings", {budget: foundBudget});
        }
    });
});

// BUDGET POSTING CREATE
router.put("/budgets/:id/postings", middleware.isLoggedIn, function(req, res){
    Budget.findByIdAndUpdate(req.params.id, {$addToSet: {postings: req.body.posting}}, function(err, updatedBudget){
        if(err){
            console.log(err);
        } else {
            res.redirect("/budgets/" + updatedBudget._id);
        }
    });
});*/

module.exports = router;
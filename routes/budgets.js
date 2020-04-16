var express = require("express");
var router = express.Router();
var Budget = require("../models/budget");
var Project = require("../models/project");
var middleware = require("../middleware");

// BUDGET INDEX ROUTE

// BUDGET NEW ROUTE

// BUDGET CREATE ROUTE

// BUDGET SHOW ROUTE
router.get("/budgets/:id", middleware.isLoggedIn, function(req, res){ // CHECK OWNERSHIP ASAP
    Budget.findById(req.params.id, function(err, foundBudget){
        if(err){
            console.log(err);
        } else {
            res.render("budgets/show", {budget: foundBudget});
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
    Project.findById(req.params.id, function(err, foundProject){
        if(err){
            console.log(err);
        } else {
            res.render("budgets/new", {project: foundProject});
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

// BUDGET POSTING NEW
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
});

module.exports = router;
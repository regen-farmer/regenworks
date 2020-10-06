var express = require("express");
var router = express.Router();
var Posting = require("../models/posting");
var Budget = require("../models/budget");
var middleware = require("../middleware");

// POSTING EDIT ROUTE

// POSTING UPDATE ROUTE

// NESTED POSTING BUDGET NEW ROUTE
router.get("/budgets/:id/postings/new", middleware.isLoggedIn, function(req, res){
    // FIND BUDGET ID
    Budget.findById(req.params.id, function(err, foundBudget){
        if(err){
            console.log(err);
        } else {
            res.render("postings/new", {budget: foundBudget});
        }
    });
});

// NESTED POSTING BUDGET CREATE ROUTE
router.post("/budgets/:id/postings", middleware.isLoggedIn, function(req, res){ // BUDGET MIDDLEWARE!!! VIP
    // CREATE POSTING FIRST AND INSERT IN BUDGET
    Budget.findById(req.params.id, function(err, foundBudget){
        if(err){
            console.log(err);
        } else {
            Posting.create(req.body.posting, function(err, createdPosting){
                if(err){
                    console.log(err);
                } else {
                    console.log(createdPosting);
                    // SAVE POSTING ON BUDGET
                    foundBudget.postings.push(createdPosting);
                    foundBudget.save();
                    res.redirect("/budgets/" + foundBudget._id);
                }
            });
        }
    });
});

// NESTED POSTING BUDGET EDIT ROUTE - WITH THESE I CAN CHECK BUDGET OWNERSHIP
router.get("/budgets/:id/postings/:postid/edit", middleware.isLoggedIn, function(req, res){
    // FIND BUDGET
    Budget.findById(req.params.id, function(err, foundBudget){
        if(err){
            console.log(err);
        } else {
            Posting.findById(req.params.postid, function(err, foundPosting){
                if(err){
                    console.log(err);
                } else {
                    res.render("postings/edit", {budget: foundBudget, posting: foundPosting});
                }
            });
        }
    });
});

// NESTED POSTING BUDGET UPDATE ROUTE
router.put("/budgets/:id/postings/:postid", middleware.isLoggedIn, function(req, res){
    // FIND POSTING AND UPDATE
    Posting.findByIdAndUpdate(req.params.postid, req.body.posting, function(err, updatedPosting){
        if(err){
            console.log(err);
        } else {
            res.redirect("/budgets/" + req.params.id);
        }
    });
});

module.exports = router;
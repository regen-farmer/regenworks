var express = require("express");
var router = express.Router();
var Posting = require("../models/posting");
var Budget = require("../models/budget");
var middleware = require("../middleware");

// NESTED POSTING BUDGET NEW ROUTE
router.get("budgets/:id/postings/new", middleware.isLoggedIn, function(req, res){
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
router.post("budgets/:id/postings", middleware.isLoggedIn, function(req, res){ // BUDGET MIDDLEWARE!!! VIP
    // CREATE POSTING FIRST AND INSERT IN BUDGET?
    res.redirect("/budgets/" + req.params._id);
});

// NESTED POSTING BUDGET EDIT ROUTE

// NESTED POSTING BUDGET UPDATE ROUTE

module.exports = router;
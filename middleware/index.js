var Place = require("../models/place");

// Define middleware object
var middlewareObj = {};

// CHECK PLACE OWNERSHIP MIDDLEWARE
middlewareObj.checkPlaceOwnership = function(req, res, next){
    if(req.isAuthenticated()){
        Place.findById(req.params.id, function(err, foundPlace){
            if(err) {
                // req.flash("error", "Place not found.");
                res.redirect("back");
            } else {
                // does user own the place?
                if(foundPlace.owner.id.equals(req.user._id)){
                    next();
                } else {
                    // req.flash("error", "You don't have permission to do that.");
                    res.redirect("back");
                }
            }
        });
    } else {
        // req.flash("error", "You need to be logged in to do that.");
        res.redirect("back"); // Sends the user back to the previous page they were on.
    }
};

// CHECK IF A USER IS LOGGED IN
middlewareObj.isLoggedIn = function(req, res, next){
    if(req.isAuthenticated()){
        return next();
    }
    // req.flash("error", "You need to be logged in to do that!");
    res.redirect("/login");
};

// Export middleware object
module.exports = middlewareObj;
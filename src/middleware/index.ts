import Parcel from "../models/parcel";
import User from "../models/user";

// Define middleware object
var middlewareObj: any = {};

// CHECK PARCEL OWNERSHIP MIDDLEWARE
middlewareObj.checkParcelOwnership = function(req, res, next){
    if(req.isAuthenticated()){
        Parcel.findById(req.params.id, function(err, foundParcel){
            if(err) {
                // req.flash("error", "Place not found.");
                res.redirect("back");
            } else {
                // does user own the place?
                if(foundParcel.owner.id.equals(req.user._id)){
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

// CHECK SYSTEM OWNERSHIP MIDDLEWARE


// CHECK BUDGET OWNERSHIP MIDDLEWARE


// CHECK USER OWNERSHIP MIDDLEWARE
middlewareObj.checkUserOwnership = function(req, res, next){
    if(req.isAuthenticated()){
        User.findById(req.params.id, function(err, foundUser){
            if(err){
                // req.flash("error", "Brugeren blev ikke fundet.");
                res.redirect("back");
            } else {
                // Does logged in user match the user profile requested?
                if(foundUser._id.equals(req.user._id)){
                    next();
                } else {
                    // req.flash("error", "You do not have permission to do this");
                    res.redirect("back");
                }
            }
        });
    } else {
        // req.flash("error", "Du skal være logget ind for at foretage denne handling".);
        res.redirect("back");
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

// CHECK ADMIN USER IS LOGGED IN
middlewareObj.adminIsLoggedIn = function(req, res, next){
    if(req.isAuthenticated()){
        if(req.user.isAdmin){
            next();
        } else {
            // req.flash("error", "You do not have permission to do that.");
            res.redirect("back");
        }
    } else {
        // req.flash("error", "You need to be logged in to do that!");
        res.redirect("back");
    }
};

/*// CHECK ADMIN USER IS LOGGED IN
middlewareObj.throttler = function(req, res, next){
    if(req.isAuthenticated()){
        if(req.user.isAdmin){
            next();
        } else {
            // req.flash("error", "You do not have permission to do that.");
            res.redirect("back");
        }
    } else {
        // req.flash("error", "You need to be logged in to do that!");
        res.redirect("back");
    }
};*/

// Export middleware object
export default middlewareObj;
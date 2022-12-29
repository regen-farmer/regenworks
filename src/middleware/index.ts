import express from 'express';
import Parcel from '../models/parcel';
import User, { IUserSchema } from '../models/user';

// CHECK PARCEL OWNERSHIP MIDDLEWARE
export async function checkParcelOwnership(req: express.Request & { user?: IUserSchema}, res: express.Response, next: express.NextFunction) {
  if (req.oidc.user) {
    try {
      const foundParcel = await Parcel.findById(req.params.id);
      if (foundParcel?.owner.id.equals(req.user?._id)) {
        next();
      } else {
        // req.flash("error", "You don't have permission to do that.");
        res.redirect('back');
      }
    } catch (err) {
      res.redirect('back');
    }
  } else {
    // req.flash("error", "You need to be logged in to do that.");
    res.redirect('back'); // Sends the user back to the previous page they were on.
  }
}

// CHECK SYSTEM OWNERSHIP MIDDLEWARE

// CHECK BUDGET OWNERSHIP MIDDLEWARE

// CHECK USER OWNERSHIP MIDDLEWARE
export async function checkUserOwnership(req: express.Request & { user?: IUserSchema}, res: express.Response, next: express.NextFunction) {
  if (req.oidc.user && req.oidc.user.email_verified) {
    try {
      const foundUser = await User.findById(req.params.id);
      if (foundUser && foundUser._id.equals(req.user?._id)) {
        next();
      } else {
        res.redirect('back');
      }
    } catch (err) {
      res.redirect('back');
    }
  } else {
    // req.flash("error", "Du skal være logget ind for at foretage denne handling".);
    res.redirect('back');
  }
}

// CHECK IF A USER IS LOGGED IN
export async function isLoggedIn(req: express.Request & { user?: IUserSchema}, res: express.Response, next: express.NextFunction) {
  if (req.oidc.user && req.oidc.user?.email_verified) {
    return next();
  }
  // req.flash("error", "You need to be logged in to do that!");
  res.redirect('/login');
}

// CHECK ADMIN USER IS LOGGED IN
export async function adminIsLoggedIn(req: express.Request & { user?: IUserSchema}, res: express.Response, next: express.NextFunction) {
  if (req.oidc.user) {
    if (req.user?.isAdmin) {
      next();
    } else {
      // req.flash("error", "You do not have permission to do that.");
      res.redirect('back');
    }
  } else {
    // req.flash("error", "You need to be logged in to do that!");
    res.redirect('back');
  }
}

/* // CHECK ADMIN USER IS LOGGED IN
middlewareObj.throttler = function(req: express.Request & { user?: IUserSchema}, res: express.Response, next: express.NextFunction){
    if(req.isAuthenticated()){
        if(req.oidc.user.isAdmin){
            next();
        } else {
            // req.flash("error", "You do not have permission to do that.");
            res.redirect("back");
        }
    } else {
        // req.flash("error", "You need to be logged in to do that!");
        res.redirect("back");
    }
}; */

// Export middleware object
export default {
  checkParcelOwnership,
  checkUserOwnership,
  isLoggedIn,
  adminIsLoggedIn,
};

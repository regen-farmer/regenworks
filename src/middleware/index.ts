import express from 'express';
import { Auth0IDToken, Variables } from '../app.js';
import Parcel from '../models/parcel.js';
import User, { UserDocument } from '../models/user.js';

// CHECK PARCEL OWNERSHIP MIDDLEWARE
export async function checkParcelOwnership(c) {
  if (c.get('user')) {
    try {
      const foundParcel = await Parcel.findById(c.req.param('entityid'));
      if (foundParcel?.owner.id.toString() === c.get('user')?._id.toString()) {
        return;
      } else {
        // req.flash("error", "You don't have permission to do that.");
        c.status(401)
return c.json({ error: 'You don\'t have permission to access this farm' });
      }
    } catch (err) {
      c.status(400)
return c.json({ error: 'The farm could not be found' });
    }
  } else {
    // req.flash("error", "You need to be logged in to do that.");
    c.status(400)
return c.json({ error: 'No user id recieved' }); // Sends the user back to the previous page they were on.
  }
}

// CHECK SYSTEM OWNERSHIP MIDDLEWARE

// CHECK BUDGET OWNERSHIP MIDDLEWARE

// CHECK USER OWNERSHIP MIDDLEWARE
export async function checkUserOwnership(c) {
  // console.log("IM HERE 1 ", req.idToken)
  if (c.get('idToken') && c.get('idToken').email_verified) {
    try {
      const foundUser = await User.findById(c.req.param('entityid'));

      if (foundUser && foundUser.id === c.get('user')?.id) {
        console.log('progress!!');
        return;
      } else {
        c.status(401)
        return c.json({ error: 'The owner of this farm doesn\'t match the recieved user id' });
      }
    } catch (err) {
      c.status(400)
      return c.json({ error: 'User not found' });
    }
  } else {
    // req.flash("error", "Du skal være logget ind for at foretage denne handling".);
    c.status(400)
    return c.json({ error: 'email not verified' });
  }
}

// CHECK IF A USER IS LOGGED IN
export async function isLoggedIn(c) {
  if (c.get('idToken') && c.get('idToken').email_verified) {
    return;
  }
  // req.flash("error", "You need to be logged in to do that!");
  return c.json({});
}

// CHECK ADMIN USER IS LOGGED IN
export async function adminIsLoggedIn(c) {
  if (c.get('user')) {
    if (c.get('user')?.isAdmin) {
      return;
    } else {
      // req.flash("error", "You do not have permission to do that.");
      c.status(401)
return c.json({
        error: 'User is not admin',
      });
    }
  } else {
    // req.flash("error", "You need to be logged in to do that!");
    c.status(400)
return c.json({ error: 'User not found' });
  }
}

/* // CHECK ADMIN USER IS LOGGED IN
middlewareObj.throttler = function(req: express.Request & { user?: UserDocument, idToken?: Auth0IDToken }, res: express.Response: express.NextFunction){
    if(req.isAuthenticated()){
        if(req.oidc.user.isAdmin){
            next();
        } else {
            // req.flash("error", "You do not have permission to do that.");
            return c.json("back");
        }
    } else {
        // req.flash("error", "You need to be logged in to do that!");
        return c.json("back");
    }
}; */

// Export middleware object
export default {
  checkParcelOwnership,
  checkUserOwnership,
  isLoggedIn,
  adminIsLoggedIn,
};

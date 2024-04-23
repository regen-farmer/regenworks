import express from "express";
import { Auth0IDToken } from "../app";
import Parcel from "@rw/db/schemas/parcel";
import User, { UserDocument } from "@rw/db/schemas/user";

// CHECK PARCEL OWNERSHIP MIDDLEWARE
export async function checkParcelOwnership(
	req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
	res: express.Response,
	next: express.NextFunction,
) {
	if (req.user) {
		try {
			const foundParcel = await Parcel.findById(req.params.id);
			if (foundParcel?.owner.id.toString() === req.user?._id.toString()) {
				next();
			} else {
				// req.flash("error", "You don't have permission to do that.");
				res
					.status(401)
					.send({ error: "You don't have permission to access this farm" });
			}
		} catch (err) {
			res.status(400).send({ error: "The farm could not be found" });
		}
	} else {
		// req.flash("error", "You need to be logged in to do that.");
		res.status(400).send({ error: "No user id recieved" }); // Sends the user back to the previous page they were on.
	}
}

// CHECK SYSTEM OWNERSHIP MIDDLEWARE

// CHECK BUDGET OWNERSHIP MIDDLEWARE

// CHECK USER OWNERSHIP MIDDLEWARE
export async function checkUserOwnership(
	req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
	res: express.Response,
	next: express.NextFunction,
) {
	// console.log("IM HERE 1 ", req.idToken)
	if (req.idToken && req.idToken.email_verified) {
		try {
			const foundUser = await User.findById(req.params.id);

			if (foundUser && foundUser.id === req.user?.id) {
				console.log("progress!!");
				next();
			} else {
				res.status(401).send({
					error: "The owner of this farm doesn't match the recieved user id",
				});
			}
		} catch (err) {
			res.status(400).send({ error: "User not found" });
		}
	} else {
		// req.flash("error", "Du skal være logget ind for at foretage denne handling".);
		res.status(400).send({ error: "email not verified" });
	}
}

// CHECK IF A USER IS LOGGED IN
export async function isLoggedIn(
	req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
	res: express.Response,
	next: express.NextFunction,
) {
	if (req.idToken && req.idToken.email_verified) {
		return next();
	}
	// req.flash("error", "You need to be logged in to do that!");
	res.send();
}

// CHECK ADMIN USER IS LOGGED IN
export async function adminIsLoggedIn(
	req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
	res: express.Response,
	next: express.NextFunction,
) {
	if (req.user) {
		if (req.user?.isAdmin) {
			next();
		} else {
			// req.flash("error", "You do not have permission to do that.");
			res.status(401).send({
				error: "User is not admin",
			});
		}
	} else {
		// req.flash("error", "You need to be logged in to do that!");
		res.status(400).send({ error: "User not found" });
	}
}

/* // CHECK ADMIN USER IS LOGGED IN
middlewareObj.throttler = function(req: express.Request & { user?: UserDocument, idToken?: Auth0IDToken }, res: express.Response, next: express.NextFunction){
    if(req.isAuthenticated()){
        if(req.oidc.user.isAdmin){
            next();
        } else {
            // req.flash("error", "You do not have permission to do that.");
            res.send("back");
        }
    } else {
        // req.flash("error", "You need to be logged in to do that!");
        res.send("back");
    }
}; */

// Export middleware object
export default {
	checkParcelOwnership,
	checkUserOwnership,
	isLoggedIn,
	adminIsLoggedIn,
};

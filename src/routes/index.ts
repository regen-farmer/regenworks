import User, { UserDocument } from "../models/user.js";
import Parcel from "../models/parcel.js";
import Activity from "../models/activity.js";
import middleware from "../middleware/index.js"; // Will automatically require the middleware "index" file as the standard
import { Auth0IDToken, Variables } from "../app.js";
import { Hono } from "hono";

// import logger from '../middleware/logger';

export default function indexRoutes(
  router: Hono<
    {
      Variables: Variables;
    },
    {},
    "/"
  >
) {
  // ROOT ROUTE
  router.get("/", async (c) => {
    return c.text("test");
  });
  // ROOT ROUTE
  router.get("/test", async (c) => {
    return c.text("test2");
  });


  // ROOT ROUTE
  router.get("/myuser", async (c) => {
    return c.json({ user: c.get("user") });
  });

  // ABOUT ROUTE
  router.get("/about", async (c) => {
    return c.json({});
  });

  // TERMS ROUTE
  router.get("/terms", async (c) => {
    return c.json({});
  });

  // PRIVACY ROUTE
  router.get("/privacy", async (c) => {
    return c.json({});
  });

  // FEEDBACK ROUTE
  router.get("/feedback", async (c) => {
await middleware.isLoggedIn(c);
    return c.json({});
  });

  // COMPOSITION ROUTE
  router.get("/composition", async (c) => {
await middleware.isLoggedIn(c);
    return c.json({});
  });

  // SUCCESSION ROUTE
  router.get("/succession", async (c) => {
await middleware.isLoggedIn(c);
    return c.json({});
  });

  // QUESTIONNAIRE ROUTE
  router.get("/questionnaire", async (c) => {
    return c.json({});
  });

  // SUPPORT ROUTE
  router.get("/support", async (c) => {
    return c.json({});
  });

  // PLANNING ROUTE
  router.get("/planning", async (c) => {
await middleware.isLoggedIn(c);
    return c.json({});
  });

  // DASHBOARD ROUTE
  router.get("/dashboard", async (c) => {
await middleware.isLoggedIn(c);
    try {
      const allParcels = await Parcel.find({ "owner.id": c.get("user")?._id });
      try {
        const allActivities = await Activity.find({
          "owner.id": c.get("user")?._id,
        });
        allActivities.sort(
          (a, b) =>
            Date.parse(a.start.date.toString()) -
            Date.parse(b.start.date.toString())
        );
        allActivities.slice(0, 4);
        return c.json({ activities: allActivities, parcels: allParcels });
      } catch (err) {
        console.log(err);
      }
    } catch (err) {
      console.log(err);
    }
  });

  // NEW USER ROUTE
  // router.get("/users/new", function(req: express.Request & { user?: UserDocument, idToken?: Auth0IDToken }, res: express.Response){
  //     logger.info('Sign up page requested', {timestamp: Date.now()});
  //     return c.json("users/new");
  // });

  // robots.txt
  router.get("/robots.txt", async (c) => {
    return c.text('');
  });

  // ADMIN PANEL
  router.get("/admindash", async (c) => {

    await middleware.adminIsLoggedIn(c)
    // GET LOGS

    return c.json({});
  });

  // SHOW USER ROUTE
  router.get("/users/:id", async (c) => {

    await middleware.checkUserOwnership(c);
    try {
      const foundUser = await User.findById(c.req.param('id'))
        .populate("parcels")
        .exec();
      return c.json({ user: foundUser });
    } catch (err) {
      console.log(err);
    }
  });

  // USER EDIT ROUTE
  router.get("/users/:id/edit", async (c) => {

    await middleware.checkUserOwnership(c);
    try {
      const foundUser = await User.findById(c.req.param("id"));
      return c.json({ user: foundUser });
    } catch (err) {
      console.log(err);
    }
  });

  // USER UPDATE ROUTE
  router.put("/users/:id", async (c) => {

    await middleware.checkUserOwnership(c);

    try {
      await User.findByIdAndUpdate(c.req.param("id"), (await c.req.json()).user);
      return c.json(`/users/${c.req.param("id")}`);
    } catch (err) {
      console.log(err);
    }
  });

  // USER DELETE ROUTE
  // router.delete("/users/:id", async function(req: express.Request & { user?: UserDocument, idToken?: Auth0IDToken }, res: express.Response){
    // await middleware.checkUserOwnership(c)
  //     try {

  //         let user = await User.findByIdAndRemove(c.req.param('id'));

  //         // Flash message
  //         logger.info('User "' + user?.email + '" was deleted', {timestamp: Date.now()});
  //         return c.json("/logout");
  //     }
  //     catch (err){
  //         console.log(err);
  //         // Flash message
  //         return c.json("/parcels");
  //     }
  // });

  // SET CURRENTPROJECT //

  router.put("/users/:id/countrycode", async (c) => {
    // const foundUser = await User.findById(c.get('user')?.id);
    if (!((await c.req.json()).countryCode.length === 2)) {
      c.status(400);
    }
    console.log("cc body ", (await c.req.json()).countryCode as string);
    const updateUser = await User.findByIdAndUpdate(
      c.get("user")?.id,
      { countryCode: (await c.req.json()).countryCode },
      { new: true }
    );
    console.log("cc", updateUser?.countryCode);
    if (updateUser) {
      return c.json(updateUser);
    } else {
      c.status(400)
      return c.json({ error: "User not found" });
    }
  });

  router.put(
    "/users/:id/currentproject",
    
    async (c) => {
      await middleware.checkUserOwnership(c);
      console.log("im here 2");
      try {
        const foundUser = await User.findById(c.get("user")?.id);
        console.log("im here 3");
        try {
          const foundParcel = await Parcel.findById((await c.req.json()).parcelid);
          console.log("im here 4", foundUser, foundParcel);
          if (foundUser && foundParcel) {
            console.log("im here 5");
            foundUser.currentProject = foundParcel.id;
            await foundUser.save();
            console.log(`${foundParcel.name} has been set to active project`);
            return c.json(foundUser);
          }
        } catch (err) {
          console.log(err);
        }
      } catch (err) {
        console.log(err);
      }
    }
  );

  // PARCEL STATUS PAGE
  router.get("/parcels/:id/status", async (c) => {
    // FIND PARCEL

    await middleware.isLoggedIn(c);

    try {
      const foundParcel = await Parcel.findById(c.req.param('id'))
        .populate({ path: "layers", populate: { path: "soiltests" } })
        .exec();
      return c.json({ parcel: foundParcel });
    } catch (err) {
      console.log(err);
    }
  });
}

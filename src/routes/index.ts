import express from 'express';
import User, { UserDocument } from '../models/user';
import Parcel from '../models/parcel';
import Activity from '../models/activity';
import middleware from '../middleware'; // Will automatically require the middleware "index" file as the standard
import { Auth0IDToken } from '../app';

// import logger from '../middleware/logger';

const router = express.Router();

// ROOT ROUTE
router.get('/', async (req: express.Request & { user?: UserDocument, idToken?: Auth0IDToken }, res: express.Response) => {
  res.send();
});

// ROOT ROUTE
router.get('/myuser', async (req: express.Request & { user?: UserDocument, idToken?: Auth0IDToken }, res: express.Response) => {
  res.send({ user: req.user });
});

// ABOUT ROUTE
router.get('/about', async (req: express.Request & { user?: UserDocument, idToken?: Auth0IDToken }, res: express.Response) => {
  res.send();
});

// TERMS ROUTE
router.get('/terms', async (req: express.Request & { user?: UserDocument, idToken?: Auth0IDToken }, res: express.Response) => {
  res.send();
});

// PRIVACY ROUTE
router.get('/privacy', async (req: express.Request & { user?: UserDocument, idToken?: Auth0IDToken }, res: express.Response) => {
  res.send();
});

// FEEDBACK ROUTE
router.get('/feedback', middleware.isLoggedIn, async (req: express.Request & { user?: UserDocument, idToken?: Auth0IDToken }, res: express.Response) => {
  res.send();
});

// COMPOSITION ROUTE
router.get('/composition', middleware.isLoggedIn, async (req: express.Request & { user?: UserDocument, idToken?: Auth0IDToken }, res: express.Response) => {
  res.send();
});

// SUCCESSION ROUTE
router.get('/succession', middleware.isLoggedIn, async (req: express.Request & { user?: UserDocument, idToken?: Auth0IDToken }, res: express.Response) => {
  res.send();
});

// QUESTIONNAIRE ROUTE
router.get('/questionnaire', async (req: express.Request & { user?: UserDocument, idToken?: Auth0IDToken }, res: express.Response) => {
  res.send();
});

// SUPPORT ROUTE
router.get('/support', async (req: express.Request & { user?: UserDocument, idToken?: Auth0IDToken }, res: express.Response) => {
  res.send();
});

// PLANNING ROUTE
router.get('/planning', middleware.isLoggedIn, async (req: express.Request & { user?: UserDocument, idToken?: Auth0IDToken }, res: express.Response) => {
  res.send();
});

// DASHBOARD ROUTE
router.get('/dashboard', middleware.isLoggedIn, async (req: express.Request & { user?: UserDocument, idToken?: Auth0IDToken }, res: express.Response) => {
  try {
    const allParcels = await Parcel.find({ 'owner.id': req.user?._id });
    try {
      const allActivities = await Activity.find({ 'owner.id': req.user?._id });
      allActivities.sort((a, b) => Date.parse(a.start.date.toString()) - Date.parse(b.start.date.toString()));
      allActivities.slice(0, 4);
      res.send({ activities: allActivities, parcels: allParcels });
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
//     res.send("users/new");
// });

// robots.txt
router.get('/robots.txt', async (req: express.Request & { user?: UserDocument, idToken?: Auth0IDToken }, res: express.Response) => {
  res.type('text/plain');
  res.send();
});

// ADMIN PANEL
router.get('/admindash', middleware.adminIsLoggedIn, async (req: express.Request & { user?: UserDocument, idToken?: Auth0IDToken }, res: express.Response) => {
  // GET LOGS

  res.send();
});

// SHOW USER ROUTE
router.get('/users/:id', middleware.checkUserOwnership, async (req: express.Request & { user?: UserDocument, idToken?: Auth0IDToken }, res: express.Response) => {
  try {
    const foundUser = await User.findById(req.params.id).populate('parcels').exec();
    res.send({ user: foundUser });
  } catch (err) {
    console.log(err);
  }
});

// USER EDIT ROUTE
router.get('/users/:id/edit', middleware.checkUserOwnership, async (req: express.Request & { user?: UserDocument, idToken?: Auth0IDToken }, res: express.Response) => {
  try {
    const foundUser = await User.findById(req.params.id);
    res.send({ user: foundUser });
  } catch (err) {
    console.log(err);
  }
});

// USER UPDATE ROUTE
router.put('/users/:id', middleware.checkUserOwnership, async (req: express.Request & { user?: UserDocument, idToken?: Auth0IDToken }, res: express.Response) => {
  try {
    await User.findByIdAndUpdate(req.params.id, req.body.user);
    res.send(`/users/${req.params.id}`);
  } catch (err) {
    console.log(err);
  }
});

// USER DELETE ROUTE
// router.delete("/users/:id", middleware.checkUserOwnership, async function(req: express.Request & { user?: UserDocument, idToken?: Auth0IDToken }, res: express.Response){
//     try {

//         let user = await User.findByIdAndRemove(req.params.id);

//         // Flash message
//         logger.info('User "' + user?.email + '" was deleted', {timestamp: Date.now()});
//         res.send("/logout");
//     }
//     catch (err){
//         console.log(err);
//         // Flash message
//         res.send("/parcels");
//     }
// });

// SET CURRENTPROJECT //
router.put('/users/:id/currentproject', middleware.checkUserOwnership, async (req: express.Request & { user?: UserDocument, idToken?: Auth0IDToken }, res: express.Response) => {
  console.log('im here 2');
  try {
    const foundUser = await User.findById(req.user?.id);
    console.log('im here 3');
    try {
      const foundParcel = await Parcel.findById(req.body.parcelid);
      console.log('im here 4', foundUser, foundParcel);
      if (foundUser && foundParcel) {
        console.log('im here 5');
        foundUser.currentProject = foundParcel.id;
        await foundUser.save();
        console.log(`${foundParcel.name} has been set to active project`);
        res.send(foundUser);
      }
    } catch (err) {
      console.log(err);
    }
  } catch (err) {
    console.log(err);
  }
});

// PARCEL STATUS PAGE
router.get('/parcels/:id/status', middleware.isLoggedIn, async (req: express.Request & { user?: UserDocument, idToken?: Auth0IDToken }, res: express.Response) => {
  // FIND PARCEL
  try {
    const foundParcel = await Parcel.findById(req.params.id).populate({ path: 'layers', populate: { path: 'soiltests' } }).exec();
    res.send({ parcel: foundParcel });
  } catch (err) {
    console.log(err);
  }
});

export default router;

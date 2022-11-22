import express from 'express';
import User, { IUserSchema } from '../models/user';
import Parcel from '../models/parcel';
import Activity from '../models/activity';
import middleware from '../middleware'; // Will automatically require the middleware "index" file as the standard

// import logger from '../middleware/logger';

const router = express.Router();

// ROOT ROUTE
router.get('/', (req: express.Request & { user?: IUserSchema}, res: express.Response) => {
  res.render('login', { user: req.oidc.user });
});

// ABOUT ROUTE
router.get('/about', (req: express.Request & { user?: IUserSchema}, res: express.Response) => {
  res.render('about');
});

// TERMS ROUTE
router.get('/terms', (req: express.Request & { user?: IUserSchema}, res: express.Response) => {
  res.render('terms');
});

// PRIVACY ROUTE
router.get('/privacy', (req: express.Request & { user?: IUserSchema}, res: express.Response) => {
  res.render('privacy');
});

// FEEDBACK ROUTE
router.get('/feedback', middleware.isLoggedIn, (req: express.Request & { user?: IUserSchema}, res: express.Response) => {
  res.render('feedback');
});

// COMPOSITION ROUTE
router.get('/composition', middleware.isLoggedIn, (req: express.Request & { user?: IUserSchema}, res: express.Response) => {
  res.render('composition');
});

// SUCCESSION ROUTE
router.get('/succession', middleware.isLoggedIn, (req: express.Request & { user?: IUserSchema}, res: express.Response) => {
  res.render('succession');
});

// QUESTIONNAIRE ROUTE
router.get('/questionnaire', (req: express.Request & { user?: IUserSchema}, res: express.Response) => {
  res.render('questionnaire');
});

// SUPPORT ROUTE
router.get('/support', (req: express.Request & { user?: IUserSchema}, res: express.Response) => {
  res.render('support');
});

// PLANNING ROUTE
router.get('/planning', middleware.isLoggedIn, (req: express.Request & { user?: IUserSchema}, res: express.Response) => {
  res.render('planning');
});

// DASHBOARD ROUTE
router.get('/dashboard', middleware.isLoggedIn, (req: express.Request & { user?: IUserSchema}, res: express.Response) => {
  // @ts-ignore
  Parcel.find({ 'owner.id': req.user?._id }, (err, allParcels) => {
    if (err) {
      console.log(err);
    } else {
      // @ts-ignore
      Activity.find({ 'owner.id': req.user?._id }, (err, allActivities) => {
        if (err) {
          console.log(err);
        } else {
          allActivities.sort((a, b) => Date.parse(a.start.date.toString()) - Date.parse(b.start.date.toString()));
          allActivities.slice(0, 4);
          res.render('dashboard', { activities: allActivities, parcels: allParcels });
        }
      });
    }
  });
});

// NEW USER ROUTE
// router.get("/users/new", function(req: express.Request & { user?: IUserSchema}, res: express.Response){
//     logger.info('Sign up page requested', {timestamp: Date.now()});
//     res.render("users/new");
// });

// robots.txt
router.get('/robots.txt', (req: express.Request & { user?: IUserSchema}, res: express.Response) => {
  res.type('text/plain');
  res.send('User-agent: *\nDisallow: /');
});

// ADMIN PANEL
router.get('/admindash', middleware.adminIsLoggedIn, (req: express.Request & { user?: IUserSchema}, res: express.Response) => {
  // GET LOGS

  res.render('admin');
});

// SHOW USER ROUTE
router.get('/users/:id', middleware.checkUserOwnership, (req: express.Request & { user?: IUserSchema}, res: express.Response) => {
  User.findById(req.params.id).populate('parcels').exec((err, foundUser) => {
    if (err) {
      console.log(err);
    } else {
      res.render('users/show', { user: foundUser });
    }
  });
});

// USER EDIT ROUTE
router.get('/users/:id/edit', middleware.checkUserOwnership, (req: express.Request & { user?: IUserSchema}, res: express.Response) => {
  User.findById(req.params.id, (err, foundUser) => {
    if (err) {
      console.log(err);
    } else {
      res.render('users/edit', { user: foundUser });
    }
  });
});

// USER UPDATE ROUTE
router.put('/users/:id', middleware.checkUserOwnership, (req: express.Request & { user?: IUserSchema}, res: express.Response) => {
  User.findByIdAndUpdate(req.params.id, req.body.user, (err) => {
    if (err) {
      // flash with updatedUser
      console.log(err);
    } else {
      // flash with updatedUser
      res.redirect(`/users/${req.params.id}`);
    }
  });
});

// USER DELETE ROUTE
// router.delete("/users/:id", middleware.checkUserOwnership, async function(req: express.Request & { user?: IUserSchema}, res: express.Response){
//     try {

//         let user = await User.findByIdAndRemove(req.params.id);

//         // Flash message
//         logger.info('User "' + user?.email + '" was deleted', {timestamp: Date.now()});
//         res.redirect("/logout");
//     }
//     catch (err){
//         console.log(err);
//         // Flash message
//         res.redirect("/parcels");
//     }
// });

// SET CURRENTPROJECT //
router.post('/users/:id/currentproject/', middleware.checkUserOwnership, (req: express.Request & { user?: IUserSchema}, res: express.Response) => {
  // @ts-ignore
  User.findById(req.user?._id, (err, foundUser) => {
    if (err) {
      console.log(err);
    } else {
      Parcel.findById(req.body.parcelid, (err, foundParcel) => {
        if (err) {
          console.log(err);
        } else {
          foundUser.currentProject = foundParcel;
          foundUser.save();
          console.log(`${foundParcel.name} has been set to active project`);
          res.redirect(`/parcels/${foundParcel._id}`);
        }
      });
    }
  });
});

// PARCEL STATUS PAGE
router.get('/parcels/:id/status', middleware.isLoggedIn, (req: express.Request & { user?: IUserSchema}, res: express.Response) => {
  // FIND PARCEL
  Parcel.findById(req.params.id).populate({ path: 'layers', populate: { path: 'soiltests' } }).exec((err, foundParcel) => {
    if (err) {
      console.log(err);
    } else {
      // RENDER ACTIVITIES
      res.render('status', { parcel: foundParcel });
    }
  });
});

export default router;

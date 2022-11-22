import express from 'express';
import NodeGeocoder from 'node-geocoder';
import Nursery from '../models/nursery';
import User, { IUserSchema } from '../models/user';
import middleware from '../middleware';

// NODE GEOCODER CODE
const router = express.Router();

const options: NodeGeocoder.Options = {
  provider: 'google',
  apiKey: process.env.GEOCODER_API_KEY,
  formatter: null,
};

const geocoder = NodeGeocoder(options);

// NURSERY INDEX
router.get('/nurseries', middleware.isLoggedIn, async (req: express.Request & { user?: IUserSchema}, res: express.Response) => {
  // FIND NURSERY BASED ON USER
  Nursery.find({ 'owner.id': req.user?._id }, (err, foundNurseries) => {
    if (err) {
      console.log(err);
    } else {
      console.log(foundNurseries.length);
      res.render('nurseries/index', { nurseries: foundNurseries });
    }
  });
});

// NURSERY NEW
router.get('/nurseries/new', middleware.isLoggedIn, async (req: express.Request & { user?: IUserSchema}, res: express.Response) => {
  // ADMIN LOGIN REQUIRED
  res.render('nurseries/new');
});

// ANIMAL CREATE
router.post('/nurseries', middleware.isLoggedIn, async (req: express.Request & { user?: IUserSchema}, res: express.Response) => {
  // SET INITIAL VARIABLE
  const newNursery = req.body.nursery;
  // GEOLOCATION
  geocoder.geocode(req.body.nursery.location, (err, data) => {
    if (err || !data.length) {
      console.log(err);
      console.log(data);
      return res.redirect('back');
    }
    // SET NEW LATS
    newNursery.lat = data[0].latitude;
    newNursery.lng = data[0].longitude;
    newNursery.location = data[0].formattedAddress;
    Nursery.create(newNursery, (err, createdNursery) => {
      if (err) {
        console.log(err);
      } else {
        // SET OWNERSHIP
        createdNursery.owner.id = req.user?._id;
        createdNursery.save();
        // ADD TO USER
        User.findById(req.user?._id, (err, foundUser) => {
          if (err) {
            console.log(err);
          } else {
            // Add the parcel to the users parcels for referencing
            foundUser.nurseries.push(createdNursery);
            foundUser.save();
            // REDIRECT
            console.log(`Nursery created: ${createdNursery}`);
            res.redirect(`/nurseries/${createdNursery._id}`);
          }
        });
      }
    });
  });
});

// NURSERY SHOW
router.get('/nurseries/:id', middleware.isLoggedIn, async (req: express.Request & { user?: IUserSchema}, res: express.Response) => {
  // DO OWNERSHIP MODEL
  // FIND NURSERY
  Nursery.findById(req.params.id)
    .populate('products')
    .exec((err, foundNursery) => {
      if (err) {
        console.log(err);
      } else {
        // RENDER SHOW PAGE
        res.render('nurseries/show', { nursery: foundNursery });
      }
    });
});

// NURSERY EDIT
router.get('/nurseries/:id/edit', middleware.isLoggedIn, async (req: express.Request & { user?: IUserSchema}, res: express.Response) => {
  // FIND NURSERY
  Nursery.findById(req.params.id, (err, foundNursery) => {
    if (err) {
      console.log(err);
    } else {
      res.render('nurseries/edit', { nursery: foundNursery });
    }
  });
});

// NURSERY UPDATE
router.put('/nurseries/:id', middleware.isLoggedIn, async (req: express.Request & { user?: IUserSchema}, res: express.Response) => {
  // SETUP NEW GEO
  // SET INITIAL VARIABLE
  const newNursery = req.body.nursery;
  // GEOLOCATION
  geocoder.geocode(req.body.nursery.location, async (err, data) => {
    if (err || !data.length) {
      console.log(err);
      console.log(data);
      return res.redirect('back');
    }
    // SET NEW LATS
    newNursery.lat = data[0].latitude;
    newNursery.lng = data[0].longitude;
    newNursery.location = data[0].formattedAddress;
    try {
      const updateNursery = await Nursery.findByIdAndUpdate(
        req.params.id,
        newNursery,
      );
      // REDIRECT
      if (updateNursery) {
        console.log(`Nursery update: ${updateNursery}`);
        res.redirect(`/nurseries/${updateNursery._id}`);
      } else {
        console.log('No updateNursery');
      }
    } catch (err) {
      console.log(err);
    }
  });
});

export default router;

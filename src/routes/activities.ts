import express from 'express';
// import NodeGeocoder from 'node-geocoder';
import unique from 'array-unique';
import Parcel from '../models/parcel.js';
import Activity, { ActivityDocument } from '../models/activity.js';
import Layer from '../models/layer.js';
import Project from '../models/project.js';
import Row from '../models/row.js';
import Area from '../models/area.js';
import middleware from '../middleware/index.js';
import { UserDocument } from '../models/user.js';
import { ISpeciesSchema } from '../models/species.js';
import { Auth0IDToken } from '../app.js';

// NODE GEOCODER CODE

const router = express.Router();

// const options:NodeGeocoder.Options = {
//   provider: 'google',
//   apiKey: process.env.GEOCODER_API_KEY,
//   formatter: null,
// };

// const geocoder = NodeGeocoder(options);

// ACTIVITY INDEX ROUTE
router.get(
  '/activities',
  middleware.isLoggedIn,
  async (
    req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
    res: express.Response,
  ) => {
    // Get all activities from DB
    try {
      const allActivities = await Activity.find({ 'owner.id': req.user?._id });
      allActivities.sort(
        (a, b) => Date.parse(a.start.date.toString())
          - Date.parse(b.start.date.toString()),
      );
      allActivities.slice(0, 4);
      res.send({ activities: allActivities });
    } catch (err) {
      console.log(err);
    }
  },
);

// ACTIVITY NEW ROUTE
router.get(
  '/activities/new',
  middleware.isLoggedIn,
  async (
    req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
    res: express.Response,
  ) => {
    const parcel = undefined;
    console.log(req.body.picked);
    try {
      const foundLayers = await Layer.find({ 'owner.id': req.user?._id });
      // console.log("Reached this far");
      // foundLayers.forEach(function(layer){
      //     console.log(layer.id);
      // });
      res.send({ parcel, layers: foundLayers });
    } catch (err) {
      console.log(err);
    }
  },
);

// ACTIVITY CREATE ROUTE
router.post(
  '/activities',
  middleware.isLoggedIn,
  async (
    req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
    res: express.Response,
  ) => {
    // Create a new experience
    try {
      const createdActivity = await Activity.create(req.body.activity);
      // Add  ID to experience
      createdActivity.owner.id = req.user!;
      createdActivity.status = true;
      // Save the service - Not need if created after this step
      await createdActivity.save();
      res.send('/activities');
      console.log(createdActivity);
    } catch (err) {
      console.log(err);
    }
  },
);

// ACTIVITY SHOW ROUTES
router.get(
  '/activities/:id',
  middleware.isLoggedIn,
  async (
    req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
    res: express.Response,
  ) => {
    try {
      const foundActivity = await Activity.findById(req.params.id)
        .populate('layer')
        .exec();
      if (foundActivity) {
        const dateParts = foundActivity?.start.date.split('-');
        const monthNames = [
          'January',
          'February',
          'March',
          'April',
          'May',
          'June',
          'July',
          'August',
          'September',
          'October',
          'November',
          'December',
        ];
        const monthNumber = parseInt(dateParts[1], 10) - 1;
        const month = monthNames[monthNumber];
        const day = parseInt(dateParts[2], 10);
        res.send({ activity: foundActivity, month, day });
      } else {
        console.log('No activity found');
      }
    } catch (err) {
      console.log(err);
    }
  },
);

// ACTIVITY EDIT ROUTE
router.get(
  '/activities/:id/edit',
  middleware.isLoggedIn,
  async (
    req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
    res: express.Response,
  ) => {
    // MAKE ACTIVITY OWNERSHIP MIDDLEWARE
    // Find specific activity in database
    try {
      const foundActivity = await Activity.findById(req.params.id);

      try {
        const foundLayers = await Layer.find({ 'owner.id': req.user?._id });
        console.log('Reached this far');
        foundLayers.forEach((layer) => {
          console.log(layer.id);
        });
        res.send({ activity: foundActivity, layers: foundLayers });
      } catch (err) {
        console.log(err);
      }
    } catch (err) {
      console.log(err);
    }
  },
);

// ACTIVITY UPDATE ROUTE
router.put(
  '/activities/:id',
  middleware.isLoggedIn,
  async (
    req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
    res: express.Response,
  ) => {
    try {
      const updatedActivity = await Activity.findByIdAndUpdate(
        req.params.id,
        req.body.activity,
      );
      console.log(updatedActivity);
      res.send(`/activities/${req.params.id}`);
    } catch (err) {
      console.log(err);
    }
  },
);

// ACTIVITY STATUS CHANGE ROUTE

// ACTIVITY DELETE ROUTE
router.delete(
  '/activities/:id',
  middleware.isLoggedIn,
  async (
    req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
    res: express.Response,
  ) => {
    // MAKE ACTIVITY OWNERSHIP MIDDLEWARE
    try {
      await Activity.findByIdAndRemove(req.params.id);
      res.send('/activities');
    } catch (err) {
      console.log(err);
      res.send('/activities');
    }
  },
);

// --------------- NESTED ROUTES ---------------- //

// PARCEL ACTIVITIES
router.get(
  '/parcels/:id/activities',
  middleware.isLoggedIn,
  async (
    req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
    res: express.Response,
  ) => {
    // FIND PARCEL
    try {
      const foundParcel = await Parcel.findById(req.params.id)
        .populate({ path: 'layers', populate: { path: 'rows' } })
        .populate({ path: 'layers', populate: { path: 'areas' } })
        .exec();
      // RENDER ACTIVITIES
      res.send({ parcel: foundParcel });
    } catch (err) {
      console.log(err);
    }
  },
);

// PLACE ACTIVITY NEW ROUTE
router.get(
  '/parcels/:id/activities/new',
  middleware.isLoggedIn,
  async (
    req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
    res: express.Response,
  ) => {
    // FIND PLACE ID
    try {
      const foundparcel = Parcel.findById(req.params.id);
      try {
        const foundLayers = await Layer.find({ type: 'patch' });
        console.log('Reached this far');
        foundLayers.forEach((layer) => {
          console.log(layer.id);
        });
        res.send({ parcel: foundparcel, layers: foundLayers });
      } catch (err) {
        console.log(err);
      }
    } catch (err) {
      console.log(err);
      // res.flash(err
    }
  },
);

// PLACE EXPERIENCES CREATE ROUTE
// router.post('/parcels/:id/activities', middleware.isLoggedIn, async (req: express.Request & { user?: UserDocument, idToken?: Auth0IDToken }, res: express.Response) => {
//   // Lookup place using id
//   try {
//     const foundParcel = await Parcel.findById(req.params.id);
//     if (foundParcel) {
//       try {
//         const activity = await Activity.create(req.body.activity);
//         console.log(activity);
//         // Add  ID to task.
//         activity.owner.id = req.user?._id;
//         // Save the task
//         activity.save();
//         // Connect new task to parcel
//         foundParcel.activities.push(activity);
//         foundParcel.save();
//         // Redirect to parcels SHOW page
//         // req.flash("success", "Successfully added comment");
//         res.send(`/parcels/${foundParcel._id}`);
//       } catch (err) {
//         console.log(err);
//       }
//     }
//   } catch (err) {
//     console.log(err);
//     res.send(`/parcels/${req.params.id}`);
//   }
// });

// PROJECT ACTIVITY NEW ROUTE
router.get(
  '/projects/:id/activities/new',
  middleware.isLoggedIn,
  async (
    req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
    res: express.Response,
  ) => {
    try {
      const foundProject = await Project.findById(req.params.id);
      res.send({ project: foundProject });
    } catch (err) {
      console.log(err);
    }
  },
);

// PROJECT ACTIVITY CREATE ROUTE
router.post(
  '/projects/:id/activities',
  middleware.isLoggedIn,
  async (
    req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
    res: express.Response,
  ) => {
    try {
      const foundProject = await Project.findById(req.params.id);
      if (foundProject) {
        try {
          const createdActivity = await Activity.create(req.body.activity);
          // Add ID to task.
          createdActivity.status = true;
          createdActivity.owner.id = req.user!;
          await createdActivity.save();
          // Connect new task to project
          foundProject.activities.push(createdActivity);
          await foundProject.save();
          // Redirect to project SHOW page
          // req.flash("success", "Successfully added comment");
          res.send(`/projects/${foundProject._id}`);
        } catch (err) {
          console.log(err);
        }
      }
    } catch (err) {
      console.log(err);
    }
  },
);

// GENERATE ACTIVITIES
router.get(
  '/projects/:id/generateactivities',
  middleware.isLoggedIn,
  async (
    req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
    res: express.Response,
  ) => {
    // FIND PROJECT
    try {
      const foundProject = await Project.findById(req.params.id)
        .populate({
          path: 'budgets.establishment',
          populate: { path: 'postings' },
        })
        .exec();
      if (foundProject) {
        const activityArray: ActivityDocument[] = [];
        for (
          let i = 0;
          i < foundProject.budgets.establishment.postings.length;
          i++
        ) {
          const activity: any = {
            status: false,
            automated: true,
          };
          if (
            foundProject.budgets.establishment.postings[i].postType
            === 'material'
          ) {
            activity.name = `Acquire: ${foundProject.budgets.establishment.postings[i].name}`;
          } else {
            activity.name = `Perform: ${foundProject.budgets.establishment.postings[i].name}`;
          }
          activityArray.push(activity);
        }
        console.log(`Activity array length${activityArray.length}`);
        try {
          const createdActivities = await Activity.insertMany(activityArray);
          try {
            await Project.findByIdAndUpdate(foundProject._id, {
              $push: { activities: { $each: createdActivities } },
            });
            console.log('Activities added to project implementation plan');
            res.send(`/projects/${foundProject._id}`);
          } catch (err) {
            console.log(err);
          }
        } catch (err) {
          console.log(err);
        }
      }
    } catch (err) {
      console.log(err);
    }
  },
);

// PROJECT EDIT ACTIVITY ROUTE
router.get(
  '/projects/:id/activities/:pid/edit',
  middleware.isLoggedIn,
  async (
    req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
    res: express.Response,
  ) => {
    // FIND PROJECT WITH ACTIVITY
    try {
      const foundProject = await Project.findById(req.params.id);
      try {
        const foundActivity = await Activity.findById(req.params.pid);
        res.send({ project: foundProject, activity: foundActivity });
      } catch (err) {
        console.log(err);
      }
    } catch (err) {
      console.log(err);
    }
  },
);

// PROJECT UPDATE ACTIVITY ROUTE
router.put(
  '/projects/:id/activities/:pid',
  middleware.isLoggedIn,
  async (
    req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
    res: express.Response,
  ) => {
    // FIND ACTIVITY AND UPDATE
    try {
      await Activity.findByIdAndUpdate(req.params.pid, req.body.activity);
      res.send(`/projects/${req.params.id}`);
    } catch (err) {
      console.log(err);
    }
  },
);

// DELETE ACTIVITY IN PROJECT
router.delete(
  '/projects/:id/activities/:pid',
  middleware.isLoggedIn,
  async (
    req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
    res: express.Response,
  ) => {
    // FIND ACTIVITY
    try {
      const foundActivity = await Activity.findById(req.params.pid);

      // FIND PROJECT
      try {
        const updatedProject = await Project.findById(req.params.id);
        if (updatedProject) {
          // REMOVE ACTIVITY FROM PROJECT
          updatedProject.activities.forEach(async (activity) => {
            if (activity._id === foundActivity?._id) {
              await activity.deleteOne();
            }
          });
          await updatedProject.save();
          // DELETE ACTIVITY
          try {
            await Activity.findByIdAndRemove(req.params.pid);
            res.send(`/projects/${updatedProject._id}`);
          } catch (err) {
            console.log(err);
          }
        }
      } catch (err) {
        console.log(err);
      }
    } catch (err) {
      console.log(err);
    }
  },
);

// --------------- NESTED ROUTES ROW BASED ---------------- //

router.get(
  '/parcels/:id/layers/:pid/rows/:rid/activities/new',
  middleware.isLoggedIn,
  async (
    req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
    res: express.Response,
  ) => {
    // FIND ROW SEQUENCE SPECIES
    try {
      const foundRow = await Row.findById(req.params.rid)
        .populate({ path: 'sequence', populate: { path: 'model.species' } })
        .exec();
      // FIND ALL SPECIES
      if (foundRow && foundRow.sequence) {
        console.log('species there');
        const allSpecies: ISpeciesSchema[] = [];
        foundRow.sequence.model.forEach((species) => {
          allSpecies.push(species.species);
        });
        // FIND UNIQUE SPECIES / REMOVE DUPLICATES
        const uniqueSpecies = unique(allSpecies);
        console.log(uniqueSpecies);
        res.send({
          parcelid: req.params.id,
          layerid: req.params.pid,
          rowid: req.params.rid,
          row: foundRow,
          species: uniqueSpecies,
        });
      } else {
        res.status(400).send({ error: 'Row with the requested id does not exist' });
      }
    } catch (err) {
      console.log(err);
    }
  },
);

router.post(
  '/parcels/:id/layers/:pid/rows/:rid/activities',
  middleware.isLoggedIn,
  async (
    req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
    res: express.Response,
  ) => {
    // CREATE ACTIVITY
    const types = req.body.activityType.split(' ');
    const activity = {
      activityType: types[0],
      subtype: types[1],
      name: req.body.activity.name,
      description: req.body.activity.description,
      start: {
        date: req.body.activity.start.date,
      },
      time: req.body.activity.time,
      species: req.body.activity.species,
    };
    try {
      const createdActivity = await Activity.create(activity);
      try {
        await Row.findByIdAndUpdate(req.params.rid, {
          $push: { activities: createdActivity },
        });
        res.send(`/parcels/${req.params.id}/activities`);
      } catch (err) {
        console.log(err);
      }
    } catch (err) {
      console.log(err);
    }
  },
);

// --------------- NESTED ROUTES AREA BASED ---------------- //

router.get(
  '/parcels/:id/layers/:pid/areas/:rid/activities/new',
  middleware.isLoggedIn,
  async (
    req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
    res: express.Response,
  ) => {
    // FIND AREA ROTATION SPECIES

    try {
      const foundArea = await Area.findById(req.params.rid)
        .populate({
          path: 'rotation',
          populate: { path: 'model.speciesmix.species' },
        })
        .exec();
      // FIND ALL SPECIES
      if (foundArea && foundArea.rotation) {
        console.log('species there');
        const allSpecies: ISpeciesSchema[] = [];
        foundArea.rotation.model.forEach((speciesmix) => {
          allSpecies.push(speciesmix.speciesmix[0].species);
        });
        // FIND UNIQUE SPECIES / REMOVE DUPLICATES
        const uniqueSpecies = unique(allSpecies);
        console.log(uniqueSpecies);
        res.send({
          parcelid: req.params.id,
          layerid: req.params.pid,
          areaid: req.params.rid,
          area: foundArea,
          species: uniqueSpecies,
        });
      } else {
        res.send({ error: 'Area with the requested id does not exist' });
      }
    } catch (err) {
      console.log(err);
    }
  },
);

router.post(
  '/parcels/:id/layers/:pid/areas/:rid/activities',
  middleware.isLoggedIn,
  async (
    req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
    res: express.Response,
  ) => {
    // CREATE ACTIVITY
    const types = req.body.activityType.split(' ');
    const activity = {
      activityType: types[0],
      subtype: types[1],
      name: req.body.activity.name,
      description: req.body.activity.description,
      start: {
        date: req.body.activity.start.date,
      },
      time: req.body.activity.time,
      species: req.body.activity.species,
    };
    try {
      const createdActivity = await Activity.create(activity);
      try {
        await Area.findByIdAndUpdate(req.params.rid, {
          $push: { activities: createdActivity },
        });
        res.send(`/parcels/${req.params.id}/activities`);
      } catch (err) {
        console.log(err);
      }
    } catch (err) {
      console.log(err);
    }
  },
);

export default router;

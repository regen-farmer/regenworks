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
import { Auth0IDToken, Variables } from '../app.js';

// NODE GEOCODER CODE

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

// const options:NodeGeocoder.Options = {
//   provider: 'google',
//   apiKey: process.env.GEOCODER_API_KEY,
//   formatter: null,
// };

// const geocoder = NodeGeocoder(options);

// ACTIVITY INDEX ROUTE
router.get(
  '/activities',
  async (c) => {
    await middleware.isLoggedIn(c)
    // Get all activities from DB
    try {
      const allActivities = await Activity.find({ 'owner.id': c.get('user')?._id });
      allActivities.sort(
        (a, b) => Date.parse(a.start.date.toString())
          - Date.parse(b.start.date.toString()),
      );
      allActivities.slice(0, 4);
      return c.json({ activities: allActivities });
    } catch (err) {
      console.log(err);
    }
  },
);

// ACTIVITY NEW ROUTE
router.get(
  '/activities/new',
  async (c) => {
    await middleware.isLoggedIn(c);
    const parcel = undefined;
    console.log((await c.req.json()).picked);
    try {
      const foundLayers = await Layer.find({ 'owner.id': c.get('user')?._id });
      // console.log("Reached this far");
      // foundLayers.forEach(function(layer){
      //     console.log(layer.id);
      // });
      return c.json({ parcel, layers: foundLayers });
    } catch (err) {
      console.log(err);
    }
  },
);

// ACTIVITY CREATE ROUTE
router.post(
  '/activities',
  async (c) => {
    await middleware.isLoggedIn(c)
    // Create a new experience
    try {
      const createdActivity = await Activity.create((await c.req.json()).activity);
      // Add  ID to experience
      createdActivity.owner.id = c.get('user')!;
      createdActivity.status = true;
      // Save the service - Not need if created after this step
      await createdActivity.save();
      return c.json('/activities');
      console.log(createdActivity);
    } catch (err) {
      console.log(err);
    }
  },
);

// ACTIVITY SHOW ROUTES
router.get(
  '/activities/:entityid',
  async (c) => {
    await middleware.isLoggedIn(c)
    try {
      const foundActivity = await Activity.findById(c.req.param('entityid'))
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
        return c.json({ activity: foundActivity, month, day });
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
  '/activities/:entityid/edit',
  async (c) => {
    await middleware.isLoggedIn(c)
    // MAKE ACTIVITY OWNERSHIP MIDDLEWARE
    // Find specific activity in database
    try {
      const foundActivity = await Activity.findById(c.req.param('entityid'));

      try {
        const foundLayers = await Layer.find({ 'owner.id': c.get('user')?._id });
        console.log('Reached this far');
        foundLayers.forEach((layer) => {
          console.log(layer.id);
        });
        return c.json({ activity: foundActivity, layers: foundLayers });
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
  '/activities/:entityid',
  async (c) => {
    await middleware.isLoggedIn(c)
    try {
      const updatedActivity = await Activity.findByIdAndUpdate(
        c.req.param('entityid'),
        (await c.req.json()).activity,
      );
      console.log(updatedActivity);
      return c.json(`/activities/${c.req.param('entityid')}`);
    } catch (err) {
      console.log(err);
    }
  },
);

// ACTIVITY STATUS CHANGE ROUTE

// ACTIVITY DELETE ROUTE
router.delete(
  '/activities/:entityid',
  async (c) => {
    await middleware.isLoggedIn(c)
    // MAKE ACTIVITY OWNERSHIP MIDDLEWARE
    try {
      await Activity.findByIdAndRemove(c.req.param('entityid'));
      return c.json('/activities');
    } catch (err) {
      console.log(err);
      return c.json('/activities');
    }
  },
);

// --------------- NESTED ROUTES ---------------- //

// PARCEL ACTIVITIES
router.get(
  '/parcels/:entityid/activities',
  async (c) => {
    await middleware.isLoggedIn(c)
    // FIND PARCEL
    try {
      const foundParcel = await Parcel.findById(c.req.param('entityid'))
        .populate({ path: 'layers', populate: { path: 'rows' } })
        .populate({ path: 'layers', populate: { path: 'areas' } })
        .exec();
      // RENDER ACTIVITIES
      return c.json({ parcel: foundParcel });
    } catch (err) {
      console.log(err);
    }
  },
);

// PLACE ACTIVITY NEW ROUTE
router.get(
  '/parcels/:entityid/activities/new',
  async (c) => {
    await middleware.isLoggedIn(c)
    // FIND PLACE ID
    try {
      const foundparcel = Parcel.findById(c.req.param('entityid'));
      try {
        const foundLayers = await Layer.find({ type: 'patch' });
        console.log('Reached this far');
        foundLayers.forEach((layer) => {
          console.log(layer.id);
        });
        return c.json({ parcel: foundparcel, layers: foundLayers });
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
// router.post('/parcels/:entityid/activities', async (c) => {
// await middleware.isLoggedIn(c);
//   // Lookup place using id
//   try {
//     const foundParcel = await Parcel.findById(c.req.param('entityid'));
//     if (foundParcel) {
//       try {
//         const activity = await Activity.create((await c.req.json()).activity);
//         console.log(activity);
//         // Add  ID to task.
//         activity.owner.id = c.get('user')?._id;
//         // Save the task
//         activity.save();
//         // Connect new task to parcel
//         foundParcel.activities.push(activity);
//         foundParcel.save();
//         // Redirect to parcels SHOW page
//         // req.flash("success", "Successfully added comment");
//         return c.json(`/parcels/${foundParcel._id}`);
//       } catch (err) {
//         console.log(err);
//       }
//     }
//   } catch (err) {
//     console.log(err);
//     return c.json(`/parcels/${c.req.param('entityid')}`);
//   }
// });

// PROJECT ACTIVITY NEW ROUTE
router.get(
  '/projects/:entityid/activities/new',
  async (c) => {
    await middleware.isLoggedIn(c)
    try {
      const foundProject = await Project.findById(c.req.param('entityid'));
      return c.json({ project: foundProject });
    } catch (err) {
      console.log(err);
    }
  },
);

// PROJECT ACTIVITY CREATE ROUTE
router.post(
  '/projects/:entityid/activities',
  async (c) => {
    await middleware.isLoggedIn(c)
    try {
      const foundProject = await Project.findById(c.req.param('entityid'));
      if (foundProject) {
        try {
          const createdActivity = await Activity.create((await c.req.json()).activity);
          // Add ID to task.
          createdActivity.status = true;
          createdActivity.owner.id = c.get('user')!;
          await createdActivity.save();
          // Connect new task to project
          foundProject.activities.push(createdActivity);
          await foundProject.save();
          // Redirect to project SHOW page
          // req.flash("success", "Successfully added comment");
          return c.json(`/projects/${foundProject._id}`);
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
  '/projects/:entityid/generateactivities',
  async (c) => {
    await middleware.isLoggedIn(c)
    // FIND PROJECT
    try {
      const foundProject = await Project.findById(c.req.param('entityid'))
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
            return c.json(`/projects/${foundProject._id}`);
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
  '/projects/:entityid/activities/:pid/edit',
  async (c) => {
    await middleware.isLoggedIn(c)
    // FIND PROJECT WITH ACTIVITY
    try {
      const foundProject = await Project.findById(c.req.param('entityid'));
      try {
        const foundActivity = await Activity.findById(c.req.param('pid'));
        return c.json({ project: foundProject, activity: foundActivity });
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
  '/projects/:entityid/activities/:pid',
  async (c) => {
    await middleware.isLoggedIn(c)
    // FIND ACTIVITY AND UPDATE
    try {
      await Activity.findByIdAndUpdate(c.req.param('pid'), (await c.req.json()).activity);
      return c.json(`/projects/${c.req.param('entityid')}`);
    } catch (err) {
      console.log(err);
    }
  },
);

// DELETE ACTIVITY IN PROJECT
router.delete(
  '/projects/:entityid/activities/:pid',
  async (c) => {
    await middleware.isLoggedIn(c)
    // FIND ACTIVITY
    try {
      const foundActivity = await Activity.findById(c.req.param('pid'));

      // FIND PROJECT
      try {
        const updatedProject = await Project.findById(c.req.param('entityid'));
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
            await Activity.findByIdAndRemove(c.req.param('pid'));
            return c.json(`/projects/${updatedProject._id}`);
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
  '/parcels/:entityid/layers/:pid/rows/:rid/activities/new',
  async (c) => {
    await middleware.isLoggedIn(c)
    // FIND ROW SEQUENCE SPECIES
    try {
      const foundRow = await Row.findById(c.req.param('rid'))
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
        return c.json({
          parcelid: c.req.param('entityid'),
          layerid: c.req.param('pid'),
          rowid: c.req.param('rid'),
          row: foundRow,
          species: uniqueSpecies,
        });
      } else {
        c.status(400)
        return c.json({ error: 'Row with the requested id does not exist' });
      }
    } catch (err) {
      console.log(err);
    }
  },
);

router.post(
  '/parcels/:entityid/layers/:pid/rows/:rid/activities',
  async (c) => {
    await middleware.isLoggedIn(c)
    // CREATE ACTIVITY
    const types = (await c.req.json()).activityType.split(' ');
    const activity = {
      activityType: types[0],
      subtype: types[1],
      name: (await c.req.json()).activity.name,
      description: (await c.req.json()).activity.description,
      start: {
        date: (await c.req.json()).activity.start.date,
      },
      time: (await c.req.json()).activity.time,
      species: (await c.req.json()).activity.species,
    };
    try {
      const createdActivity = await Activity.create(activity);
      try {
        await Row.findByIdAndUpdate(c.req.param('rid'), {
          $push: { activities: createdActivity },
        });
        return c.json(`/parcels/${c.req.param('entityid')}/activities`);
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
  '/parcels/:entityid/layers/:pid/areas/:rid/activities/new',
  async (c) => {
    await middleware.isLoggedIn(c)
    // FIND AREA ROTATION SPECIES

    try {
      const foundArea = await Area.findById(c.req.param('rid'))
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
        return c.json({
          parcelid: c.req.param('entityid'),
          layerid: c.req.param('pid'),
          areaid: c.req.param('rid'),
          area: foundArea,
          species: uniqueSpecies,
        });
      } else {
        return c.json({ error: 'Area with the requested id does not exist' });
      }
    } catch (err) {
      console.log(err);
    }
  },
);

router.post(
  '/parcels/:entityid/layers/:pid/areas/:rid/activities',
  async (c) => {
    await middleware.isLoggedIn(c)
    // CREATE ACTIVITY
    const types = (await c.req.json()).activityType.split(' ');
    const activity = {
      activityType: types[0],
      subtype: types[1],
      name: (await c.req.json()).activity.name,
      description: (await c.req.json()).activity.description,
      start: {
        date: (await c.req.json()).activity.start.date,
      },
      time: (await c.req.json()).activity.time,
      species: (await c.req.json()).activity.species,
    };
    try {
      const createdActivity = await Activity.create(activity);
      try {
        await Area.findByIdAndUpdate(c.req.param('rid'), {
          $push: { activities: createdActivity },
        });
        return c.json(`/parcels/${c.req.param('entityid')}/activities`);
      } catch (err) {
        console.log(err);
      }
    } catch (err) {
      console.log(err);
    }
  },
);
}


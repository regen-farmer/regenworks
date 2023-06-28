import express from 'express';
import Sequence from '../models/sequence.js';
import Layer from '../models/layer.js';
import Project from '../models/project.js';
import Species from '../models/species.js';
import middleware from '../middleware/index.js';
import { UserDocument } from '../models/user.js';
import { Auth0IDToken, Variables } from '../app.js';

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

// SEQUENCE NEW
router.get(
  '/layers/:entityid/sequences/new',
  async (c) => {
    await middleware.isLoggedIn(c)
    // FIND LAYER
    try {
      const foundLayer = await Layer.findById(c.req.param('entityid'));
      // FIND ALL SPECIES
      try {
        const foundSpecies = await Species.find();
        // SORT SPECIES

        foundSpecies.sort((a, b) => {
          if (a.genus < b.genus) {
            return -1;
          }
          if (a.genus > b.genus) {
            return 1;
          }
          return 0;
        });
        return c.json({
          layer: foundLayer,
          project: '',
          species: foundSpecies,
        });
      } catch (err) {
        console.log(err);
      }
    } catch (err) {
      console.log(err);
    }
  },
);

// SEQUENCE CREATE
router.post(
  '/layers/:entityid/sequences',
  async (c) => {
    await middleware.isLoggedIn(c)
    // FIND LAYER
    try {
      const foundLayer = await Layer.findById(c.req.param('entityid'));
      if (foundLayer) {
        try {
          const createdSequence = await Sequence.create((await c.req.json()).sequence);
          // SAVE SEQUENCE ON LAYER?
          createdSequence.owner.id = c.get('user')?._id.toString()!;
          await createdSequence.save();

          return c.json(createdSequence);
        } catch (err) {
          console.log(err);
        }
      }
    } catch (err) {
      console.log(err);
    }
  },
);

// SEQUENCE SHOW
router.get(
  '/layers/:entityid/sequences/:pid',
  async (c) => {
    await middleware.isLoggedIn(c)
    // FIND LAYER
    try {
      const foundLayer = await Layer.findById(c.req.param('entityid'));
      // FIND SEQUENCE
      try {
        const foundSequence = await Sequence.findById(c.req.param('pid'));

        return c.json({
          layer: foundLayer,
          sequence: foundSequence,
        });
      } catch (err) {
        console.log(err);
      }
    } catch (err) {
      console.log(err);
    }
  },
);

// SEQUENCE EDIT
router.get(
  '/layers/:entityid/sequences/:pid/edit',
  async (c) => {
    await middleware.isLoggedIn(c)
    // FIND LAYER
    try {
      const foundLayer = await Layer.findById(c.req.param('entityid'))
        .populate({ path: 'rows.sequence', populate: { path: 'model.species' } })
        .exec();
        // FIND SEQUENCES
      try {
        const foundSequence = await Sequence.findById(c.req.param('pid'))
          .populate('model.species')
          .exec();
        if (foundSequence) {
          // FIND ALL SPECIES
          const foundSpecies = await Species.find();

          // SORT SPECIES

          foundSpecies.sort((a, b) => {
            if (a.genus < b.genus) {
              return -1;
            }
            if (a.genus > b.genus) {
              return 1;
            }
            return 0;
          });
          // CALCULATE LENGTH
          let length = 0;
          if (foundSequence.sequencelength) {
            length = foundSequence.sequencelength;
          }
          // CALCULATE DISTANCE
          const distanceArray: number[] = [];
          for (let i = 0; i < foundSequence.model.length; i++) {
            distanceArray.push(foundSequence.model[i].position);
          }
          //
          const distanceDifference: number[] = [];
          for (let i = 0; i < distanceArray.length; i++) {
            for (let j = 0; j < distanceArray.length; j++) {
              if (distanceArray[i] !== distanceArray[j]) {
                distanceDifference.push(
                  Math.abs(distanceArray[i] - distanceArray[j]),
                );
              }
            }
          }
          // SORT DIFFERENCE IN DISTANCE
          function compare3(a: number, b: number) {
            if (a < b) {
              return -1;
            }
            if (a > b) {
              return 1;
            }
            return 0;
          }
          // CALCULATE LENGTH
          distanceArray.sort(compare3);
          distanceDifference.sort(compare3);
          let distance = 1;
          if (
            distanceDifference[0] > distanceArray[0]
              || distanceDifference.length === 0
          ) {
            distance = distanceArray[0];
          } else {
            distance = distanceDifference[0];
          }
          return c.json({
            layer: foundLayer,
            project: '',
            sequence: foundSequence,
            species: foundSpecies,
            length,
            distance,
          });
        } else {
          console.log('No foundSequence');
        }
      } catch (err) {
        console.log(err);
      }
    } catch (err) {
      console.log(err);
    }
  },
);

// SEQUENCE UPDATE
router.put(
  '/layers/:layerid/sequences/:sequenceid',
  async (c) => {
    await middleware.isLoggedIn(c)
    // FIND LAYER
    try {
      const foundLayer = await Layer.findById(c.req.param('layerid'));
      try {
        await Sequence.findByIdAndUpdate(c.req.param('sequenceid'), (await c.req.json()).sequence);
        if (foundLayer) {
          return c.json({});
        }
      } catch (err) {
        console.log(err);
      }
    } catch (err) {
      console.log(err);
    }
  },
);

// SEQUENCE DELETE ROUTE

/// ----------- PROJECT ROUTES ---------

// SEQUENCE NEW
router.get(
  '/projects/:entityid/sequences/new',
  async (c) => {
    await middleware.isLoggedIn(c)
    // FIND LAYER
    try {
      const foundProject = await Project.findById(c.req.param('entityid'));
      // FIND ALL SPECIES
      try {
        const foundSpecies = await Species.find();
        // SORT SPECIES
        foundSpecies.sort((a, b) => {
          if (a.genus < b.genus) {
            return -1;
          }
          if (a.genus > b.genus) {
            return 1;
          }
          return 0;
        });
        return c.json({
          project: foundProject,
          species: foundSpecies,
          distance: c.req.query('distance'),
          length: c.req.query('length'),
        });
      } catch (err) {
        console.log(err);
      }
    } catch (err) {
      console.log(err);
    }
  },
);

// SEQUENCE CREATE
router.post(
  '/projects/:entityid/sequences',
  async (c) => {
    await middleware.isLoggedIn(c)
    // FIND LAYER
    try {
      const foundProject = await Project.findById(c.req.param('entityid'));

      if (foundProject) {
        try {
          const createdSequence = await Sequence.create((await c.req.json()).sequence);

          // SAVE SEQUENCE ON LAYER?
          createdSequence.owner.id = c.get('user')?._id.toString()!;
          await createdSequence.save();

          return c.json(createdSequence);
        } catch (err) {
          console.log(err);
        }
      }
    } catch (err) {
      console.log(err);
    }
  },
);

// PROJECT SEQUENCE EDIT ROUTE
router.get(
  '/projects/:entityid/sequences/:pid/edit',
  async (c) => {
    await middleware.isLoggedIn(c)
    // FIND LAYER
    try {
      const foundProject = await Project.findById(c.req.param('entityid'))
        .populate({
          path: 'rows.sequence',
          populate: { path: 'model.species' },
        })
        .exec();
      // FIND SEQUENCES
      try {
        const foundSequence = await Sequence.findById(c.req.param('pid'))
          .populate('model.species')
          .exec();

        if (foundSequence) {
          // FIND ALL SPECIES
          const foundSpecies = await Species.find();
          // SORT SPECIES

          foundSpecies.sort((a, b) => {
            if (a.genus < b.genus) {
              return -1;
            }
            if (a.genus > b.genus) {
              return 1;
            }
            return 0;
          });
          // CALCULATE LENGTH
          let length = 0;
          if (foundSequence.sequencelength) {
            length = foundSequence.sequencelength;
          }
          // CALCULATE DISTANCE
          const distanceArray: number[] = [];
          for (let i = 0; i < foundSequence.model.length; i++) {
            distanceArray.push(foundSequence.model[i].position);
          }
          //
          const distanceDifference: number[] = [];
          for (let i = 0; i < distanceArray.length; i++) {
            for (let j = 0; j < distanceArray.length; j++) {
              if (distanceArray[i] !== distanceArray[j]) {
                distanceDifference.push(
                  Math.abs(distanceArray[i] - distanceArray[j]),
                );
              }
            }
          }
          // SORT DIFFERENCE IN DISTANCE
          function compare3(a: number, b: number) {
            if (a < b) {
              return -1;
            }
            if (a > b) {
              return 1;
            }
            return 0;
          }
          // CALCULATE LENGTH
          distanceArray.sort(compare3);
          distanceDifference.sort(compare3);
          let distance = 1;
          if (
            distanceDifference[0] > distanceArray[0]
            || distanceDifference.length === 0
          ) {
            distance = distanceArray[0];
          } else {
            distance = distanceDifference[0];
          }
          return c.json({
            project: foundProject,
            sequence: foundSequence,
            species: foundSpecies,
            length,
            distance,
          });
        } else {
          console.log('No foundSequence');
        }
      } catch (err) {
        console.log(err);
      }
    } catch (err) {
      console.log(err);
    }
  },
);

// PROJECT SEQUENCE UPDATE
router.put(
  '/projects/:entityid/sequences/:pid',
  async (c) => {
    await middleware.isLoggedIn(c)
    // FIND LAYER
    try {
      const foundProject = await Project.findById(c.req.param('entityid'));
      console.log('FP', foundProject);
      try {
        await Sequence.findByIdAndUpdate(c.req.param('pid'), (await c.req.json()).sequence);
        if (foundProject) {
          return c.json({});
        }
      } catch (err) {
        console.log(err);
      }
    } catch (err) {
      console.log(err);
    }
  },
);

router.patch('/sequence/:entityid/financials/activities', async (c) => {
await middleware.isLoggedIn(c);
  const sequence = await Sequence.findById(c.req.param('entityid'));

  const newActivities: [{
    id: string,
    activities: [{
      activityType: string;
      subtype: string;
      name: string;
      time: {
        startMonth: number;
        endMonth: number;
      };
      price: number;
    }]

  }] = (await c.req.json()).map((newactivity) => ({
    id: newactivity.id,
    activities: newactivity.activities.filter((el) => el !== 'none').map((el) => JSON.parse(el)),
  }));

  sequence!.uniqueSpecies.forEach((uniqueSpecies) => {
    const match = newActivities.find((el) => el.id === uniqueSpecies.id.toString());

    if (match) {
      uniqueSpecies.activities = match!.activities;
    }
  });

  await sequence?.save();

  return c.json({});
});

}

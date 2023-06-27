import express from 'express';
import Sequence from '../models/sequence.js';
import Layer from '../models/layer.js';
import Project from '../models/project.js';
import Species from '../models/species.js';
import middleware from '../middleware/index.js';
import { UserDocument } from '../models/user.js';
import { Auth0IDToken } from '../app.js';

const router = express.Router();

// SEQUENCE NEW
router.get(
  '/layers/:id/sequences/new',
  middleware.isLoggedIn,
  async (req: express.Request & { user?: UserDocument, idToken?: Auth0IDToken }, res: express.Response) => {
    // FIND LAYER
    try {
      const foundLayer = await Layer.findById(req.params.id);
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
        res.send({
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
  '/layers/:id/sequences',
  middleware.isLoggedIn,
  async (req: express.Request & { user?: UserDocument, idToken?: Auth0IDToken }, res: express.Response) => {
    // FIND LAYER
    try {
      const foundLayer = await Layer.findById(req.params.id);
      if (foundLayer) {
        try {
          const createdSequence = await Sequence.create(req.body.sequence);
          // SAVE SEQUENCE ON LAYER?
          createdSequence.owner.id = req.user?._id.toString()!;
          await createdSequence.save();

          res.send(createdSequence);
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
  '/layers/:id/sequences/:pid',
  middleware.isLoggedIn,
  async (req: express.Request & { user?: UserDocument, idToken?: Auth0IDToken }, res: express.Response) => {
    // FIND LAYER
    try {
      const foundLayer = await Layer.findById(req.params.id);
      // FIND SEQUENCE
      try {
        const foundSequence = await Sequence.findById(req.params.pid);

        res.send({
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
  '/layers/:id/sequences/:pid/edit',
  middleware.isLoggedIn,
  async (req: express.Request & { user?: UserDocument, idToken?: Auth0IDToken }, res: express.Response) => {
    // FIND LAYER
    try {
      const foundLayer = await Layer.findById(req.params.id)
        .populate({ path: 'rows.sequence', populate: { path: 'model.species' } })
        .exec();
        // FIND SEQUENCES
      try {
        const foundSequence = await Sequence.findById(req.params.pid)
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
          res.send({
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
  middleware.isLoggedIn,
  async (req: express.Request & { user?: UserDocument, idToken?: Auth0IDToken }, res: express.Response) => {
    // FIND LAYER
    try {
      const foundLayer = await Layer.findById(req.params.layerid);
      try {
        await Sequence.findByIdAndUpdate(req.params.sequenceid, req.body.sequence);
        if (foundLayer) {
          res.send({});
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
  '/projects/:id/sequences/new',
  middleware.isLoggedIn,
  async (req: express.Request & { user?: UserDocument, idToken?: Auth0IDToken }, res: express.Response) => {
    // FIND LAYER
    try {
      const foundProject = await Project.findById(req.params.id);
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
        res.send({
          project: foundProject,
          species: foundSpecies,
          distance: req.query.distance,
          length: req.query.length,
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
  '/projects/:id/sequences',
  middleware.isLoggedIn,
  async (req: express.Request & { user?: UserDocument, idToken?: Auth0IDToken }, res: express.Response) => {
    // FIND LAYER
    try {
      const foundProject = await Project.findById(req.params.id);

      if (foundProject) {
        try {
          const createdSequence = await Sequence.create(req.body.sequence);

          // SAVE SEQUENCE ON LAYER?
          createdSequence.owner.id = req.user?._id.toString()!;
          await createdSequence.save();

          res.send(createdSequence);
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
  '/projects/:id/sequences/:pid/edit',
  middleware.isLoggedIn,
  async (req: express.Request & { user?: UserDocument, idToken?: Auth0IDToken }, res: express.Response) => {
    // FIND LAYER
    try {
      const foundProject = await Project.findById(req.params.id)
        .populate({
          path: 'rows.sequence',
          populate: { path: 'model.species' },
        })
        .exec();
      // FIND SEQUENCES
      try {
        const foundSequence = await Sequence.findById(req.params.pid)
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
          res.send({
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
  '/projects/:id/sequences/:pid',
  middleware.isLoggedIn,
  async (req: express.Request & { user?: UserDocument, idToken?: Auth0IDToken }, res: express.Response) => {
    // FIND LAYER
    try {
      const foundProject = await Project.findById(req.params.id);
      console.log('FP', foundProject);
      try {
        await Sequence.findByIdAndUpdate(req.params.pid, req.body.sequence);
        if (foundProject) {
          res.send();
        }
      } catch (err) {
        console.log(err);
      }
    } catch (err) {
      console.log(err);
    }
  },
);

router.patch('/sequence/:id/financials/activities', middleware.isLoggedIn, async (req: express.Request & { user?: UserDocument, idToken?: Auth0IDToken }, res: express.Response) => {
  const sequence = await Sequence.findById(req.params.id);

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

  }] = req.body.map((newactivity) => ({
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

  res.send();
});

export default router;

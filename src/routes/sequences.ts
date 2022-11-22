import express from 'express';
import Sequence from '../models/sequence';
import Layer from '../models/layer';
import Project from '../models/project';
import Species from '../models/species';
import middleware from '../middleware';
import { IUserSchema } from '../models/user';

const router = express.Router();

// SEQUENCE INDEX

// NEW AREA SYSTEM GRID NEW ROUTE
router.get(
  '/layers/:id/sequences/spacing',
  middleware.isLoggedIn,
  (req: express.Request & { user?: IUserSchema}, res: express.Response) => {
    // FIND LAYER
    Layer.findById(req.params.id, (err, foundLayer) => {
      if (err) {
        console.log(err);
      } else {
        res.render('sequences/spacing', { layer: foundLayer, project: '' });
      }
    });
  },
);

// NEW AREA SYSTEM GRID REDIRECT ROUTE
router.post(
  '/layers/:id/sequences/spacing',
  middleware.isLoggedIn,
  (req: express.Request & { user?: IUserSchema}, res: express.Response) => {
    // CHECK LENGTH IS DIVISIBLE
    if ((req.body.length / req.body.distance) % 1 === 0) {
      // FIND LAYER
      Layer.findById(req.params.id, (err, foundLayer) => {
        if (err) {
          console.log(err);
        } else {
          res.redirect(
            `/layers/${
              foundLayer._id
            }/sequences/new?distance=${
              req.body.distance
            }&length=${
              req.body.length}`,
          );
        }
      });
    } else {
      console.log(
        'error',
        'Length must be divisible with distance between species in sequence.',
      );
      res.redirect('back');
    }
  },
);

// SEQUENCE NEW
router.get(
  '/layers/:id/sequences/new',
  middleware.isLoggedIn,
  (req: express.Request & { user?: IUserSchema}, res: express.Response) => {
    // FIND LAYER
    Layer.findById(req.params.id, (err, foundLayer) => {
      if (err) {
        console.log(err);
      } else {
        // FIND ALL SPECIES
        Species.find((err, foundSpecies) => {
          if (err) {
            console.log(err);
          } else {
            // SORT SPECIES
            function compare(a, b) {
              if (a.genus < b.genus) {
                return -1;
              }
              if (a.genus > b.genus) {
                return 1;
              }
              return 0;
            }
            foundSpecies.sort(compare);
            res.render('sequences/new', {
              layer: foundLayer,
              project: '',
              species: foundSpecies,
              distance: req.query.distance,
              length: req.query.length,
            });
          }
        });
      }
    });
  },
);

// SEQUENCE CREATE
router.post(
  '/layers/:id/sequences',
  middleware.isLoggedIn,
  (req: express.Request & { user?: IUserSchema}, res: express.Response) => {
    // FIND LAYER
    Layer.findById(req.params.id, (err, foundLayer) => {
      if (err) {
        console.log(err);
      } else {
        // MODEL VARIABLES
        const model: any[] = [];
        let length = 0;
        // CHECK IF ARRAY?
        if (!(req.body.model.species instanceof Array)) {
          const species = {
            species: req.body.model.species,
            position: Number(req.body.model.position),
          };
          model.push(species);
          length = Number(req.body.model.position);
        } else {
          for (let i = 0; i < req.body.model.species.length; i++) {
            // FIX IF ONLY ONE ITEM IN ROW
            // IF SPECIES ID IS NULL
            if (!(req.body.model.species[i] === '')) {
              const species = {
                species: req.body.model.species[i],
                position: Number(req.body.model.position[i]),
              };
              model.push(species);
            }
            if (Number(req.body.model.position[i]) > length) {
              length = Number(req.body.model.position[i]);
            }
          }
        }
        const sequence = req.body.sequence;
        sequence.model = model;
        sequence.sequencelength = length;
        Sequence.create(sequence, (err, createdSequence) => {
          if (err) {
            console.log(err);
          } else {
            // SAVE SEQUENCE ON LAYER?
            createdSequence.owner.id = req.user?._id;
            createdSequence.save();
            res.redirect(`/layers/${foundLayer._id}/layout`);
          }
        });
      }
    });
  },
);

// SEQUENCE SHOW
router.get(
  '/layers/:id/sequences/:pid',
  middleware.isLoggedIn,
  (req: express.Request & { user?: IUserSchema}, res: express.Response) => {
    // FIND LAYER
    Layer.findById(req.params.id, (err, foundLayer) => {
      if (err) {
        console.log(err);
      } else {
        // FIND SEQUENCE
        Sequence.findById(req.params.pid, (err, foundSequence) => {
          if (err) {
            console.log(err);
          } else {
            res.render('sequences/show', {
              layer: foundLayer,
              sequence: foundSequence,
            });
          }
        });
      }
    });
  },
);

// SEQUENCE EDIT
router.get(
  '/layers/:id/sequences/:pid/edit',
  middleware.isLoggedIn,
  async (req: express.Request & { user?: IUserSchema}, res: express.Response) => {
    // FIND LAYER
    Layer.findById(req.params.id)
      .populate({ path: 'rows.sequence', populate: { path: 'model.species' } })
      .exec(async (err, foundLayer) => {
        if (err) {
          console.log(err);
        } else {
          // FIND SEQUENCES
          try {
            const foundSequence = await Sequence.findById(req.params.pid)
              .populate('model.species')
              .exec();
            if (foundSequence) {
              // FIND ALL SPECIES
              const foundSpecies = await Species.find();

              // SORT SPECIES
              function compare(a, b) {
                if (a.genus < b.genus) {
                  return -1;
                }
                if (a.genus > b.genus) {
                  return 1;
                }
                return 0;
              }
              foundSpecies.sort(compare);
              // CALCULATE LENGTH
              let length = 0;
              if (foundSequence.sequencelength) {
                length = foundSequence.sequencelength;
              }
              // CALCULATE DISTANCE
              const distanceArray: any[] = [];
              for (let i = 0; i < foundSequence.model.length; i++) {
                distanceArray.push(foundSequence.model[i].position);
              }
              //
              const distanceDifference: any[] = [];
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
              function compare3(a:number, b:number) {
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
              res.render('sequences/edit', {
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
        }
      });
  },
);

// SEQUENCE UPDATE
router.put(
  '/layers/:id/sequences/:pid',
  middleware.isLoggedIn,
  (req: express.Request & { user?: IUserSchema}, res: express.Response) => {
    // CLEAN MODEL
    const model: any[] = [];
    let length = 0;
    // CHECK IF ARRAY
    if (!(req.body.model.species instanceof Array)) {
      const species = {
        species: req.body.model.species,
        position: Number(req.body.model.position),
      };
      model.push(species);
      length = Number(req.body.model.position);
    } else {
      for (let i = 0; i < req.body.model.species.length; i++) {
        // FIX IF ONLY ONE ITEM IN ROW
        // IF SPECIES ID IS NULL
        if (!(req.body.model.species[i] === '')) {
          const species = {
            species: req.body.model.species[i],
            position: Number(req.body.model.position[i]),
          };
          model.push(species);
        }
        if (Number(req.body.model.position[i]) > length) {
          length = Number(req.body.model.position[i]);
        }
      }
    }
    const sequence = req.body.sequence;
    sequence.model = model;
    sequence.sequencelength = length;
    // FIND LAYER
    Layer.findById(req.params.id, (err, foundLayer) => {
      if (err) {
        console.log(err);
      } else {
        Sequence.findByIdAndUpdate(
          req.params.pid,
          sequence,
          (err) => {
            if (err) {
              console.log(err);
            } else {
              res.redirect(`/layers/${foundLayer._id}/layout`);
            }
          },
        );
      }
    });
  },
);

// SEQUENCE DELETE ROUTE

/// ----------- PROJECT ROUTES ---------

// NEW AREA SYSTEM GRID NEW ROUTE
router.get(
  '/projects/:id/sequences/spacing',
  middleware.isLoggedIn,
  (req: express.Request & { user?: IUserSchema}, res: express.Response) => {
    // FIND LAYER
    Project.findById(req.params.id, (err, foundProject) => {
      if (err) {
        console.log(err);
      } else {
        res.render('sequences/spacing', { project: foundProject });
      }
    });
  },
);

// NEW AREA SYSTEM GRID REDIRECT ROUTE
router.post(
  '/projects/:id/sequences/spacing',
  middleware.isLoggedIn,
  (req: express.Request & { user?: IUserSchema}, res: express.Response) => {
    // CHECK LENGTH IS DIVISIBLE
    if ((req.body.length / req.body.distance) % 1 === 0) {
      // FIND LAYER
      Project.findById(req.params.id, (err, foundProject) => {
        if (err) {
          console.log(err);
        } else {
          res.redirect(
            `/projects/${
              foundProject._id
            }/sequences/new?distance=${
              req.body.distance
            }&length=${
              req.body.length}`,
          );
        }
      });
    } else {
      console.log(
        'error',
        'Length must be divisible with distance between species in sequence.',
      );
      res.redirect('back');
    }
  },
);

// SEQUENCE NEW
router.get(
  '/projects/:id/sequences/new',
  middleware.isLoggedIn,
  (req: express.Request & { user?: IUserSchema}, res: express.Response) => {
    // FIND LAYER
    Project.findById(req.params.id, (err, foundProject) => {
      if (err) {
        console.log(err);
      } else {
        // FIND ALL SPECIES
        Species.find((err, foundSpecies) => {
          if (err) {
            console.log(err);
          } else {
            // SORT SPECIES
            function compare(a, b) {
              if (a.genus < b.genus) {
                return -1;
              }
              if (a.genus > b.genus) {
                return 1;
              }
              return 0;
            }
            foundSpecies.sort(compare);
            res.render('sequences/new', {
              project: foundProject,
              species: foundSpecies,
              distance: req.query.distance,
              length: req.query.length,
            });
          }
        });
      }
    });
  },
);

// SEQUENCE CREATE
router.post(
  '/projects/:id/sequences',
  middleware.isLoggedIn,
  (req: express.Request & { user?: IUserSchema}, res: express.Response) => {
    // FIND LAYER
    Project.findById(req.params.id, (err, foundProject) => {
      if (err) {
        console.log(err);
      } else {
        const model: any[] = [];
        let length = 0;
        // CHECK IF ARRAY
        if (!(req.body.model.species instanceof Array)) {
          const species = {
            species: req.body.model.species,
            position: Number(req.body.model.position),
          };
          model.push(species);
          length = Number(req.body.model.position);
        } else {
          for (let i = 0; i < req.body.model.species.length; i++) {
            // FIX IF ONLY ONE ITEM IN ROW
            // IF SPECIES ID IS NULL
            if (!(req.body.model.species[i] === '')) {
              const species = {
                species: req.body.model.species[i],
                position: Number(req.body.model.position[i]),
              };
              model.push(species);
            }
            if (Number(req.body.model.position[i]) > length) {
              length = Number(req.body.model.position[i]);
            }
          }
        }
        const sequence = req.body.sequence;
        sequence.model = model;
        sequence.sequencelength = length;
        Sequence.create(sequence, (err, createdSequence) => {
          if (err) {
            console.log(err);
          } else {
            // SAVE SEQUENCE ON LAYER?
            createdSequence.owner.id = req.user?._id;
            createdSequence.save();
            res.redirect(`/projects/${foundProject._id}/layout`);
          }
        });
      }
    });
  },
);

// PROJECT SEQUENCE EDIT ROUTE
router.get(
  '/projects/:id/sequences/:pid/edit',
  middleware.isLoggedIn,
  async (req: express.Request & { user?: IUserSchema}, res: express.Response) => {
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
          function compare(a, b) {
            if (a.genus < b.genus) {
              return -1;
            }
            if (a.genus > b.genus) {
              return 1;
            }
            return 0;
          }
          foundSpecies.sort(compare);
          // CALCULATE LENGTH
          let length = 0;
          if (foundSequence.sequencelength) {
            length = foundSequence.sequencelength;
          }
          // CALCULATE DISTANCE
          const distanceArray: any[] = [];
          for (let i = 0; i < foundSequence.model.length; i++) {
            distanceArray.push(foundSequence.model[i].position);
          }
          //
          const distanceDifference: any[] = [];
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
          function compare3(a, b) {
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
          res.render('sequences/edit', {
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
  (req: express.Request & { user?: IUserSchema}, res: express.Response) => {
    // CLEAN MODEL
    const model: any[] = [];
    let length = 0;
    // CHECK IF ARRAY
    if (!(req.body.model.species instanceof Array)) {
      const species = {
        species: req.body.model.species,
        position: Number(req.body.model.position),
      };
      model.push(species);
      length = Number(req.body.model.position);
    } else {
      for (let i = 0; i < req.body.model.species.length; i++) {
        // FIX IF ONLY ONE ITEM IN ROW
        // IF SPECIES ID IS NULL
        if (!(req.body.model.species[i] === '')) {
          const species = {
            species: req.body.model.species[i],
            position: Number(req.body.model.position[i]),
          };
          model.push(species);
        }
        if (Number(req.body.model.position[i]) > length) {
          length = Number(req.body.model.position[i]);
        }
      }
    }
    const sequence = req.body.sequence;
    sequence.model = model;
    sequence.sequencelength = length;
    // FIND LAYER
    Project.findById(req.params.id, (err, foundProject) => {
      if (err) {
        console.log(err);
      } else {
        Sequence.findByIdAndUpdate(
          req.params.pid,
          sequence,
          (err) => {
            if (err) {
              console.log(err);
            } else {
              res.redirect(`/projects/${foundProject._id}/layout`);
            }
          },
        );
      }
    });
  },
);

export default router;

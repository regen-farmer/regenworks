const express = require('express');

const router = express.Router();
const Sequence = require('../models/sequence');
const Layer = require('../models/layer');
const Project = require('../models/project');
const Species = require('../models/species');
const middleware = require('../middleware');

// SEQUENCE INDEX

// NEW AREA SYSTEM GRID NEW ROUTE
router.get('/layers/:id/sequences/spacing', middleware.isLoggedIn, (req, res) => {
  // FIND LAYER
  Layer.findById(req.params.id, (err, foundLayer) => {
    if (err) {
      console.log(err);
    } else {
      res.render('sequences/spacing', { layer: foundLayer, project: '' });
    }
  });
});

// NEW AREA SYSTEM GRID REDIRECT ROUTE
router.post('/layers/:id/sequences/spacing', middleware.isLoggedIn, (req, res) => {
  // CHECK LENGTH IS DIVISIBLE
  if ((req.body.length / req.body.distance) % 1 === 0) {
    // FIND LAYER
    Layer.findById(req.params.id, (err, foundLayer) => {
      if (err) {
        console.log(err);
      } else {
        res.redirect(`/layers/${foundLayer._id}/sequences/new?distance=${req.body.distance}&length=${req.body.length}`);
      }
    });
  } else {
    req.flash('error', 'Length must be divisible with distance between species in sequence.');
    res.redirect('back');
  }
});

// SEQUENCE NEW
router.get('/layers/:id/sequences/new', middleware.isLoggedIn, (req, res) => {
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
            layer: foundLayer, project: '', species: foundSpecies, distance: req.query.distance, length: req.query.length,
          });
        }
      });
    }
  });
});

// SEQUENCE CREATE
router.post('/layers/:id/sequences', middleware.isLoggedIn, (req, res) => {
  // FIND LAYER
  Layer.findById(req.params.id, (err, foundLayer) => {
    if (err) {
      console.log(err);
    } else {
      // MODEL VARIABLES
      const model = [];
      let length = 0;
      // CHECK IF ARRAY?
      if (!(req.body.model.species instanceof Array)) {
        var species = {
          species: req.body.model.species,
          position: Number(req.body.model.position),
        };
        model.push(species);
        length = Number(req.body.model.position);
      } else {
        for (i = 0; i < req.body.model.species.length; i++) {
          // FIX IF ONLY ONE ITEM IN ROW
          // IF SPECIES ID IS NULL
          if (!(req.body.model.species[i] === '')) {
            var species = {
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
      const { sequence } = req.body;
      sequence.model = model;
      sequence.sequencelength = length;
      Sequence.create(sequence, (err, createdSequence) => {
        if (err) {
          console.log(err);
        } else {
          // SAVE SEQUENCE ON LAYER?
          createdSequence.owner.id = req.user._id;
          createdSequence.owner.username = req.user.username;
          createdSequence.save();
          res.redirect(`/layers/${foundLayer._id}/layout`);
        }
      });
    }
  });
});

// SEQUENCE SHOW
router.get('/layers/:id/sequences/:pid', middleware.isLoggedIn, (req, res) => {
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
          res.render('sequences/show', { layer: foundLayer, sequence: foundSequence });
        }
      });
    }
  });
});

// SEQUENCE EDIT
router.get('/layers/:id/sequences/:pid/edit', middleware.isLoggedIn, (req, res) => {
  // FIND LAYER
  Layer.findById(req.params.id).populate({ path: 'rows.sequence', populate: { path: 'model.species' } }).exec((err, foundLayer) => {
    if (err) {
      console.log(err);
    } else {
      // FIND SEQUENCES
      Sequence.findById(req.params.pid).populate('model.species').exec((err, foundSequence) => {
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
              // CALCULATE LENGTH
              let length = 0;
              if (foundSequence.sequencelength) {
                length = foundSequence.sequencelength;
              }
              // CALCULATE DISTANCE
              const distanceArray = [];
              for (i = 0; i < foundSequence.model.length; i++) {
                distanceArray.push(foundSequence.model[i].position);
              }
              //
              const distanceDifference = [];
              for (i = 0; i < distanceArray.length; i++) {
                for (j = 0; j < distanceArray.length; j++) {
                  if (distanceArray[i] !== distanceArray[j]) {
                    distanceDifference.push(Math.abs(distanceArray[i] - distanceArray[j]));
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
              if (distanceDifference[0] > distanceArray[0] || distanceDifference.length === 0) {
                distance = distanceArray[0];
              } else {
                distance = distanceDifference[0];
              }
              res.render('sequences/edit', {
                layer: foundLayer, project: '', sequence: foundSequence, species: foundSpecies, length, distance,
              });
            }
          });
        }
      });
    }
  });
});

// SEQUENCE UPDATE
router.put('/layers/:id/sequences/:pid', middleware.isLoggedIn, (req, res) => {
  // CLEAN MODEL
  const model = [];
  let length = 0;
  // CHECK IF ARRAY
  if (!(req.body.model.species instanceof Array)) {
    var species = {
      species: req.body.model.species,
      position: Number(req.body.model.position),
    };
    model.push(species);
    length = Number(req.body.model.position);
  } else {
    for (i = 0; i < req.body.model.species.length; i++) {
      // FIX IF ONLY ONE ITEM IN ROW
      // IF SPECIES ID IS NULL
      if (!(req.body.model.species[i] === '')) {
        var species = {
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
  const { sequence } = req.body;
  sequence.model = model;
  sequence.sequencelength = length;
  // FIND LAYER
  Layer.findById(req.params.id, (err, foundLayer) => {
    if (err) {
      console.log(err);
    } else {
      Sequence.findByIdAndUpdate(req.params.pid, sequence, (err, updatedSequence) => {
        if (err) {
          console.log(err);
        } else {
          res.redirect(`/layers/${foundLayer._id}/layout`);
        }
      });
    }
  });
});

// SEQUENCE DELETE ROUTE

/// ----------- PROJECT ROUTES ---------

// NEW AREA SYSTEM GRID NEW ROUTE
router.get('/projects/:id/sequences/spacing', middleware.isLoggedIn, (req, res) => {
  // FIND LAYER
  Project.findById(req.params.id, (err, foundProject) => {
    if (err) {
      console.log(err);
    } else {
      res.render('sequences/spacing', { project: foundProject });
    }
  });
});

// NEW AREA SYSTEM GRID REDIRECT ROUTE
router.post('/projects/:id/sequences/spacing', middleware.isLoggedIn, (req, res) => {
  // CHECK LENGTH IS DIVISIBLE
  if ((req.body.length / req.body.distance) % 1 === 0) {
    // FIND LAYER
    Project.findById(req.params.id, (err, foundProject) => {
      if (err) {
        console.log(err);
      } else {
        res.redirect(`/projects/${foundProject._id}/sequences/new?distance=${req.body.distance}&length=${req.body.length}`);
      }
    });
  } else {
    req.flash('error', 'Length must be divisible with distance between species in sequence.');
    res.redirect('back');
  }
});

// SEQUENCE NEW
router.get('/projects/:id/sequences/new', middleware.isLoggedIn, (req, res) => {
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
            project: foundProject, species: foundSpecies, distance: req.query.distance, length: req.query.length,
          });
        }
      });
    }
  });
});

// SEQUENCE CREATE
router.post('/projects/:id/sequences', middleware.isLoggedIn, (req, res) => {
  // FIND LAYER
  Project.findById(req.params.id, (err, foundProject) => {
    if (err) {
      console.log(err);
    } else {
      const model = [];
      let length = 0;
      // CHECK IF ARRAY
      if (!(req.body.model.species instanceof Array)) {
        var species = {
          species: req.body.model.species,
          position: Number(req.body.model.position),
        };
        model.push(species);
        length = Number(req.body.model.position);
      } else {
        for (i = 0; i < req.body.model.species.length; i++) {
          // FIX IF ONLY ONE ITEM IN ROW
          // IF SPECIES ID IS NULL
          if (!(req.body.model.species[i] === '')) {
            var species = {
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
      const { sequence } = req.body;
      sequence.model = model;
      sequence.sequencelength = length;
      Sequence.create(sequence, (err, createdSequence) => {
        if (err) {
          console.log(err);
        } else {
          // SAVE SEQUENCE ON LAYER?
          createdSequence.owner.id = req.user._id;
          createdSequence.owner.username = req.user.username;
          createdSequence.save();
          res.redirect(`/projects/${foundProject._id}/layout`);
        }
      });
    }
  });
});

// PROJECT SEQUENCE EDIT ROUTE
router.get('/projects/:id/sequences/:pid/edit', middleware.isLoggedIn, (req, res) => {
  // FIND LAYER
  Project.findById(req.params.id).populate({ path: 'rows.sequence', populate: { path: 'model.species' } }).exec((err, foundProject) => {
    if (err) {
      console.log(err);
    } else {
      // FIND SEQUENCES
      Sequence.findById(req.params.pid).populate('model.species').exec((err, foundSequence) => {
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
              // CALCULATE LENGTH
              let length = 0;
              if (foundSequence.sequencelength) {
                length = foundSequence.sequencelength;
              }
              // CALCULATE DISTANCE
              const distanceArray = [];
              for (i = 0; i < foundSequence.model.length; i++) {
                distanceArray.push(foundSequence.model[i].position);
              }
              //
              const distanceDifference = [];
              for (i = 0; i < distanceArray.length; i++) {
                for (j = 0; j < distanceArray.length; j++) {
                  if (distanceArray[i] !== distanceArray[j]) {
                    distanceDifference.push(Math.abs(distanceArray[i] - distanceArray[j]));
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
              if (distanceDifference[0] > distanceArray[0] || distanceDifference.length === 0) {
                distance = distanceArray[0];
              } else {
                distance = distanceDifference[0];
              }
              res.render('sequences/edit', {
                project: foundProject, sequence: foundSequence, species: foundSpecies, length, distance,
              });
            }
          });
        }
      });
    }
  });
});

// PROJECT SEQUENCE UPDATE
router.put('/projects/:id/sequences/:pid', middleware.isLoggedIn, (req, res) => {
  // CLEAN MODEL
  const model = [];
  let length = 0;
  // CHECK IF ARRAY
  if (!(req.body.model.species instanceof Array)) {
    var species = {
      species: req.body.model.species,
      position: Number(req.body.model.position),
    };
    model.push(species);
    length = Number(req.body.model.position);
  } else {
    for (i = 0; i < req.body.model.species.length; i++) {
      // FIX IF ONLY ONE ITEM IN ROW
      // IF SPECIES ID IS NULL
      if (!(req.body.model.species[i] === '')) {
        var species = {
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
  const { sequence } = req.body;
  sequence.model = model;
  sequence.sequencelength = length;
  // FIND LAYER
  Project.findById(req.params.id, (err, foundProject) => {
    if (err) {
      console.log(err);
    } else {
      Sequence.findByIdAndUpdate(req.params.pid, sequence, (err, updatedSequence) => {
        if (err) {
          console.log(err);
        } else {
          res.redirect(`/projects/${foundProject._id}/layout`);
        }
      });
    }
  });
});

module.exports = router;

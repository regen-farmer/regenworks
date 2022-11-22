import express from 'express';
import unique from 'array-unique';
import {
  centroid,
  helpers as turf,
  length as turfLength,
  along,
  circle,
  area,
  polygonToLine,
} from '@turf/turf';
import multer from 'multer';
import xml2js from 'xml2js';
import Layer, { ILayerSchema } from '../models/layer';
import Parcel from '../models/parcel';
import System from '../models/system';
import Species from '../models/species';
import Animal from '../models/animal';
import Sequence from '../models/sequence';
import Row from '../models/row';
import middleware from '../middleware';
import logger from '../middleware/logger';
import { IUserSchema } from '../models/user';

// SETUP MULTER
// XML2JS

const router = express.Router();
const storage = multer.memoryStorage();
const uploadMem = multer({ storage });

const parser = new xml2js.Parser();

// LAYER INDEX ROUTE

// NESTED PARCEL LAYER NEW ROUTE
router.get(
  '/parcels/:id/layers/new',
  middleware.isLoggedIn,
  async (req: express.Request & { user?: IUserSchema}, res: express.Response) => {
    // FIND PARCEL ID
    try {
      const foundParcel = await Parcel.findById(req.params.id);
      Species.find((err, foundSpecies) => {
        if (err) {
          console.log(err);
        } else {
          foundSpecies.sort((a, b) => {
            if (a.nameCommon < b.nameCommon) {
              return -1;
            }
            if (a.nameCommon > b.nameCommon) {
              return 1;
            }
            return 0;
          });
          Animal.find((err, foundAnimals) => {
            if (err) {
              console.log(err);
            } else {
              foundAnimals.sort((a, b) => {
                if (a.name < b.name) {
                  return -1;
                }
                if (a.name > b.name) {
                  return 1;
                }
                return 0;
              });
              res.render('layers/new', {
                parcel: foundParcel,
                species: foundSpecies,
                animals: foundAnimals,
              });
            }
          });
        }
      });
    } catch (err) {
      console.log(err);
      // logger.error(err.message);
      // res.flash(err
    }
  },
);

// NESTED PARCEL LAYER NEW WITH UPLOAD ROUTE
router.get(
  '/parcels/:id/layers/newkml',
  middleware.isLoggedIn,
  async (req: express.Request & { user?: IUserSchema}, res: express.Response) => {
    // FIND PARCEL ID
    Parcel.findById(req.params.id, (err, foundParcel) => {
      if (err) {
        console.log(err);
        logger.error(err.message);
        // res.flash(err
      } else {
        Species.find((err, foundSpecies) => {
          if (err) {
            console.log(err);
          } else {
            function compare(a, b) {
              if (a.nameCommon < b.nameCommon) {
                return -1;
              }
              if (a.nameCommon > b.nameCommon) {
                return 1;
              }
              return 0;
            }
            foundSpecies.sort(compare);
            Animal.find((err, foundAnimals) => {
              if (err) {
                console.log(err);
              } else {
                function compare1(a, b) {
                  if (a.name < b.name) {
                    return -1;
                  }
                  if (a.name > b.name) {
                    return 1;
                  }
                  return 0;
                }
                foundAnimals.sort(compare1);
                res.render('layers/newkml', {
                  parcel: foundParcel,
                  species: foundSpecies,
                  animals: foundAnimals,
                });
              }
            });
          }
        });
      }
    });
  },
);

// NESTED PARCEL LAYER CREATE ROUTE
router.post(
  '/parcels/:id/layers',
  middleware.checkParcelOwnership,
  async (req: express.Request & { user?: IUserSchema}, res: express.Response) => {
    // Lookup place using id
    Parcel.findById(req.params.id, (err, foundParcel) => {
      if (err) {
        console.log(err);
        res.redirect(`/users/${req.user?.id}`);
      } else {
        Layer.create(req.body.layer, (err, layer) => {
          if (err) {
            console.log(err);
          } else {
            // Add user ID to Layer.
            layer.owner.id = req.user?._id;
            // Save JSON file to geometry
            layer.geometry = req.body.geometry;
            layer.size = req.body.layersize;
            const geometrycentroid = centroid(JSON.parse(req.body.geometry));
            console.log(geometrycentroid.geometry.coordinates[0]);
            layer.lat = geometrycentroid.geometry.coordinates[1];
            layer.lng = geometrycentroid.geometry.coordinates[0];
            // Save the layer
            layer.save();
            // Connect new layer to parcel
            foundParcel.layers.push(layer); // MOVE THIS UP TO AVOID ERRORS IF LAYER FAILS?!!!
            foundParcel.save();
            console.log(layer);
            // Redirect to parcels SHOW page
            // req.flash("success", "Successfully added comment");
            /* if(layer.type == "agroforestry"){
                        res.redirect("/layers/" + layer._id + '/systems/newgrid');
                    } else { */
            let tempspecies = req.body.maincrop;
            if (req.body.maincrop === '') {
              tempspecies = '5e665452cccc150b186d4cd1';
            }
            Species.findById(tempspecies, (err, foundSpecies) => {
              if (err) {
                console.log(err);
              } else {
                // DEFINE SYSTEM WITH ONE ROW AND ONE SPECIES
                const presentsystem: any = {
                  name: `${foundSpecies.nameCommon} monoculture`,
                  description: '',
                  model: [
                    {
                      species: foundSpecies._id,
                      width: 2,
                      position: [1, 1],
                    },
                  ],
                  shared: false,
                  owner: {
                    id: req.user?._id,
                  },
                  animals: [],
                };
                // FIND ANIMAL AND PUSH TO SYSTEM
                if (!(req.body.animal === '')) {
                  Animal.findById(req.body.animal, (err, foundAnimal) => {
                    if (err) {
                      console.log(err);
                    } else {
                      presentsystem.animals.push(foundAnimal);
                      // CREATE SYSTEM
                      System.create(
                        presentsystem,
                        (err, createdSystem) => {
                          if (err) {
                            console.log(err);
                          } else {
                            // ASS SYSTEM TO PRESENT SYSTEM
                            layer.systems.present = createdSystem;
                            layer.save();
                            // IF FOREST OR ORCHARD GO TO LAYOUT
                            if (
                              layer.type === 'forestry'
                              || layer.type === 'orchard'
                            ) {
                              res.redirect(`/layers/${layer._id}/layout`);
                            } else {
                              res.redirect(`/layers/${layer._id}`);
                            }
                          }
                        },
                      );
                    }
                  });
                } else {
                  // CREATE SYSTEM
                  System.create(presentsystem, (err, createdSystem) => {
                    if (err) {
                      console.log(err);
                    } else {
                      // ASS SYSTEM TO PRESENT SYSTEM
                      layer.systems.present = createdSystem;
                      layer.save();
                      // IF FOREST OR ORCHARD GO TO LAYOUT
                      if (
                        layer.type === 'forestry'
                        || layer.type === 'orchard'
                      ) {
                        res.redirect(`/layers/${layer._id}/layout`);
                      } else {
                        res.redirect(`/layers/${layer._id}`);
                      }
                    }
                  });
                }
              }
            });
            /* } */
          }
        });
      }
    });
  },
);

// NESTED PARCEL LAYER CREATE WITH UPLOAD ROUTE
router.post(
  '/parcels/:id/layersuploadkml',
  middleware.checkParcelOwnership,
  uploadMem.single('filename'),
  async (req: express.Request & { user?: IUserSchema}, res: express.Response) => {
    // CHECK EXISTING AREAS SIZE!?

    // PARSE UPLOADED FILE AND CREATE POLYGON
    if (req.file) {
      parser.parseString(req.file.buffer, (err, result) => {
        if (err) {
          console.log('error', err.message);
          // console.log(err);
          res.redirect('back');
        } else {
          const string = result.kml.Document[0].Placemark[0].Polygon[0].outerBoundaryIs[0]
            .LinearRing[0].coordinates[0];
          const splitString = string.split(' ');
          // CREATE NEW ARRAY HERE? OR IS THIS OBSOLETE?
          const array: any[] = [];
          for (let i = 0; i < splitString.length; i++) {
            const apples = JSON.parse(`[${splitString[i]}]`);
            array.push(apples);
          }
          // CHECK IF LAST ARRAY IS EMPTY?
          if (array[array.length - 1].length === 0) {
            console.log('last is empty array');
            array.pop();
          }
          // THEN ADD HERE?!
          const polygon = turf.polygon([array]);
          const size = area(polygon);
          const geometry = JSON.stringify(polygon);
          // FIND PARCEL
          Parcel.findById(req.params.id, (err, foundParcel) => {
            if (err) {
              console.log(err);
            } else {
              Layer.create(req.body.layer, (err, createdLayer: ILayerSchema) => {
                if (err) {
                  console.log(err);
                } else {
                  createdLayer.owner.id = req.user?._id;
                  createdLayer.geometry = geometry;
                  // CALCULATE LAYER SIZE
                  createdLayer.size = size;
                  // GEOMETRY CENTROID FOR LAT AND LNG
                  const geometrycentroid = centroid(polygon.geometry);
                  createdLayer.lat = geometrycentroid.geometry.coordinates[1];
                  createdLayer.lng = geometrycentroid.geometry.coordinates[0];
                  // Save the layer
                  createdLayer.save();
                  // PUSH LAYER TO PARCEL
                  foundParcel.layers.push(createdLayer);
                  foundParcel.save();
                  // DEFINE SYSTEM
                  if (createdLayer.type === 'agroforestry') {
                    res.redirect(`/layers/${createdLayer._id}/systems/new`);
                  } else {
                    let tempspecies = req.body.maincrop;
                    if (req.body.maincrop === '') {
                      tempspecies = '5e665452cccc150b186d4cd1';
                    }
                    Species.findById(tempspecies, (err, foundSpecies) => {
                      if (err) {
                        console.log(err);
                      } else {
                      // DEFINE SYSTEM WITH ONE ROW AND ONE SPECIES
                        const presentsystem: any = {
                          name: `${foundSpecies.nameCommon} monoculture`,
                          description: '',
                          model: [
                            {
                              species: foundSpecies._id,
                              width: 2,
                              position: [1, 1],
                            },
                          ],
                          shared: false,
                          owner: {
                            id: req.user?._id,
                          },
                          animals: [],
                        };
                        // FIND ANIMAL AND PUSH TO SYSTEM
                        if (!(req.body.animal === '')) {
                          Animal.findById(
                            req.body.animal,
                            (err, foundAnimal) => {
                              if (err) {
                                console.log(err);
                              } else {
                                presentsystem.animals.push(foundAnimal);
                                // CREATE SYSTEM
                                System.create(
                                  presentsystem,
                                  (err, createdSystem) => {
                                    if (err) {
                                      console.log(err);
                                    } else {
                                    // ADD SYSTEM TO PRESENT SYSTEM
                                      createdLayer.systems.present = createdSystem;
                                      createdLayer.save();
                                      // IF FOREST OR ORCHARD GO TO LAYOUT
                                      if (
                                        createdLayer.type === 'forestry'
                                      || createdLayer.type === 'orchard'
                                      ) {
                                        res.redirect(
                                          `/layers/${createdLayer._id}/layout`,
                                        );
                                      } else {
                                        res.redirect(`/layers/${createdLayer._id}`);
                                      }
                                    }
                                  },
                                );
                              }
                            },
                          );
                        } else {
                        // CREATE SYSTEM
                          System.create(
                            presentsystem,
                            (err, createdSystem) => {
                              if (err) {
                                console.log(err);
                              } else {
                              // ADD SYSTEM TO PRESENT SYSTEM
                                createdLayer.systems.present = createdSystem;
                                createdLayer.save();
                                // IF FOREST OR ORCHARD GO TO LAYOUT
                                if (
                                  createdLayer.type === 'forestry'
                                || createdLayer.type === 'orchard'
                                ) {
                                  res.redirect(`/layers/${createdLayer._id}/layout`);
                                } else {
                                  res.redirect(`/layers/${createdLayer._id}`);
                                }
                              }
                            },
                          );
                        }
                      }
                    });
                  }
                }
              });
            }
          });
        }
      });
    }
  },
);

// LAYER SHOW ROUTES
router.get('/layers/:id', middleware.isLoggedIn, async (req: express.Request & { user?: IUserSchema}, res: express.Response) => {
  // MAKE LAYER OWNERSHIP MIDDLEWARE
  try {
    const foundLayer = await Layer.findById(req.params.id)
      .populate('systems.future')
      .populate('projects')
      .populate('systems.present')
      .populate('systems.past')
      .exec();
    if (foundLayer) {
      if (foundLayer.systems.present === undefined) {
        res.redirect(`/layers/${foundLayer._id}/systems/newgrid`);
      } else {
        const foundSystem = await System.findById(foundLayer.systems.present._id)
          .populate('model.species')
          .populate('animals')
          .exec();

        if (foundSystem) {
          // FIND ALL SPECIES IN SYSTEM
          const allSpecies: any[] = [];
          const dataset: any[] = [];
          foundSystem.model.forEach((species) => {
            allSpecies.push(species.species);
            let count = 0;
            for (let i = 0; i < dataset.length; i++) {
              if (dataset[i].row === species.position[0]) {
                dataset[i].array.push(species);
                count += 1;
              }
            }
            if (count === 0) {
              dataset.push({ row: species.position[0], array: [species] });
            }
          });
          // FIND UNIQUE SPECIES / REMOVE DUPLICATES
          const uniqueSpecies = unique(allSpecies);
          // SORT FIRST ROW ITEMS
          function compare1(a, b) {
            if (a.position[1] < b.position[1]) {
              return -1;
            }
            if (a.position[1] > b.position[1]) {
              return 1;
            }
            return 0;
          }
          for (let i = 0; i < dataset.length; i++) {
            dataset[i].array.sort(compare1);
            console.log(dataset[i].array[0]);
          }
          // FIND SPECIES AND POPULATE FLOWS
          Species.find({ _id: uniqueSpecies })
            .populate('flows')
            .exec((err, foundSpecies) => {
              if (err) {
                console.log(err);
              } else {
                res.render('layers/show', {
                  layer: foundLayer,
                  presentsystem: foundSystem,
                  species: foundSpecies,
                  rows: dataset,
                });
              }
            });
        }
      }
    }
  } catch (err) {
    console.log(err);
  }
});

// LAYER EDIT ROUTE
router.get('/layers/:id/edit', middleware.isLoggedIn, async (req: express.Request & { user?: IUserSchema}, res: express.Response) => {
  // MAKE LAYER OWNERSHIP MIDDLEWARE
  // Find specific activity in database
  Layer.findById(req.params.id, (err, foundLayer) => {
    if (err) {
      console.log(err);
    } else {
      res.render('layers/edit', { layer: foundLayer });
    }
  });
});

// LAYER UPDATE ROUTE
router.put('/layers/:id', middleware.isLoggedIn, async (req: express.Request & { user?: IUserSchema}, res: express.Response) => {
  Layer.findByIdAndUpdate(
    req.params.id,
    req.body.layer,
    (err, updatedLayer) => {
      if (err) {
        console.log(err);
      } else {
        console.log(updatedLayer);
        res.redirect(`/layers/${req.params.id}`);
      }
    },
  );
});

// LAYER DELETE ROUTE
router.delete('/layers/:id', middleware.isLoggedIn, async (req: express.Request & { user?: IUserSchema}, res: express.Response) => {
  // CHECK OWNERSHIP
  Layer.findById(req.params.id, (err, foundLayer) => {
    if (err) {
      console.log(err);
      res.redirect(`/users/${req.user?.id}`);
    } else {
      // REMOVE LAYER FROM PARCEL
      Parcel.find({ 'owner.id': req.user?._id }, (err, foundParcels) => {
        if (err) {
          console.log(err);
          res.redirect(`/users/${req.user?.id}`);
        } else {
          // CYCLE THROUGH PARCELS
          let parcelRef = {};
          for (let i = 0; i < foundParcels.length; i++) {
            // CYCLE THROUGH LAYERS
            for (let j = 0; j < foundParcels[i].layers.length; j++) {
              if (foundParcels[i].layers[j].equals(foundLayer._id)) {
                foundParcels[i].layers.remove(foundLayer);
                console.log('Layer removed');
                foundParcels[i].save();
                parcelRef = foundParcels[i]._id;
              }
            }
          }
          // REMOVE LAYER FROM PARCEL HERE WHEN IT IS FOUND?!
          res.redirect(`/parcels/${parcelRef}`);
          // DELETE LAYER TEMP REMOVED
          /* Layer.findByIdAndRemove(req.params.id, function(err){
                        if(err){
                            console.log(err);
                            res.redirect("/parcels");
                        } else {
                            res.redirect("/parcels");
                        }
                    }); */
        }
      });
    }
  });
});

// LAYER CURRENT SYSTEM UPDATE
router.post(
  '/layers/:id/presentsystem',
  middleware.isLoggedIn,
  async (req: express.Request & { user?: IUserSchema}, res: express.Response) => {
    Layer.findById(req.params.id, (err, foundLayer) => {
      if (err) {
        console.log(err);
      } else {
        System.findById(req.body.systemid, (err, foundSystem) => {
          if (err) {
            console.log(err);
          } else {
            // PUSH CURRENT SYSTEM TO PAST
            if (!(foundLayer.systems.present === '')) {
              foundLayer.systems.past.push(foundLayer.systems.present);
            }
            // SET CURRENT SYSTEM TO FUTURE DRAFT
            foundLayer.systems.present = foundSystem;
            foundLayer.type = 'agroforestry';
            console.log(`${foundSystem.name} has been set to current system`);
            // REMOVE FUTURE DRAFT FROM FUTURE ARRAY
            foundLayer.systems.future.remove(foundSystem);
            console.log(
              `${foundSystem.name} has been removed from future systems`,
            );
            foundLayer.save();
            res.redirect(`/layers/${foundLayer._id}`);
          }
        });
      }
    });
  },
);

// LAYER ADD FUTURE SYSTEM DRAFT
router.post(
  '/layers/:id/editfuture',
  middleware.isLoggedIn,
  async (req: express.Request & { user?: IUserSchema}, res: express.Response) => {
    Layer.findById(req.params.id, (err, foundLayer) => {
      if (err) {
        console.log(err);
      } else {
        System.findById(req.body.systemid, (err, foundSystem) => {
          if (err) {
            console.log(err);
          } else {
            foundLayer.systems.future.push(foundSystem);
            foundLayer.save();
            console.log(
              `Now there is ${
                foundLayer.systems.future.length
              } future drafts on this area`,
            );
            res.redirect(`/layers/${foundLayer._id}`);
          }
        });
      }
    });
  },
);

// LAYER CURRENT SYSTEM LAYOUT
router.get(
  '/layers/:id/layout',
  middleware.isLoggedIn,
  async (req: express.Request & { user?: IUserSchema}, res: express.Response) => {
    // MAKE LAYER OWNERSHIP MIDDLEWARE
    try {
      const foundLayer = await Layer.findById(req.params.id)
        .populate('systems.present')
        .populate('assets')
        .populate({
          path: 'rows',
          populate: { path: 'sequence', populate: { path: 'model.species' } },
        })
        .populate({ path: 'areas', populate: { path: 'rotation' } })
        .exec();

      if (foundLayer) {
        const foundSystem = await System.findById(foundLayer.systems.present._id)
          .populate('model.species')
          .populate('animals')
          .exec();
        if (foundSystem) {
          // FIND ALL SPECIES IN SYSTEM
          const allSpecies: any[] = [];
          foundSystem.model.forEach((species) => {
            allSpecies.push(species.species.id);
          });
          //

          // FIND UNIQUE SPECIES / REMOVE DUPLICATES
          const uniqueSpecies = unique(allSpecies);
          // FIND SPECIES AND POPULATE FLOWS
          const foundSpecies = await Species.find({ _id: uniqueSpecies })
            .populate('flows')
            .exec();

          // const polygon = JSON.parse(foundLayer.geometry);
          // FIND SYSTEM ROWS
          const dataset: any[] = [];
          foundSystem.model.forEach((species) => {
            let count = 0;
            for (let i = 0; i < dataset.length; i++) {
              if (dataset[i].row === species.position[0]) {
                dataset[i].array.push(species);
                count += 1;
              }
            }
            if (count === 0) {
              dataset.push({
                row: species.position[0],
                array: [species],
              });
            }
          });
          // SORT FIRST ROW ITEMS
          function compare1(a, b) {
            if (a.position < b.position) {
              return -1;
            }
            if (a.position > b.position) {
              return 1;
            }
            return 0;
          }
          /* for(let i=0;i<dataset.length;i++){
                          dataset[i].array.sort(compare1);
                      } */
          // VIZ ROWS
          const rowArray: any[] = [];
          const placesArray: any[] = [];
          for (let i = 0; i < foundLayer.rows.length; i++) {
            // ROW VIZ
            const rowGeometry = JSON.parse(foundLayer.rows[i].geometry);
            rowArray.push(rowGeometry);
            // PLACES
            const properties = {
              description: foundLayer.rows[i].name,
            };
            const place = turf.point(
              rowGeometry.geometry.coordinates[1],
              properties,
            );
            placesArray.push(place);
          }
          // ROW LABELS (BEFORE ROWS ARE PARSED)
          const placesCollection = turf.featureCollection(placesArray);
          const places = JSON.stringify(placesCollection);
          // CREATE PLACES FEATURE
          const featurecollection = turf.featureCollection(rowArray);
          const collection = JSON.stringify(featurecollection);
          // COUNT ASSETS IN ROW SYSTEMS - ONLY TAKE FIRST ROW?!
          /* for(let i=0;i<foundLayer.rows.length;i++){
                          for(let j=0;j<foundLayer.rows[i].system.model.length;j++){
                              foundLayer.rows[i].system.populate("model." + j + ".species");
                          }
                      } */
          const treeAssetsArray: any[] = [];
          // SET COLLECTIVE TREE ARRAY
          const treeMarkerArray: any[] = [];
          // const treeAssetArray: any[] = [];
          // FIND SYSTEM ROWS
          for (let i = 0; i < foundLayer.rows.length; i++) {
            // SET ROW DATA
            if (foundLayer.rows[i].sequence) {
              const datasetRows = foundLayer.rows[i].sequence.model;
              /* foundLayer.rows[i].sequence.model.forEach(function (species) {
                                  var count = 0;
                                  for (j = 0; j < datasetRows.length; j++) {
                                      if (datasetRows[j].row === species.position[0]) {
                                          datasetRows[j].array.push(species);
                                          count = count + 1;
                                      }
                                  }
                                  if (count === 0) {
                                      datasetRows.push({row: species.position[0], array: [species]});
                                  }
                              }); */
              // SORT ROW ITEMS
              datasetRows.sort(compare1);
              // ROW LENGTH
              const rowLine = JSON.parse(foundLayer.rows[i].geometry);
              const rowLength = turfLength(rowLine, { units: 'meters' });
              console.log(`Row length ${rowLength}`);
              // SYSTEM MODEL LENGTH
              const systemModelLength = foundLayer.rows[i].sequence.sequencelength;
              /* if (datasetRows[0].array[(datasetRows[0].array.length - 1)].position[1] <= 1) {
                                  systemModelLength = datasetRows[1].array[(datasetRows[1].array.length - 1)].position[1];
                              } else {
                                  systemModelLength = datasetRows[0].array[(datasetRows[0].array.length - 1)].position[1];
                              } */
              console.log(`System model length:${systemModelLength}`);
              // FIND MODEL COUNT AND REST
              const systemModelCount = Math.floor(rowLength / systemModelLength);
              const systemModelRowRest = (rowLength / systemModelLength
                  - Math.floor(rowLength / systemModelLength))
                * systemModelLength;
              // ADD FIRST TREE IN EACH ROW - ADD LAST SPECIES IN ARRAY - DO IF TO CHECK DISTANCE
              const firstTreeMarker = turf.point(rowLine.geometry.coordinates[0]);
              treeMarkerArray.push(firstTreeMarker);
              const firstAsset = {
                marker: firstTreeMarker,
                species: datasetRows[datasetRows.length - 1].species,
              };
              treeAssetsArray.push(firstAsset);
              // ROW MARKERS
              // CALCULATE LENGTH ITERATIONS - EITHER ADD TO ARRAY COUNTER OR JUST SORT LATER
              for (let j = 0; j < systemModelCount; j++) {
                for (let k = 0; k < datasetRows.length; k++) {
                  // CREATE COORDINATES FOR THE TREE
                  const treeMarker = along(
                    rowLine,
                    j * systemModelLength + datasetRows[k].position,
                    { units: 'meters' },
                  );
                  // CREATE ASSET OBJECT
                  /* var asset = {
                                          species: treeRows[treeRowCount].array[k].species.id,
                                          lat: treeMarker.geometry.coordinates[0],
                                          lng: treeMarker.geometry.coordinates[1],
                                          name: treeRows[treeRowCount].array[k].species.nameCommon
                                      }; */
                  //
                  const asset = {
                    marker: treeMarker,
                    species: datasetRows[k].species,
                  };
                  // ADD TREE OBJECT TO ARRAY
                  treeMarkerArray.push(treeMarker);
                  treeAssetsArray.push(asset);
                }
              }
              // ADD REST
              for (let j = 0; j < datasetRows.length; j++) {
                if (datasetRows[j].position < systemModelRowRest) {
                  /*
                                                                              treeArray.push(treeRows[treeRowCount].array[j].species);
                                      */
                  // ADD POINT MARKER FOR REMAINING TREES
                  const treeMarker2 = along(
                    rowLine,
                    systemModelCount * systemModelLength
                      + datasetRows[j].position,
                    { units: 'meters' },
                  );
                  const asset2 = {
                    marker: treeMarker2,
                    species: datasetRows[j].species,
                  };
                  treeMarkerArray.push(treeMarker2);
                  treeAssetsArray.push(asset2);
                }
              }
            }
          }
          // DO POINT COLLECTION
          const treeCanopyArray: any[] = [];
          const vegeCanopyArray: any[] = [];
          if (treeAssetsArray.length < 4000) {
            for (let i = 0; i < treeAssetsArray.length; i++) {
              // FIND TREE DIMENSIONS
              let diameter = 1;
              if (
                treeAssetsArray[i].species.form === 'shrub'
                || treeAssetsArray[i].species.form === 'giantherb'
              ) {
                diameter = 0.5;
              } else if (treeAssetsArray[i].species.form === 'herb') {
                diameter = 0.2;
              }
              const circle1 = circle(
                treeAssetsArray[i].marker.geometry.coordinates,
                diameter,
                { units: 'meters' },
              );
              if (treeAssetsArray[i].species.height > 15) {
                treeCanopyArray.push(circle1);
              } else {
                vegeCanopyArray.push(circle1);
              }
            }
          }
          const treeMarkers = turf.featureCollection(treeCanopyArray);
          const treeCollection = JSON.stringify(treeMarkers);
          // INSERT SYSTEM CLASSIFICATION
          const vegeMarkers = turf.featureCollection(vegeCanopyArray);
          const vegeCollection = JSON.stringify(vegeMarkers);
          // DO TREE NAMES COLLECTION
          const treenames: any[] = [];
          for (let i = 0; i < treeAssetsArray.length; i++) {
            const properties1 = {
              description: treeAssetsArray[i].species.nameCommon.slice(0, 3),
            };
            const treename = turf.point(
              treeAssetsArray[i].marker.geometry.coordinates,
              properties1,
            );
            treenames.push(treename);
          }
          const treenamemarks = turf.featureCollection(treenames);
          const treeNameCollection = JSON.stringify(treenamemarks);
          // COUNT ASSETS

          // COMBINE ASSETS AND ROW BASED

          // AREAS
          const alleyPolygonArray: any[] = [];
          const bedPolygonArray: any[] = [];
          for (let i = 0; i < foundLayer.areas.length; i++) {
            // ROW VIZ
            const areaGeometry = JSON.parse(foundLayer.areas[i].geometry);
            if (foundLayer.areas[i].name.charAt(0) === 'A') {
              alleyPolygonArray.push(areaGeometry);
            } else if (foundLayer.areas[i].name.charAt(0) === 'T') {
              bedPolygonArray.push(areaGeometry);
            } else {
              alleyPolygonArray.push(areaGeometry);
            }
          }
          const bedArrayPolygons = turf.featureCollection(bedPolygonArray);
          const stripsCollection = JSON.stringify(bedArrayPolygons);
          const alleyArrayPolygons = turf.featureCollection(alleyPolygonArray);
          const alleysCollection = JSON.stringify(alleyArrayPolygons);
          res.render('layers/layout', {
            layer: foundLayer,
            presentsystem: foundSystem,
            species: foundSpecies,
            collection,
            places,
            trees: treeCollection,
            treenames: treeNameCollection,
            vegetables: vegeCollection,
            strips: stripsCollection,
            alleys: alleysCollection,
          });
        }
      }
    } catch (err) {
      console.log(err);
    }
  },
);

// NEW SPLIT LAYER ROUTE
router.get('/layers/:id/split', middleware.isLoggedIn, async (req: express.Request & { user?: IUserSchema}, res: express.Response) => {
  // FIND LAYER
  Layer.findById(req.params.id, (err, foundLayer) => {
    if (err) {
      console.log(err);
    } else {
      res.render('layers/split', { layer: foundLayer });
    }
  });
});

// CREATE SPLIT LAYER ROUTE
router.post('/layers/:id/split', middleware.isLoggedIn, async (req: express.Request & { user?: IUserSchema}, res: express.Response) => {
  // FIND LAYER
  Layer.findById(req.params.id, (err, foundLayer) => {
    if (err) {
      console.log(err);
    } else {
      // FIND LAYER GEOMETRY
      const polygon = JSON.parse(foundLayer.geometry);
      // PARSE SPLIT LINE
      const splitLine = JSON.parse(req.body.geometry);
      console.log(splitLine);
      // CHECK THAT ALL LINE POINTS EXCEPT LAST ARE WITHIN POLYGON

      // SPLIT LAYER GEOMETRY WITH SPLIT LINE
      // SET VARIABLES FOR INTERSECTION WITH POLYGON
      const matchPoint1 = turf.point(splitLine.geometry.coordinates[0]);
      console.log(`matchPoint1: ${matchPoint1}`);
      // const matchPoint2 = turf.point(splitLine.geometry.coordinates[1]);
      // SET GEOMETRY LINE SEGMENT INDEX VARIABLES
      console.log(
        `length of polygon array: ${polygon.geometry.coordinates[0].length}`,
      );
      let lineA = 0;
      let lineAcount = 0;
      let lineB = 0;
      let lineBcount = 0;
      const polyLine = polygonToLine(polygon);

      console.log(
        // @ts-ignore
        `length of polyline array: ${polyLine.geometry.coordinates.length}`,
      );
      for (let k = 0; k < polygon.geometry.coordinates[0].length - 1; k++) {
        const lineA1 = turf.lineString(
          [
            polygon.geometry.coordinates[0][k],
            splitLine.geometry.coordinates[0],
          ],
          { name: 'line A1' },
        );
        const lineA2 = turf.lineString(
          [
            splitLine.geometry.coordinates[0],
            polygon.geometry.coordinates[0][k + 1],
          ],
          { name: 'line A2' },
        );
        const lineAdistance = turfLength(lineA1, { units: 'meters' })
          + turfLength(lineA2, { units: 'meters' });
        if (k === 0) {
          lineAcount = lineAdistance;
        }
        if (lineAdistance < lineAcount) {
          lineAcount = lineAdistance;
          lineA = k;
        }
        console.log(lineAdistance);
        // LINE B
        const lineB1 = turf.lineString(
          [
            polygon.geometry.coordinates[0][k],
            splitLine.geometry.coordinates[1],
          ],
          { name: 'line B1' },
        );
        const lineB2 = turf.lineString(
          [
            splitLine.geometry.coordinates[1],
            polygon.geometry.coordinates[0][k + 1],
          ],
          { name: 'line B2' },
        );
        const lineBdistance = turfLength(lineB1, { units: 'meters' })
          + turfLength(lineB2, { units: 'meters' });
        if (k === 0) {
          lineBcount = lineBdistance;
        }
        if (lineBdistance < lineBcount) {
          lineBcount = lineBdistance;
          lineB = k;
        }
        console.log(lineBdistance);
      }
      console.log(lineA);
      console.log(lineB);
      // IF B IS LARGER THAN A, FLIP WHOLE LINE
      /* if(lineA > lineB){
                splitLine.geometry.coordinates.reverse();
            } */
      // SAVE ONE GEOMETRY ON OLD LAYER AND RENAME
      const polygonCoordinates = polygon.geometry.coordinates[0];
      console.log(`before splice: ${polygonCoordinates}`);
      const segmentLength = lineB - lineA;
      polygonCoordinates.splice(
        lineA + 1,
        segmentLength,
        splitLine.geometry.coordinates[0],
        splitLine.geometry.coordinates[1],
      );
      console.log(`after splice: ${polygonCoordinates}`);
      const newPolygon = turf.polygon([polygonCoordinates], { name: 'poly1' });
      console.log(`String poly ${JSON.stringify(newPolygon)}`);
      const newPolygonString = JSON.stringify(newPolygon);
      Layer.findByIdAndUpdate(
        req.params.id,
        { $set: { geometry: newPolygonString } },
        (err) => {
          if (err) {
            console.log(err);
          } else {
            // CREATE NEW LAYER WITH NEW NAME AND GEOMETRY

            res.redirect(`/layers/${foundLayer._id}`);
          }
        },
      );
    }
  });
});

// ROW NEW ROUTE
router.get(
  '/layers/:id/row/new',
  middleware.isLoggedIn,
  async (req: express.Request & { user?: IUserSchema}, res: express.Response) => {
    // FIND PROJECT
    Layer.findById(req.params.id, (err, foundLayer) => {
      if (err) {
        console.log(err);
      } else {
        // FIND MY SYSTEMS
        Sequence.find(
          { 'owner.id': req.user?._id },
          (err, foundSequences) => {
            if (err) {
              console.log(err);
            } else {
              res.render('layers/row', {
                layer: foundLayer,
                sequences: foundSequences,
              });
            }
          },
        );
      }
    });
  },
);

// ROW CREATE ROUTE
router.post(
  '/layers/:id/row',
  middleware.isLoggedIn,
  async (req: express.Request & { user?: IUserSchema}, res: express.Response) => {
    // IF NO GEOMETRY
    if (req.body.geometry === '') {
      res.redirect('back');
    } else {
      // CREATE ROW HERE?
      const tempGeo = JSON.parse(req.body.geometry);
      const row: any = {
        geometry: req.body.geometry,
        name: req.body.row.name,
        // ADD ROW LENGTH PARAM
        rowlength: turfLength(tempGeo, {units: 'meters'})
      };
      if (!(req.body.sequenceid === 'none') && req.body.sequenceid) {
        row.sequence = req.body.sequenceid;
      }
      console.log(row);
      // CREATE ROW
      try {
        const createdRow = await Row.create(row);
        try {
          const updatedLayer = await Layer.findByIdAndUpdate(req.params.id, {
            $addToSet: { rows: createdRow },
          });

          // CREATE ROW
          console.log('Row has been added to layer');
          res.redirect(`/layers/${updatedLayer?.id}/layout`);
        } catch (err) {
          console.log(err);
        }
      } catch (err) {
        console.log(err);
      }
    }
  },
);

// EDIT ROW
router.get(
  '/layers/:id/row/:pid/edit',
  middleware.isLoggedIn,
  async (req: express.Request & { user?: IUserSchema}, res: express.Response) => {
    // FIND LAYER
    Layer.findById(req.params.id)
      .populate({ path: 'rows', populate: { path: 'sequence' } })
      .exec((err, foundLayer) => {
        if (err) {
          console.log(err);
        } else {
          // FIND ROW
          Row.findById(req.params.pid)
            .populate('sequence')
            .exec((err, foundRow) => {
              if (err) {
                console.log(err);
              } else {
                // FIND MY SYSTEMS
                Sequence.find(
                  { 'owner.id': req.user?._id },
                  (err, foundSequences) => {
                    if (err) {
                      console.log(err);
                    } else {
                      res.render('layers/editrow', {
                        layer: foundLayer,
                        row: foundRow,
                        sequences: foundSequences,
                      });
                    }
                  },
                );
              }
            });
        }
      });
  },
);

// UPDATE ROW
router.put('/layers/:id/row/:pid', middleware.isLoggedIn, async (req: express.Request & { user?: IUserSchema}, res: express.Response) => {
  // CREATE ROW HERE?
  const row: any = {
    name: req.body.row.name,
  };
  if (!(req.body.sequenceid === 'none') && req.body.sequenceid) {
    row.sequence = req.body.sequenceid;
  }
  // FIND LAYER
  Layer.findById(req.params.id, (err, foundLayer) => {
    if (err) {
      console.log(err);
    } else {
      // FIND AND UPDATE ROW
      Row.findByIdAndUpdate(req.params.pid, row, (err) => {
        if (err) {
          console.log(err);
        } else {
          res.redirect(`/layers/${foundLayer._id}/layout`);
        }
      });
    }
  });
});

// DELETE ROW
router.delete(
  '/layers/:id/row/:pid',
  middleware.isLoggedIn,
  async (req: express.Request & { user?: IUserSchema}, res: express.Response) => {
    // FIND ROW
    // FIND LAYER
    Layer.findById(req.params.id, async (err, updatedLayer) => {
      if (err) {
        console.log(err);
      } else {
        // REMOVE ROW
        console.log(`Length before ${updatedLayer.rows.length}`);
        updatedLayer.rows.remove(req.params.pid);
        // DELETE ROW
        try {
          await Row.findByIdAndRemove(req.params.pid);

          console.log(`Length after ${updatedLayer.rows.length}`);
          res.redirect(`/layers/${updatedLayer._id}/layout`);
        } catch (err) {
          console.log(err);
        }
      }
    });
  },
);

export default router;

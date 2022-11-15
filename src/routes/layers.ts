import express from 'express'
var router = express.Router()
import Layer from '../models/layer'
import Parcel from '../models/parcel'
import System from '../models/system'
import Species from '../models/species'
import Animal from '../models/animal'
import Sequence from '../models/sequence'
import Row from '../models/row'
import middleware from '../middleware'
import logger from '../middleware/logger'
import unique from 'array-unique'

import {
  centroid,
  helpers as turf,
  length as turfLength,
  along,
  circle,
  area,
  polygonToLine,
} from '@turf/turf'

// SETUP MULTER
import multer from 'multer'
var storage = multer.memoryStorage()
var uploadMem = multer({ storage: storage })
// XML2JS
import xml2js from 'xml2js'
var parser = new xml2js.Parser()

// LAYER INDEX ROUTE

// NESTED PARCEL LAYER NEW ROUTE
router.get(
  '/parcels/:id/layers/new',
  middleware.isLoggedIn,
  function (req, res) {
    // FIND PARCEL ID
    Parcel.findById(req.params.id, function (err, foundParcel) {
      if (err) {
        console.log(err)
        logger.error(err.message)
        // res.flash(err
      } else {
        Species.find(function (err, foundSpecies) {
          if (err) {
            console.log(err)
          } else {
            function compare(a, b) {
              if (a.nameCommon < b.nameCommon) {
                return -1
              }
              if (a.nameCommon > b.nameCommon) {
                return 1
              }
              return 0
            }
            foundSpecies.sort(compare)
            Animal.find(function (err, foundAnimals) {
              if (err) {
                console.log(err)
              } else {
                function compare1(a, b) {
                  if (a.name < b.name) {
                    return -1
                  }
                  if (a.name > b.name) {
                    return 1
                  }
                  return 0
                }
                foundAnimals.sort(compare1)
                res.render('layers/new', {
                  parcel: foundParcel,
                  species: foundSpecies,
                  animals: foundAnimals,
                })
              }
            })
          }
        })
      }
    })
  }
)

// NESTED PARCEL LAYER NEW WITH UPLOAD ROUTE
router.get(
  '/parcels/:id/layers/newkml',
  middleware.isLoggedIn,
  function (req, res) {
    // FIND PARCEL ID
    Parcel.findById(req.params.id, function (err, foundParcel) {
      if (err) {
        console.log(err)
        logger.error(err.message)
        // res.flash(err
      } else {
        Species.find(function (err, foundSpecies) {
          if (err) {
            console.log(err)
          } else {
            function compare(a, b) {
              if (a.nameCommon < b.nameCommon) {
                return -1
              }
              if (a.nameCommon > b.nameCommon) {
                return 1
              }
              return 0
            }
            foundSpecies.sort(compare)
            Animal.find(function (err, foundAnimals) {
              if (err) {
                console.log(err)
              } else {
                function compare1(a, b) {
                  if (a.name < b.name) {
                    return -1
                  }
                  if (a.name > b.name) {
                    return 1
                  }
                  return 0
                }
                foundAnimals.sort(compare1)
                res.render('layers/newkml', {
                  parcel: foundParcel,
                  species: foundSpecies,
                  animals: foundAnimals,
                })
              }
            })
          }
        })
      }
    })
  }
)

// NESTED PARCEL LAYER CREATE ROUTE
router.post(
  '/parcels/:id/layers',
  middleware.checkParcelOwnership,
  function (req, res) {
    // Lookup place using id
    Parcel.findById(req.params.id, function (err, foundParcel) {
      if (err) {
        console.log(err)
        // @ts-ignore
        res.redirect('/users/' + req.user.id)
      } else {
        Layer.create(req.body.layer, function (err, layer) {
          if (err) {
            console.log(err)
          } else {
            // Add username and ID to Layer.
            // @ts-ignore
            layer.owner.id = req.user._id
            // @ts-ignore
            layer.owner.username = req.user.username
            // Save JSON file to geometry
            layer.geometry = req.body.geometry
            layer.size = req.body.layersize
            var geometrycentroid = centroid(JSON.parse(req.body.geometry))
            console.log(geometrycentroid.geometry.coordinates[0])
            layer.lat = geometrycentroid.geometry.coordinates[1]
            layer.lng = geometrycentroid.geometry.coordinates[0]
            // Save the layer
            layer.save()
            // Connect new layer to parcel
            foundParcel.layers.push(layer) // MOVE THIS UP TO AVOID ERRORS IF LAYER FAILS?!!!
            foundParcel.save()
            console.log(layer)
            // Redirect to parcels SHOW page
            // req.flash("success", "Successfully added comment");
            /*if(layer.type == "agroforestry"){
                        res.redirect("/layers/" + layer._id + '/systems/newgrid');
                    } else {*/
            var tempspecies = req.body.maincrop
            if (req.body.maincrop === '') {
              tempspecies = '5e665452cccc150b186d4cd1'
            }
            Species.findById(tempspecies, function (err, foundSpecies) {
              if (err) {
                console.log(err)
              } else {
                // DEFINE SYSTEM WITH ONE ROW AND ONE SPECIES
                var presentsystem: any = {
                  name: foundSpecies.nameCommon + ' monoculture',
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
                    // @ts-ignore
                    id: req.user._id,
                    // @ts-ignore
                    username: req.user.username,
                  },
                  animals: [],
                }
                // FIND ANIMAL AND PUSH TO SYSTEM
                if (!(req.body.animal === '')) {
                  Animal.findById(req.body.animal, function (err, foundAnimal) {
                    if (err) {
                      console.log(err)
                    } else {
                      presentsystem.animals.push(foundAnimal)
                      // CREATE SYSTEM
                      System.create(
                        presentsystem,
                        function (err, createdSystem) {
                          if (err) {
                            console.log(err)
                          } else {
                            // ASS SYSTEM TO PRESENT SYSTEM
                            layer.systems.present = createdSystem
                            layer.save()
                            // IF FOREST OR ORCHARD GO TO LAYOUT
                            if (
                              layer.type === 'forestry' ||
                              layer.type === 'orchard'
                            ) {
                              res.redirect('/layers/' + layer._id + '/layout')
                            } else {
                              res.redirect('/layers/' + layer._id)
                            }
                          }
                        }
                      )
                    }
                  })
                } else {
                  // CREATE SYSTEM
                  System.create(presentsystem, function (err, createdSystem) {
                    if (err) {
                      console.log(err)
                    } else {
                      // ASS SYSTEM TO PRESENT SYSTEM
                      layer.systems.present = createdSystem
                      layer.save()
                      // IF FOREST OR ORCHARD GO TO LAYOUT
                      if (
                        layer.type === 'forestry' ||
                        layer.type === 'orchard'
                      ) {
                        res.redirect('/layers/' + layer._id + '/layout')
                      } else {
                        res.redirect('/layers/' + layer._id)
                      }
                    }
                  })
                }
              }
            })
            /*}*/
          }
        })
      }
    })
  }
)

// NESTED PARCEL LAYER CREATE WITH UPLOAD ROUTE
router.post(
  '/parcels/:id/layersuploadkml',
  middleware.checkParcelOwnership,
  uploadMem.single('filename'),
  function (req, res) {
    // CHECK EXISTING AREAS SIZE!?

    // PARSE UPLOADED FILE AND CREATE POLYGON
    // @ts-ignore
    parser.parseString(req.file.buffer, function (err, result) {
      if (err) {
        req.flash('error', err.message)
        // console.log(err);
        res.redirect('back')
      } else {
        var string =
          result.kml.Document[0].Placemark[0].Polygon[0].outerBoundaryIs[0]
            .LinearRing[0].coordinates[0]
        var splitString = string.split(' ')
        // CREATE NEW ARRAY HERE? OR IS THIS OBSOLETE?
        var array: any[] = []
        for (let i = 0; i < splitString.length; i++) {
          var apples = JSON.parse('[' + splitString[i] + ']')
          array.push(apples)
        }
        // CHECK IF LAST ARRAY IS EMPTY?
        if (array[array.length - 1].length === 0) {
          console.log('last is empty array')
          array.pop()
        }
        // THEN ADD HERE?!
        var polygon = turf.polygon([array])
        var size = area(polygon)
        var geometry = JSON.stringify(polygon)
        // FIND PARCEL
        Parcel.findById(req.params.id, function (err, foundParcel) {
          if (err) {
            console.log(err)
          } else {
            Layer.create(req.body.layer, function (err, createdLayer) {
              if (err) {
                console.log(err)
              } else {
                // @ts-ignore
                createdLayer.owner.id = req.user._id
                // @ts-ignore
                createdLayer.owner.username = req.user.username
                createdLayer.geometry = geometry
                // CALCULATE LAYER SIZE
                createdLayer.size = size
                // GEOMETRY CENTROID FOR LAT AND LNG
                var geometrycentroid = centroid(polygon.geometry)
                createdLayer.lat = geometrycentroid.geometry.coordinates[1]
                createdLayer.lng = geometrycentroid.geometry.coordinates[0]
                // Save the layer
                createdLayer.save()
                // PUSH LAYER TO PARCEL
                foundParcel.layers.push(createdLayer)
                foundParcel.save()
                // DEFINE SYSTEM
                if (createdLayer.type == 'agroforestry') {
                  res.redirect('/layers/' + createdLayer._id + '/systems/new')
                } else {
                  var tempspecies = req.body.maincrop
                  if (req.body.maincrop === '') {
                    tempspecies = '5e665452cccc150b186d4cd1'
                  }
                  Species.findById(tempspecies, function (err, foundSpecies) {
                    if (err) {
                      console.log(err)
                    } else {
                      // DEFINE SYSTEM WITH ONE ROW AND ONE SPECIES
                      var presentsystem: any = {
                        name: foundSpecies.nameCommon + ' monoculture',
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
                          // @ts-ignore
                          id: req.user._id,
                          // @ts-ignore
                          username: req.user.username,
                        },
                        animals: [],
                      }
                      // FIND ANIMAL AND PUSH TO SYSTEM
                      if (!(req.body.animal === '')) {
                        Animal.findById(
                          req.body.animal,
                          function (err, foundAnimal) {
                            if (err) {
                              console.log(err)
                            } else {
                              presentsystem.animals.push(foundAnimal)
                              // CREATE SYSTEM
                              System.create(
                                presentsystem,
                                function (err, createdSystem) {
                                  if (err) {
                                    console.log(err)
                                  } else {
                                    // ADD SYSTEM TO PRESENT SYSTEM
                                    createdLayer.systems.present = createdSystem
                                    createdLayer.save()
                                    // IF FOREST OR ORCHARD GO TO LAYOUT
                                    if (
                                      //@ts-ignore
                                      layer.type === 'forestry' ||
                                      //@ts-ignore
                                      layer.type === 'orchard'
                                    ) {
                                      res.redirect(
                                        //@ts-ignore
                                        '/layers/' + layer._id + '/layout'
                                      )
                                    } else {
                                      //@ts-ignore
                                      res.redirect('/layers/' + layer._id)
                                    }
                                  }
                                }
                              )
                            }
                          }
                        )
                      } else {
                        // CREATE SYSTEM
                        System.create(
                          presentsystem,
                          function (err, createdSystem) {
                            if (err) {
                              console.log(err)
                            } else {
                              // ADD SYSTEM TO PRESENT SYSTEM
                              createdLayer.systems.present = createdSystem
                              createdLayer.save()
                              // IF FOREST OR ORCHARD GO TO LAYOUT
                              if (
                                //@ts-ignore
                                layer.type === 'forestry' ||
                                //@ts-ignore
                                layer.type === 'orchard'
                              ) {
                                //@ts-ignore
                                res.redirect('/layers/' + layer._id + '/layout')
                              } else {
                                //@ts-ignore
                                res.redirect('/layers/' + layer._id)
                              }
                            }
                          }
                        )
                      }
                    }
                  })
                }
              }
            })
          }
        })
      }
    })
  }
)

// LAYER SHOW ROUTES
router.get('/layers/:id', middleware.isLoggedIn, async function (req, res) {
  // MAKE LAYER OWNERSHIP MIDDLEWARE
  try {
    let foundLayer = await Layer.findById(req.params.id)
      .populate('systems.future')
      .populate('projects')
      .populate('systems.present')
      .populate('systems.past')
      .exec()
    if (foundLayer) {
      if (foundLayer.systems.present === undefined) {
        res.redirect('/layers/' + foundLayer._id + '/systems/newgrid')
      } else {
        let foundSystem = await System.findById(foundLayer.systems.present._id)
          .populate('model.species')
          .populate('animals')
          .exec()

        if (foundSystem) {
          // FIND ALL SPECIES IN SYSTEM
          var allSpecies: any[] = []
          var dataset: any[] = []
          foundSystem.model.forEach(function (species) {
            allSpecies.push(species.species)
            var count = 0
            for (let i = 0; i < dataset.length; i++) {
              if (dataset[i].row === species.position[0]) {
                dataset[i].array.push(species)
                count = count + 1
              }
            }
            if (count === 0) {
              dataset.push({ row: species.position[0], array: [species] })
            }
          })
          // FIND UNIQUE SPECIES / REMOVE DUPLICATES
          var uniqueSpecies = unique(allSpecies)
          // SORT FIRST ROW ITEMS
          function compare1(a, b) {
            if (a.position[1] < b.position[1]) {
              return -1
            }
            if (a.position[1] > b.position[1]) {
              return 1
            }
            return 0
          }
          for (let i = 0; i < dataset.length; i++) {
            dataset[i].array.sort(compare1)
            console.log(dataset[i].array[0])
          }
          // FIND SPECIES AND POPULATE FLOWS
          Species.find({ _id: uniqueSpecies })
            .populate('flows')
            .exec(function (err, foundSpecies) {
              if (err) {
                console.log(err)
              } else {
                res.render('layers/show', {
                  layer: foundLayer,
                  presentsystem: foundSystem,
                  species: foundSpecies,
                  rows: dataset,
                })
              }
            })
        }
      }
    }
  } catch (err) {
    console.log(err)
  }
})

// LAYER EDIT ROUTE
router.get('/layers/:id/edit', middleware.isLoggedIn, function (req, res) {
  // MAKE LAYER OWNERSHIP MIDDLEWARE
  // Find specific activity in database
  Layer.findById(req.params.id, function (err, foundLayer) {
    if (err) {
      console.log(err)
    } else {
      res.render('layers/edit', { layer: foundLayer })
    }
  })
})

// LAYER UPDATE ROUTE
router.put('/layers/:id', middleware.isLoggedIn, function (req, res) {
  Layer.findByIdAndUpdate(
    req.params.id,
    req.body.layer,
    function (err, updatedLayer) {
      if (err) {
        console.log(err)
      } else {
        console.log(updatedLayer)
        res.redirect('/layers/' + req.params.id)
      }
    }
  )
})

// LAYER DELETE ROUTE
router.delete('/layers/:id', middleware.isLoggedIn, function (req: any, res) {
  // CHECK OWNERSHIP
  Layer.findById(req.params.id, function (err, foundLayer) {
    if (err) {
      console.log(err)
      res.redirect('/users/' + req.user.id)
    } else {
      // REMOVE LAYER FROM PARCEL
      Parcel.find({ 'owner.id': req.user._id }, function (err, foundParcels) {
        if (err) {
          console.log(err)
          res.redirect('/users/' + req.user.id)
        } else {
          // CYCLE THROUGH PARCELS
          var parcelRef = {}
          for (let i = 0; i < foundParcels.length; i++) {
            // CYCLE THROUGH LAYERS
            for (let j = 0; j < foundParcels[i].layers.length; j++) {
              if (foundParcels[i].layers[j].equals(foundLayer._id)) {
                //@ts-ignore TODO: Remove not present?
                foundParcels[i].layers.remove(foundLayer)
                console.log('Layer removed')
                foundParcels[i].save()
                parcelRef = foundParcels[i]._id
              }
            }
          }
          // REMOVE LAYER FROM PARCEL HERE WHEN IT IS FOUND?!
          res.redirect('/parcels/' + parcelRef)
          // DELETE LAYER TEMP REMOVED
          /*Layer.findByIdAndRemove(req.params.id, function(err){
                        if(err){
                            console.log(err);
                            res.redirect("/parcels");
                        } else {
                            res.redirect("/parcels");
                        }
                    });*/
        }
      })
    }
  })
})

// LAYER CURRENT SYSTEM UPDATE
router.post(
  '/layers/:id/presentsystem',
  middleware.isLoggedIn,
  function (req, res) {
    Layer.findById(req.params.id, function (err, foundLayer) {
      if (err) {
        console.log(err)
      } else {
        System.findById(req.body.systemid, function (err, foundSystem) {
          if (err) {
            console.log(err)
          } else {
            // PUSH CURRENT SYSTEM TO PAST
            if (!(foundLayer.systems.present == '')) {
              foundLayer.systems.past.push(foundLayer.systems.present)
            }
            // SET CURRENT SYSTEM TO FUTURE DRAFT
            foundLayer.systems.present = foundSystem
            foundLayer.type = 'agroforestry'
            console.log(foundSystem.name + ' has been set to current system')
            // REMOVE FUTURE DRAFT FROM FUTURE ARRAY
            foundLayer.systems.future.remove(foundSystem)
            console.log(
              foundSystem.name + ' has been removed from future systems'
            )
            foundLayer.save()
            res.redirect('/layers/' + foundLayer._id)
          }
        })
      }
    })
  }
)

// LAYER ADD FUTURE SYSTEM DRAFT
router.post(
  '/layers/:id/editfuture',
  middleware.isLoggedIn,
  function (req, res) {
    Layer.findById(req.params.id, function (err, foundLayer) {
      if (err) {
        console.log(err)
      } else {
        System.findById(req.body.systemid, function (err, foundSystem) {
          if (err) {
            console.log(err)
          } else {
            foundLayer.systems.future.push(foundSystem)
            foundLayer.save()
            console.log(
              'Now there is ' +
                foundLayer.systems.future.length +
                ' future drafts on this area'
            )
            res.redirect('/layers/' + foundLayer._id)
          }
        })
      }
    })
  }
)

// LAYER CURRENT SYSTEM LAYOUT
router.get(
  '/layers/:id/layout',
  middleware.isLoggedIn,
  async function (req, res) {
    // MAKE LAYER OWNERSHIP MIDDLEWARE
    try {
      let foundLayer = await Layer.findById(req.params.id)
        .populate('systems.present')
        .populate('assets')
        .populate({
          path: 'rows',
          populate: { path: 'sequence', populate: { path: 'model.species' } },
        })
        .populate({ path: 'areas', populate: { path: 'rotation' } })
        .exec()

      if (foundLayer) {
        let foundSystem = await System.findById(foundLayer.systems.present._id)
          .populate('model.species')
          .populate('animals')
          .exec()
        if (foundSystem) {
          // FIND ALL SPECIES IN SYSTEM
          var allSpecies: any[] = []
          foundSystem.model.forEach(function (species) {
            allSpecies.push(species.species.id)
          })
          //

          // FIND UNIQUE SPECIES / REMOVE DUPLICATES
          var uniqueSpecies = unique(allSpecies)
          // FIND SPECIES AND POPULATE FLOWS
          let foundSpecies = await Species.find({ _id: uniqueSpecies })
            .populate('flows')
            .exec()

          var polygon = JSON.parse(foundLayer.geometry)
          // FIND SYSTEM ROWS
          var dataset: any[] = []
          foundSystem.model.forEach(function (species) {
            var count = 0
            for (let i = 0; i < dataset.length; i++) {
              if (dataset[i].row === species.position[0]) {
                dataset[i].array.push(species)
                count = count + 1
              }
            }
            if (count === 0) {
              dataset.push({
                row: species.position[0],
                array: [species],
              })
            }
          })
          // SORT FIRST ROW ITEMS
          function compare1(a, b) {
            if (a.position < b.position) {
              return -1
            }
            if (a.position > b.position) {
              return 1
            }
            return 0
          }
          /*for(let i=0;i<dataset.length;i++){
                          dataset[i].array.sort(compare1);
                      }*/
          // VIZ ROWS
          var rowArray: any[] = []
          var placesArray: any[] = []
          for (let i = 0; i < foundLayer.rows.length; i++) {
            // ROW VIZ
            var rowGeometry = JSON.parse(foundLayer.rows[i].geometry)
            rowArray.push(rowGeometry)
            // PLACES
            var properties = {
              description: foundLayer.rows[i].name,
            }
            var place = turf.point(
              rowGeometry.geometry.coordinates[1],
              properties
            )
            placesArray.push(place)
          }
          // ROW LABELS (BEFORE ROWS ARE PARSED)
          var placesCollection = turf.featureCollection(placesArray)
          var places = JSON.stringify(placesCollection)
          // CREATE PLACES FEATURE
          var featurecollection = turf.featureCollection(rowArray)
          var collection = JSON.stringify(featurecollection)
          // COUNT ASSETS IN ROW SYSTEMS - ONLY TAKE FIRST ROW?!
          /*for(let i=0;i<foundLayer.rows.length;i++){
                          for(let j=0;j<foundLayer.rows[i].system.model.length;j++){
                              foundLayer.rows[i].system.populate("model." + j + ".species");
                          }
                      }*/
          var treeAssetsArray: any[] = []
          // SET COLLECTIVE TREE ARRAY
          var treeMarkerArray: any[] = []
          var treeAssetArray: any[] = []
          // FIND SYSTEM ROWS
          for (let i = 0; i < foundLayer.rows.length; i++) {
            // SET ROW DATA
            if (foundLayer.rows[i].sequence) {
              var datasetRows = foundLayer.rows[i].sequence.model
              /*foundLayer.rows[i].sequence.model.forEach(function (species) {
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
                              });*/
              // SORT ROW ITEMS
              datasetRows.sort(compare1)
              // ROW LENGTH
              var rowLine = JSON.parse(foundLayer.rows[i].geometry)
              var rowLength = turfLength(rowLine, { units: 'meters' })
              console.log('Row length ' + rowLength)
              // SYSTEM MODEL LENGTH
              var systemModelLength = foundLayer.rows[i].sequence.sequencelength
              /*if (datasetRows[0].array[(datasetRows[0].array.length - 1)].position[1] <= 1) {
                                  systemModelLength = datasetRows[1].array[(datasetRows[1].array.length - 1)].position[1];
                              } else {
                                  systemModelLength = datasetRows[0].array[(datasetRows[0].array.length - 1)].position[1];
                              }*/
              console.log('System model length:' + systemModelLength)
              // FIND MODEL COUNT AND REST
              var systemModelCount = Math.floor(rowLength / systemModelLength)
              var systemModelRowRest =
                (rowLength / systemModelLength -
                  Math.floor(rowLength / systemModelLength)) *
                systemModelLength
              // ADD FIRST TREE IN EACH ROW - ADD LAST SPECIES IN ARRAY - DO IF TO CHECK DISTANCE
              var firstTreeMarker = turf.point(rowLine.geometry.coordinates[0])
              treeMarkerArray.push(firstTreeMarker)
              var firstAsset = {
                marker: firstTreeMarker,
                species: datasetRows[datasetRows.length - 1].species,
              }
              treeAssetsArray.push(firstAsset)
              // ROW MARKERS
              // CALCULATE LENGTH ITERATIONS - EITHER ADD TO ARRAY COUNTER OR JUST SORT LATER
              for (let j = 0; j < systemModelCount; j++) {
                for (let k = 0; k < datasetRows.length; k++) {
                  // CREATE COORDINATES FOR THE TREE
                  var treeMarker = along(
                    rowLine,
                    j * systemModelLength + datasetRows[k].position,
                    { units: 'meters' }
                  )
                  // CREATE ASSET OBJECT
                  /*var asset = {
                                          species: treeRows[treeRowCount].array[k].species.id,
                                          lat: treeMarker.geometry.coordinates[0],
                                          lng: treeMarker.geometry.coordinates[1],
                                          name: treeRows[treeRowCount].array[k].species.nameCommon
                                      };*/
                  //
                  var asset = {
                    marker: treeMarker,
                    species: datasetRows[k].species,
                  }
                  // ADD TREE OBJECT TO ARRAY
                  treeMarkerArray.push(treeMarker)
                  treeAssetsArray.push(asset)
                }
              }
              // ADD REST
              for (let j = 0; j < datasetRows.length; j++) {
                if (datasetRows[j].position < systemModelRowRest) {
                  /*
                                                                              treeArray.push(treeRows[treeRowCount].array[j].species);
                                      */
                  // ADD POINT MARKER FOR REMAINING TREES
                  var treeMarker2 = along(
                    rowLine,
                    systemModelCount * systemModelLength +
                      datasetRows[j].position,
                    { units: 'meters' }
                  )
                  var asset2 = {
                    marker: treeMarker2,
                    species: datasetRows[j].species,
                  }
                  treeMarkerArray.push(treeMarker2)
                  treeAssetsArray.push(asset2)
                }
              }
            }
          }
          // DO POINT COLLECTION
          var treeCanopyArray: any[] = []
          var vegeCanopyArray: any[] = []
          if (treeAssetsArray.length < 4000) {
            for (let i = 0; i < treeAssetsArray.length; i++) {
              // FIND TREE DIMENSIONS
              var diameter = 1
              if (
                treeAssetsArray[i].species.form === 'shrub' ||
                treeAssetsArray[i].species.form === 'giantherb'
              ) {
                diameter = 0.5
              } else if (treeAssetsArray[i].species.form === 'herb') {
                diameter = 0.2
              }
              var circle1 = circle(
                treeAssetsArray[i].marker.geometry.coordinates,
                diameter,
                { units: 'meters' }
              )
              if (treeAssetsArray[i].species.height > 15) {
                treeCanopyArray.push(circle1)
              } else {
                vegeCanopyArray.push(circle1)
              }
            }
          }
          var treeMarkers = turf.featureCollection(treeCanopyArray)
          var treeCollection = JSON.stringify(treeMarkers)
          // INSERT SYSTEM CLASSIFICATION
          var vegeMarkers = turf.featureCollection(vegeCanopyArray)
          var vegeCollection = JSON.stringify(vegeMarkers)
          // DO TREE NAMES COLLECTION
          var treenames: any[] = []
          for (let i = 0; i < treeAssetsArray.length; i++) {
            var properties1 = {
              description: treeAssetsArray[i].species.nameCommon.slice(0, 3),
            }
            var treename = turf.point(
              treeAssetsArray[i].marker.geometry.coordinates,
              properties1
            )
            treenames.push(treename)
          }
          var treenamemarks = turf.featureCollection(treenames)
          var treeNameCollection = JSON.stringify(treenamemarks)
          // COUNT ASSETS

          // COMBINE ASSETS AND ROW BASED

          // AREAS
          var alleyPolygonArray: any[] = []
          var bedPolygonArray: any[] = []
          for (let i = 0; i < foundLayer.areas.length; i++) {
            // ROW VIZ
            var areaGeometry = JSON.parse(foundLayer.areas[i].geometry)
            if (foundLayer.areas[i].name.charAt(0) === 'A') {
              alleyPolygonArray.push(areaGeometry)
            } else if (foundLayer.areas[i].name.charAt(0) === 'T') {
              bedPolygonArray.push(areaGeometry)
            } else {
              alleyPolygonArray.push(areaGeometry)
            }
          }
          var bedArrayPolygons = turf.featureCollection(bedPolygonArray)
          var stripsCollection = JSON.stringify(bedArrayPolygons)
          var alleyArrayPolygons = turf.featureCollection(alleyPolygonArray)
          var alleysCollection = JSON.stringify(alleyArrayPolygons)
          res.render('layers/layout', {
            layer: foundLayer,
            presentsystem: foundSystem,
            species: foundSpecies,
            collection: collection,
            places: places,
            trees: treeCollection,
            treenames: treeNameCollection,
            vegetables: vegeCollection,
            strips: stripsCollection,
            alleys: alleysCollection,
          })
        }
      }
    } catch (err) {
      console.log(err)
    }
  }
)

// NEW SPLIT LAYER ROUTE
router.get('/layers/:id/split', middleware.isLoggedIn, function (req, res) {
  // FIND LAYER
  Layer.findById(req.params.id, function (err, foundLayer) {
    if (err) {
      console.log(err)
    } else {
      res.render('layers/split', { layer: foundLayer })
    }
  })
})

// CREATE SPLIT LAYER ROUTE
router.post('/layers/:id/split', middleware.isLoggedIn, function (req, res) {
  // FIND LAYER
  Layer.findById(req.params.id, function (err, foundLayer) {
    if (err) {
      console.log(err)
    } else {
      // FIND LAYER GEOMETRY
      var polygon = JSON.parse(foundLayer.geometry)
      // PARSE SPLIT LINE
      var splitLine = JSON.parse(req.body.geometry)
      console.log(splitLine)
      // CHECK THAT ALL LINE POINTS EXCEPT LAST ARE WITHIN POLYGON

      // SPLIT LAYER GEOMETRY WITH SPLIT LINE
      // SET VARIABLES FOR INTERSECTION WITH POLYGON
      var matchPoint1 = turf.point(splitLine.geometry.coordinates[0])
      console.log('matchPoint1: ' + matchPoint1)
      var matchPoint2 = turf.point(splitLine.geometry.coordinates[1])
      // SET GEOMETRY LINE SEGMENT INDEX VARIABLES
      console.log(
        'length of polygon array: ' + polygon.geometry.coordinates[0].length
      )
      var lineA = 0
      var lineAcount = 0
      var lineB = 0
      var lineBcount = 0
      var polyLine = polygonToLine(polygon)
      // @ts-ignore
      console.log(
        //@ts-ignore
        'length of polyline array: ' + polyLine.geometry.coordinates.length
      )
      for (let k = 0; k < polygon.geometry.coordinates[0].length - 1; k++) {
        var lineA1 = turf.lineString(
          [
            polygon.geometry.coordinates[0][k],
            splitLine.geometry.coordinates[0],
          ],
          { name: 'line A1' }
        )
        var lineA2 = turf.lineString(
          [
            splitLine.geometry.coordinates[0],
            polygon.geometry.coordinates[0][k + 1],
          ],
          { name: 'line A2' }
        )
        var lineAdistance =
          turfLength(lineA1, { units: 'meters' }) +
          turfLength(lineA2, { units: 'meters' })
        if (k === 0) {
          lineAcount = lineAdistance
        }
        if (lineAdistance < lineAcount) {
          lineAcount = lineAdistance
          lineA = k
        }
        console.log(lineAdistance)
        // LINE B
        var lineB1 = turf.lineString(
          [
            polygon.geometry.coordinates[0][k],
            splitLine.geometry.coordinates[1],
          ],
          { name: 'line B1' }
        )
        var lineB2 = turf.lineString(
          [
            splitLine.geometry.coordinates[1],
            polygon.geometry.coordinates[0][k + 1],
          ],
          { name: 'line B2' }
        )
        var lineBdistance =
          turfLength(lineB1, { units: 'meters' }) +
          turfLength(lineB2, { units: 'meters' })
        if (k === 0) {
          lineBcount = lineBdistance
        }
        if (lineBdistance < lineBcount) {
          lineBcount = lineBdistance
          lineB = k
        }
        console.log(lineBdistance)
      }
      console.log(lineA)
      console.log(lineB)
      // IF B IS LARGER THAN A, FLIP WHOLE LINE
      /*if(lineA > lineB){
                splitLine.geometry.coordinates.reverse();
            }*/
      // SAVE ONE GEOMETRY ON OLD LAYER AND RENAME
      var polygonCoordinates = polygon.geometry.coordinates[0]
      console.log('before splice: ' + polygonCoordinates)
      var segmentLength = lineB - lineA
      polygonCoordinates.splice(
        lineA + 1,
        segmentLength,
        splitLine.geometry.coordinates[0],
        splitLine.geometry.coordinates[1]
      )
      console.log('after splice: ' + polygonCoordinates)
      var newPolygon = turf.polygon([polygonCoordinates], { name: 'poly1' })
      console.log('String poly ' + JSON.stringify(newPolygon))
      var newPolygonString = JSON.stringify(newPolygon)
      Layer.findByIdAndUpdate(
        req.params.id,
        { $set: { geometry: newPolygonString } },
        function (err, updatedField) {
          if (err) {
            console.log(err)
          } else {
            // CREATE NEW LAYER WITH NEW NAME AND GEOMETRY

            res.redirect('/layers/' + foundLayer._id)
          }
        }
      )
    }
  })
})

// ROW NEW ROUTE
router.get(
  '/layers/:id/row/new',
  middleware.isLoggedIn,
  function (req: any, res) {
    // FIND PROJECT
    Layer.findById(req.params.id, function (err, foundLayer) {
      if (err) {
        console.log(err)
      } else {
        // FIND MY SYSTEMS
        Sequence.find(
          { 'owner.id': req.user._id },
          function (err, foundSequences) {
            if (err) {
              console.log(err)
            } else {
              res.render('layers/row', {
                layer: foundLayer,
                sequences: foundSequences,
              })
            }
          }
        )
      }
    })
  }
)

// ROW CREATE ROUTE
router.post(
  '/layers/:id/row',
  middleware.isLoggedIn,
  async function (req, res) {
    // IF NO GEOMETRY
    if (req.body.geometry === '') {
      res.redirect('back')
    } else {
      // CREATE ROW HERE?
      var row: any = {
        geometry: req.body.geometry,
        name: req.body.row.name,
      }
      if (!(req.body.sequenceid === 'none') && req.body.sequenceid) {
        row.sequence = req.body.sequenceid
      }
      console.log(row)
      // CREATE ROW
      try {
        let createdRow = await Row.create(row)
        try {
          let updatedLayer = await Layer.findByIdAndUpdate(req.params.id, {
            $addToSet: { rows: createdRow },
          })

          // CREATE ROW
          console.log('Row has been added to layer')
          res.redirect('/layers/' + updatedLayer?.id + '/layout')
        } catch (err) {
          console.log(err)
        }
      } catch (err) {
        console.log(err)
      }
    }
  }
)

// EDIT ROW
router.get(
  '/layers/:id/row/:pid/edit',
  middleware.isLoggedIn,
  function (req: any, res) {
    // FIND LAYER
    Layer.findById(req.params.id)
      .populate({ path: 'rows', populate: { path: 'sequence' } })
      .exec(function (err, foundLayer) {
        if (err) {
          console.log(err)
        } else {
          // FIND ROW
          Row.findById(req.params.pid)
            .populate('sequence')
            .exec(function (err, foundRow) {
              if (err) {
                console.log(err)
              } else {
                // FIND MY SYSTEMS
                Sequence.find(
                  { 'owner.id': req.user._id },
                  function (err, foundSequences) {
                    if (err) {
                      console.log(err)
                    } else {
                      res.render('layers/editrow', {
                        layer: foundLayer,
                        row: foundRow,
                        sequences: foundSequences,
                      })
                    }
                  }
                )
              }
            })
        }
      })
  }
)

// UPDATE ROW
router.put('/layers/:id/row/:pid', middleware.isLoggedIn, function (req, res) {
  // CREATE ROW HERE?
  var row: any = {
    name: req.body.row.name,
  }
  if (!(req.body.sequenceid === 'none') && req.body.sequenceid) {
    row.sequence = req.body.sequenceid
  }
  // FIND LAYER
  Layer.findById(req.params.id, function (err, foundLayer) {
    if (err) {
      console.log(err)
    } else {
      // FIND AND UPDATE ROW
      Row.findByIdAndUpdate(req.params.pid, row, function (err, updatedRow) {
        if (err) {
          console.log(err)
        } else {
          res.redirect('/layers/' + foundLayer._id + '/layout')
        }
      })
    }
  })
})

// DELETE ROW
router.delete(
  '/layers/:id/row/:pid',
  middleware.isLoggedIn,
  function (req, res) {
    // FIND ROW
    // FIND LAYER
    Layer.findById(req.params.id, async function (err, updatedLayer) {
      if (err) {
        console.log(err)
      } else {
        // REMOVE ROW
        console.log('Length before ' + updatedLayer.rows.length)
        updatedLayer.rows.remove(req.params.pid)
        // DELETE ROW
        try {
          await Row.findByIdAndRemove(req.params.pid)

          console.log('Length after ' + updatedLayer.rows.length)
          res.redirect('/layers/' + updatedLayer._id + '/layout')
        } catch (err) {
          console.log(err)
        }
      }
    })
  }
)

export default router

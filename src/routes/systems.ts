import express from 'express'
var router = express.Router()
import unique from 'array-unique'
import System from '../models/system'
import Layer from '../models/layer'
import Species from '../models/species'
import Parcel from '../models/parcel'
import Animal from '../models/animal'
import Project from '../models/project'
import middleware from '../middleware'

// SYSTEM INDEX
router.get('/systems', middleware.adminIsLoggedIn, function (req, res) {
  System.find(function (err, foundSystems) {
    if (err) {
      console.log(err)
    } else {
      res.render('systems/index', { systems: foundSystems })
    }
  })
})

// NESTED AREA SYSTEM INDEX
/*router.get("/layers/:id/systems", middleware.isLoggedIn, function(req, res){
    // FIND LAYER ID
    Layer.findById(req.params.id).populate("systems.future").populate("systems.present").populate("systems.past").exec(function(err, foundLayer){
        if(err) {
            console.log(err);
        } else {
            res.render("systems/index", {layer: foundLayer});
        }
    });
});*/

// NEW AREA SYSTEM GRID NEW ROUTE
router.get(
  '/layers/:id/systems/newgrid',
  middleware.isLoggedIn,
  function (req, res) {
    // FIND LAYER
    Layer.findById(req.params.id, function (err, foundLayer) {
      if (err) {
        console.log(err)
      } else {
        res.render('systems/newgrid', { layer: foundLayer })
      }
    })
  }
)

// NEW AREA SYSTEM GRID REDIRECT ROUTE
router.post(
  '/layers/:id/systems/newgrid',
  middleware.isLoggedIn,
  function (req, res) {
    // CHECK LENGTH IS DIVISIBLE
    if ((req.body.length / req.body.distance) % 1 === 0) {
      // FIND LAYER
      Layer.findById(req.params.id, function (err, foundLayer) {
        if (err) {
          console.log(err)
        } else {
          res.redirect(
            '/layers/' +
              foundLayer._id +
              '/systems/new?rows=' +
              req.body.rows +
              '&distance=' +
              req.body.distance +
              '&length=' +
              req.body.length
          )
        }
      })
    } else {
      req.flash(
        'error',
        'Length must be divisible with distance between speciee in rows.'
      )
      res.redirect('back')
    }
  }
)

// NESTED AREA SYSTEM NEW ROUTE
router.get(
  '/layers/:id/systems/new',
  middleware.isLoggedIn,
  function (req, res) {
    // FIND LAYER ID
    Layer.findById(req.params.id, function (err, foundLayer) {
      if (err) {
        console.log(err)
      } else {
        // FIND ALL SPECIES IN THE DATABASE
        Species.find(function (err, foundSpecies) {
          if (err) {
            console.log(err)
          } else {
            // SORT SPECIES
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
            // FIND ALL ANIMALS AND SORT
            Animal.find(function (err, foundAnimals) {
              if (err) {
                console.log(err)
              } else {
                // SORT ANIMALS
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
                // RENDER NEW SYSTEM PAGE WITH SPECIES
                res.render('systems/new', {
                  layer: foundLayer,
                  species: foundSpecies,
                  animals: foundAnimals,
                  rows: req.query.rows,
                  distance: req.query.distance,
                  length: req.query.length,
                })
              }
            })
          }
        })
      }
    })
  }
)

// NESTED AREA SYSTEM CREATE ROUTE
router.post(
  '/layers/:id/systems',
  middleware.isLoggedIn,
  function (req: any, res) {
    // FIND LAYER
    Layer.findById(req.params.id, function (err, foundLayer) {
      if (err) {
        console.log(err)
      } else {
        var system = req.body.system
        var model: any[] = []
        // DO COUNT FOR ROW WIDTH
        var xPosition = 0
        // ADD SPECIES TO MODEL
        for (let i = 0; i < system.model.length; i++) {
          // FIX IF ONLY ONE ITEM IN ROW
          if (system.model[i].species.id instanceof Array) {
            for (let j = 0; j < system.model[i].species.id.length; j++) {
              // IF SPECIES ID IS NULL
              if (!(system.model[i].species.id[j] === '')) {
                var species = {
                  species: system.model[i].species.id[j],
                  position: [
                    Number(system.model[i].distance) + xPosition,
                    Number(system.model[i].species.y[j]),
                  ],
                  width: Number(system.model[i].width),
                }
                model.push(species)
              }
            }
          } else {
            // FIX IF ONLY ONE ITEM IN ROW
            if (!(system.model[i].species.id === '')) {
              var species = {
                species: system.model[i].species.id,
                position: [
                  Number(system.model[i].distance) + xPosition,
                  Number(system.model[i].species.y),
                ],
                width: Number(system.model[i].width),
              }
              model.push(species)
            }
          }
          xPosition = xPosition + Number(system.model[i].distance)
        }
        if (model.length < 1) {
          // REDIRECT IF NO SPECIES
          res.redirect('back')
        } else {
          console.log('Model length:' + model.length)
          system.model = model
          // REMOVE ANIMAL ITEMS IF NONE
          for (var i = system.animals.length - 1; i >= 0; i--) {
            if (system.animals[i] === '') {
              system.animals.splice(i, 1)
            }
          }
          // SET BOOLEAN
          if (req.body.system.shared) {
            system.shared = true
          }
          // CREATE SYSTEM
          System.create(system, function (err, createdSystem) {
            if (err) {
              console.log(err)
            } else {
              console.log(createdSystem)
              // ADD OWNER
              createdSystem.owner.id = req.user._id
              createdSystem.owner.username = req.user.username
              createdSystem.save()
              // IF LAYER IS AGROFORESTRY AND NO PRESENT, PUSH TO CURRENT
              if (
                foundLayer.type === 'agroforestry' &&
                foundLayer.systems.present === undefined
              ) {
                foundLayer.systems.present = createdSystem
                foundLayer.save()
                res.redirect('/layers/' + foundLayer._id)
              } else {
                // Push system to layer future if layer type is not agroforestry
                foundLayer.systems.future.push(createdSystem)
                foundLayer.save()
                res.redirect('/layers/' + foundLayer._id)
              }
            }
          })
        }
      }
    })
  }
)

// NESTED AREA SYSTEM CREATE ROUTE OLD
/*router.post("/layers/:id/systems", middleware.isLoggedIn, function(req, res){
    // FIND LAYER ID
    Layer.findById(req.params.id, function(err, foundLayer){
        if(err) {
            console.log(err);
        } else {
            // GET SYSTEM
            var system = req.body.system;
            // SET BOOLEAN
            if(req.body.system.shared){
                system.shared = true;
            }
            // CLEAN ARRAY
            var rows = [];
            for(let i=0;i<system.rows.length;i++){
                // REMOVE ITEMS WITH "NONE" (WHAT IF ROWS HAVE DIFFERENT AMOUNTS?!) REDIRECT?!
                for(var j = system.rows[i].sequense.length - 1; j >= 0; j--){
                    if(system.rows[i].sequense[j] === ""){
                        system.rows[i].sequense.splice(j, 1);
                    }
                }
                // REMOVE EMPTY ROWS IF WIDTH IS NOT FILLED OUT
                if(!(system.rows[i].width === "")){
                    rows.push(system.rows[i]);
                }
            }
            // REMOVE ANIMAL ITEMS IF NONE
            for(var i = system.animals.length - 1; i >= 0; i--){
                if(system.animals[i] === ""){
                    system.animals.splice(i, 1);
                }
            }
            // INSERT UPDATED ROWS
            system.rows = rows;
            System.create(system, function(err, createdSystem){
                if(err) {
                    console.log(err);
                } else {
                    console.log(createdSystem);
                    // ADD OWNER
                    createdSystem.owner.id = req.user._id;
                    createdSystem.owner.username = req.user.username;
                    createdSystem.save();
                    // IF LAYER IS AGROFORESTRY AND NO PRESENT, PUSH TO CURRENT
                    if(foundLayer.type === "agroforestry" && foundLayer.systems.present === undefined){
                        foundLayer.systems.present = createdSystem;
                        foundLayer.save();
                        res.redirect("/layers/" + foundLayer._id);
                    } else {
                        // Push system to layer future if layer type is not agroforestry
                        foundLayer.systems.future.push(createdSystem);
                        foundLayer.save();
                        res.redirect("/layers/" + foundLayer._id);
                    }
                }
            })
        }
    })
});*/

// LAYER FUTURE SYSTEMS COMPARE ROUTE
router.get(
  '/layers/:id/systems/compare',
  middleware.isLoggedIn,
  async function (req, res) {
    // FIND LAYER
    let foundLayer = await Layer.findById(req.params.id)
      .populate('systems.future')
      .exec()
    if (foundLayer) {
      // FIND FUTURE SYSTEM TO POPULATE ROWS ETC
      let foundSystems = await System.find({ _id: foundLayer.systems.future })
        .populate('flows')
        .populate('model.species')
        .exec()
      if (foundSystems) {
        for (let i = 0; i < foundSystems.length; i++) {
          // FIND ALL SPECIES IN SYSTEM
          var allSpecies: any[] = []
          var allUtilities: any[] = []
          var dataset: any[] = []
          var nutritional: any[] = []
          foundSystems[i].model.forEach(function (species) {
            // PUSH SPECIES TO ARRAY
            allSpecies.push(species.species.nameCommon)
            // FIND SPECIES UTILITIES
            if (species.species.utilities.length > 0) {
              for (let j = 0; j < species.species.utilities.length; j++) {
                allUtilities.push(species.species.utilities[j])
              }
            }
            // ADD SPECIES NUTRITIONAL VALUE TO ARRAY
            nutritional.push(species.species.nutrients)
            // ADD SPECIES TO ROWS
            var count = 0
            for (let j = 0; j < dataset.length; j++) {
              if (dataset[j].row === species.position[0]) {
                dataset[j].array.push(species)
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
          /*// AVERAGE NUTRITIONAL VALUE
                        var nutrientvalue = {
                            protein: 0,
                            carb: 0,
                            fat: 0
                        };
                        for(let j=0;j<nutritional.length;j++){
                            nutrientvalue.protein = nutrientvalue.protein + nutritional[j].protein;
                            nutrientvalue.carb = nutrientvalue.carb + nutritional[j].carb;
                            nutrientvalue.fat = nutrientvalue.fat + nutritional[j].fat;
                        }
                        console.log("protein: " + nutrientvalue.protein);
                        nutrientvalue.protein = nutrientvalue.protein / nutritional.length;
                        nutrientvalue.carb = nutrientvalue.carb / nutritional.length;
                        nutrientvalue.fat = nutrientvalue.fat / nutritional.length;*/
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
          var grid = 0
          for (let j = 0; j < dataset.length; j++) {
            dataset[j].array.sort(compare1)
            grid = grid + dataset[j].array[0].width
          }
          // FIND UNIQUE SPECIES / REMOVE DUPLICATES
          var uniqueSpecies = unique(allSpecies)
          foundSystems[i].uniqueSpecies = uniqueSpecies
          var uniqueUtilities = unique(allUtilities)
          foundSystems[i].uniqueUtilities = uniqueUtilities
          foundSystems[i].grid = grid
          foundSystems[i].sortedrows = dataset
          foundSystems[i].nutritional = nutritional[0]
        }
        res.render('systems/compare', {
          layer: foundLayer,
          systems: foundSystems,
        })
      }
    }
  }
)

// SYSTEM SHOW ROUTE
router.get('/systems/:id', middleware.isLoggedIn, async function (req, res) {
  let foundSystem = await System.findById(req.params.id)
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
    var systemwidth = 0
    var systemlength = 0
    for (let i = 0; i < dataset.length; i++) {
      dataset[i].array.sort(compare1)
      console.log(dataset[i].array[0])
      systemwidth = systemwidth + dataset[i].array[0].width
      if (
        dataset[i].array[dataset[i].array.length - 1].position[1] > systemlength
      ) {
        systemlength = dataset[i].array[dataset[i].array.length - 1].position[1]
      }
    }
    // FIND SPECIES AND POPULATE FLOWS
    Species.find({ _id: uniqueSpecies })
      .populate('flows')
      .exec(function (err, foundSpecies) {
        if (err) {
          console.log(err)
        } else {
          res.render('systems/show', {
            system: foundSystem,
            species: foundSpecies,
            rows: dataset,
            systemwidth: systemwidth,
            systemlength: systemlength,
          })
        }
      })
  }
})

// SYSTEM EDIT ROUTE
router.get(
  '/systems/:id/edit',
  middleware.isLoggedIn,
  async function (req: any, res) {
    let foundSystem = await System.findById(req.params.id)
      .populate('model.species')
      .populate('animals')
      .exec()
    if (foundSystem) {
      let foundSpecies = await Species.find();
      if (foundSpecies) {
        // SORT SPECIES
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
        // FIND ALL ANIMALS AND SORT
        let foundAnimals = await Animal.find();
        if (foundAnimals) {
          // SORT SPECIES
          function compare1(a, b) {
            if (a.nameCommon < b.nameCommon) {
              return -1
            }
            if (a.nameCommon > b.nameCommon) {
              return 1
            }
            return 0
          }
          foundAnimals.sort(compare1)
          // FIND ROWS IN SYSTEM
          var allSpecies: any[] = []
          var dataset: any[] = []
          var distanceArray: any[] = []
          foundSystem.model.forEach(function (species) {
            allSpecies.push(species.species)
            distanceArray.push(species.position[1])
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
          // FIND UNIQUE SPECIES / REMOVE DUPLICATES
          var uniqueSpecies = unique(allSpecies)
          // SORT FIRST ROW ITEMS
          function compare2(a, b) {
            if (a.position[1] < b.position[1]) {
              return -1
            }
            if (a.position[1] > b.position[1]) {
              return 1
            }
            return 0
          }
          for (let i = 0; i < dataset.length; i++) {
            dataset[i].array.sort(compare2)
            console.log(dataset[i].array[0])
          }
          var rows = dataset
          // CALCULATE DISTANCE
          var distanceDifference: any[] = []
          for (let i = 0; i < distanceArray.length; i++) {
            for (let j = 0; j < distanceArray.length; j++) {
              if (distanceArray[i] !== distanceArray[j]) {
                distanceDifference.push(
                  Math.abs(distanceArray[i] - distanceArray[j])
                )
              }
            }
          }
          // SORT DIFFERENCE IN DISTANCE
          function compare3(a, b) {
            if (a < b) {
              return -1
            }
            if (a > b) {
              return 1
            }
            return 0
          }
          // CALCULATE LENGTH
          distanceArray.sort(compare3)
          console.log(distanceArray[distanceArray.length - 1])
          // SET LENGTH TO HIGHEST Y COORDINATE
          var length = distanceArray[distanceArray.length - 1]
          // FIND DISTANCE Y MIN
          distanceDifference.sort(compare3)
          var distance = 0
          if (
            distanceDifference[0] > distanceArray[0] ||
            distanceDifference.length === 0
          ) {
            distance = distanceArray[0]
          } else {
            distance = distanceDifference[0]
          }
          console.log(distance)
          if (req.query.distance) {
            console.log('Distance query')
            distance = distance / req.query.distance
          }
          // JUST SET NEW VARIABLE TO CONTROL NEW ROW
          var newRow = -1
          if (req.query.row) {
            console.log('Row query ' + req.query.row)
            newRow = parseInt(req.query.row)
            console.log(typeof newRow)
          }
          // CHECK IF DISTANCE IS DIVISIBLE BY LENGTH?! THROW ERROR IF IT'S FOR SOME REASON NOT?
          res.render('systems/edit', {
            system: foundSystem,
            species: foundSpecies,
            animals: foundAnimals,
            rows: rows,
            distance: distance,
            length: length,
            newrow: newRow,
          })
        }
      
      }
    }
  }
)

// SYSTEM EDIT ROUTE OLD
router.get('/systems/:id/editold', middleware.isLoggedIn, function (req, res) {
  System.findById(req.params.id)
    .populate('rows.sequense')
    .populate('animals')
    .exec(function (err, foundSystem) {
      if (err) {
        console.log(err)
      } else {
        Species.find(function (err, foundSpecies) {
          if (err) {
            console.log(err)
          } else {
            // SORT SPECIES
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
            // FIND ALL ANIMALS AND SORT
            Animal.find(function (err, foundAnimals) {
              if (err) {
                console.log(err)
              } else {
                // SORT SPECIES
                function compare1(a, b) {
                  if (a.nameCommon < b.nameCommon) {
                    return -1
                  }
                  if (a.nameCommon > b.nameCommon) {
                    return 1
                  }
                  return 0
                }
                foundAnimals.sort(compare1)
                res.render('systems/editold', {
                  system: foundSystem,
                  species: foundSpecies,
                  animals: foundAnimals,
                })
              }
            })
          }
        })
      }
    })
})

// SYSTEM EDIT W. SPECIES ROUTE
router.get(
  '/systems/:id/edit/:speciesid',
  middleware.isLoggedIn,
  async function (req: any, res) {
    let foundSystem = await System.findById(req.params.id)
      .populate('model.species')
      .populate('animals')
      .exec()
    if (foundSystem) {
      // FIND ALL SPECIES IN SYSTEM
      var allSpecies: any[] = []
      var dataset: any[] = []
      var distanceArray: any[] = []
      foundSystem.model.forEach(function (species) {
        allSpecies.push(species.species.id)
        distanceArray.push(species.position[1])
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
      // PUSH NEW SPECIES TO LIST
      allSpecies.push(req.params.speciesid)
      // FIND UNIQUE SPECIES / REMOVE DUPLICATES
      var uniqueSpecies = unique(allSpecies)
      // FIND ALL SPECIES IN SYSTEM
      let foundSpecies = await Species.find({ _id: uniqueSpecies })
      if (foundSpecies) {
        // SORT FIRST ROW ITEMS
        function compare2(a, b) {
          if (a.position[1] < b.position[1]) {
            return -1
          }
          if (a.position[1] > b.position[1]) {
            return 1
          }
          return 0
        }
        // SORT ROWS
        for (let i = 0; i < dataset.length; i++) {
          dataset[i].array.sort(compare2)
          console.log(dataset[i].array[0])
        }
        var rows = dataset
        // CALCULATE DISTANCE
        var distanceDifference: any[] = []
        for (let i = 0; i < distanceArray.length; i++) {
          for (let j = 0; j < distanceArray.length; j++) {
            if (distanceArray[i] !== distanceArray[j]) {
              distanceDifference.push(
                Math.abs(distanceArray[i] - distanceArray[j])
              )
            }
          }
        }
        // SORT DIFFERENCE IN DISTANCE
        function compare3(a, b) {
          if (a < b) {
            return -1
          }
          if (a > b) {
            return 1
          }
          return 0
        }
        // CALCULATE LENGTH
        distanceArray.sort(compare3)
        console.log(distanceArray[distanceArray.length - 1])
        // SET LENGTH TO HIGHEST Y COORDINATE
        var length = distanceArray[distanceArray.length - 1]
        // FIND DISTANCE Y MIN
        distanceDifference.sort(compare3)
        var distance = 0
        if (
          distanceDifference[0] > distanceArray[0] ||
          distanceDifference.length === 0
        ) {
          distance = distanceArray[0]
        } else {
          distance = distanceDifference[0]
        }
        // NEWROW
        var newRow = -1
        if (req.query.row) {
          console.log('Row query ' + req.query.row)
          newRow = parseInt(req.query.row)
          console.log(typeof newRow)
        }
        res.render('systems/edit', {
          system: foundSystem,
          species: foundSpecies,
          animals: foundSystem.animals,
          rows: rows,
          distance: distance,
          length: length,
          newrow: newRow,
        })
      }
    }
  }
)

// SYSTEM UPDATE ROUTE
router.put('/systems/:id', middleware.isLoggedIn, function (req: any, res) {
  // NEED TO CHECK OWNERSHIP HERE!!! YES
  System.findById(req.params.id, async function (err, foundSystem) {
    // CLEAN SYSTEM - MAKE MIDDLEWARE FOR THIS
    // GET SYSTEM
    var system = req.body.system
    // SET BOOLEAN
    if (req.body.system.shared) {
      system.shared = true
    }
    // NEW GRID MODEL SETUP
    var model: any[] = []
    // DO COUNT FOR ROW WIDTH
    var xPosition = 0
    // ADD SPECIES TO MODEL
    for (let i = 0; i < system.model.length; i++) {
      // FIX IF ONLY ONE ITEM IN ROW
      if (system.model[i].species.id instanceof Array) {
        for (let j = 0; j < system.model[i].species.id.length; j++) {
          // IF SPECIES ID IS NULL
          if (!(system.model[i].species.id[j] === '')) {
            let species = {
              species: system.model[i].species.id[j],
              position: [
                Number(system.model[i].distance) + xPosition,
                Number(system.model[i].species.y[j]),
              ],
              width: Number(system.model[i].width),
            }
            model.push(species)
          }
        }
      } else {
        // FIX IF ONLY ONE ITEM IN ROW
        let species = {
          species: system.model[i].species.id,
          position: [
            Number(system.model[i].distance) + xPosition,
            Number(system.model[i].species.y),
          ],
          width: Number(system.model[i].width),
        }
        model.push(species)
      }
      xPosition = xPosition + Number(system.model[i].distance)
    }
    console.log(model)
    system.model = model
    // REMOVE ANIMAL ITEMS IF NONE
    for (var i = system.animals.length - 1; i >= 0; i--) {
      if (system.animals[i] === '') {
        system.animals.splice(i, 1)
      }
    }
    // does user own the system?
    if (foundSystem.owner.id.equals(req.user._id)) {
      // if true, update existing system
      try {
        let updatedSystem = await System.findByIdAndUpdate(
          req.params.id,
          system
        )
        if (updatedSystem) {
          res.redirect('/systems/' + updatedSystem._id)
        } else {
          console.log('No updatedSystem')
        }
      } catch (err) {
        console.log(err)
      }
    } else {
      // if false, create a new system and add current user as owner
      System.create(system, function (err, createdSystem) {
        if (err) {
          console.log(err)
        } else {
          // Add owner
          createdSystem.owner.id = req.user._id
          createdSystem.owner.username = req.user.username
          createdSystem.shared = false
          createdSystem.save()
          // REPLACE IN PRESENT
          Layer.find(
            { 'owner.id': req.user._id, 'systems.present': foundSystem._id },
            function (err, foundLayersPresent) {
              if (err) {
                console.log(err)
              } else {
                console.log(foundLayersPresent.length + ' present found')
                if (foundLayersPresent.length > 0) {
                  foundLayersPresent.forEach(function (layer) {
                    // REPLACE SYSTEM
                    layer.systems.present = createdSystem
                    // NO NEED TO PUSH TO PAST IN THIS CASE
                    layer.save()
                  })
                }
              }
            }
          ) // IMPORTANT TO CHECK FOR USER!!! LIKE CHECKING OWNERSHIP
          // REPLACE IN FUTURE DRAFT
          Layer.find(
            { 'owner.id': req.user._id, 'systems.future': foundSystem._id },
            function (err, foundLayersFuture) {
              if (err) {
                console.log(err)
              } else {
                console.log(foundLayersFuture.length + ' future drafts found')
                if (foundLayersFuture.length > 0) {
                  foundLayersFuture.forEach(function (layer) {
                    // REMOVE ORIGINAL SYSTEM
                    // @ts-ignore
                    layer.systems.future.remove(foundSystem)
                    // ADD NEW SYSTEM
                    layer.systems.future.push(createdSystem)
                    layer.save()
                  })
                }
              }
            }
          )
          // REPLACE IN PROJECT
          Project.find(
            { 'owner.id': req.user._id, system: foundSystem._id },
            function (err, foundProjects) {
              if (err) {
                console.log(err)
              } else {
                console.log(foundProjects.length + ' projects found')
                if (foundProjects.length > 0) {
                  foundProjects.forEach(function (project) {
                    // REPLACE SYSTEM
                    project.system = createdSystem
                    project.save()
                  })
                }
              }
            }
          )
          // Redirect to system page
          res.redirect('/systems/' + createdSystem._id)
        }
      })
    }
  })
})

/*// SYSTEM UPDATE ROUTE OLD
router.put("/systems/:id", middleware.isLoggedIn, function(req, res){ // NEED TO CHECK OWNERSHIP HERE!!! YES
    System.findById(req.params.id, function(err, foundSystem){
        // CLEAN SYSTEM - MAKE MIDDLEWARE FOR THIS
        // GET SYSTEM
        var system = req.body.system;
        // SET BOOLEAN
        if(req.body.system.shared){
            system.shared = true;
        }
        // CLEAN ARRAY
        /!*var rows = [];
        for(let i=0;i<system.rows.length;i++){
            // REMOVE ITEMS WITH "NONE" (WHAT IF ROWS HAVE DIFFERENT AMOUNTS?!) REDIRECT?!
            for(var j = system.rows[i].sequense.length - 1; j >= 0; j--){
                if(system.rows[i].sequense[j] === ""){
                    system.rows[i].sequense.splice(j, 1);
                }
            }
            // REMOVE EMPTY ROWS IF WIDTH IS NOT FILLED OUT
            if(!(system.rows[i].width === "")){
                rows.push(system.rows[i]);
            }
        }*!/
        /!*!// INSERT UPDATED ROWS
        system.rows = rows;*!/
        // NEW GRID MODEL SETUP
        var model = [];
        // DO COUNT FOR ROW WIDTH
        var xPosition = 0;
        // ADD SPECIES TO MODEL
        for(let i=0;i<system.model.length;i++){
            // FIX IF ONLY ONE ITEM IN ROW
            if(system.model[i].species.id instanceof Array){
                for(let j=0;j<system.model[i].species.id.length;j++){
                    // IF SPECIES ID IS NULL
                    if(!(system.model[i].species.id[j] === "")){
                        species = {
                            species: system.model[i].species.id[j],
                            position: [Number(system.model[i].distance) + xPosition, Number(system.model[i].species.y[j])],
                            width: Number(system.model[i].width)
                        };
                        model.push(species);
                    }
                }
            } else {
                // FIX IF ONLY ONE ITEM IN ROW
                species = {
                    species: system.model[i].species.id,
                    position: [Number(system.model[i].distance) + xPosition, Number(system.model[i].species.y)],
                    width: Number(system.model[i].width)
                };
                model.push(species);
            }
            xPosition = xPosition + Number(system.model[i].distance);
        }
        console.log(model);
        system.model = model;
        // REMOVE ANIMAL ITEMS IF NONE
        for(var i = system.animals.length - 1; i >= 0; i--){
            if(system.animals[i] === ""){
                system.animals.splice(i, 1);
            }
        }
        // does user own the system?
        if(foundSystem.owner.id.equals(req.user._id)){
            // if true, update existing system
            System.findByIdAndUpdate(req.params.id, system, function(err, updatedSystem){
                if(err){
                    console.log(err);
                } else {
                    res.redirect("/systems/" + updatedSystem._id);
                }
            });
        } else {
            // if false, create a new system and add current user as owner
            System.create(system, function(err, createdSystem){
                if(err){
                    console.log(err);
                } else {
                    // Add owner
                    createdSystem.owner.id = req.user._id;
                    createdSystem.owner.username = req.user.username;
                    createdSystem.save();
                    // REPLACE IN PRESENT
                    Layer.find({"owner.id": req.user._id, "systems.present": foundSystem._id}, function(err, foundLayersPresent){
                        if(err){
                            console.log(err);
                        } else {
                            console.log(foundLayersPresent.length + " present found");
                            if(foundLayersPresent.length > 0){
                                foundLayersPresent.forEach(function(layer){
                                    // REPLACE SYSTEM
                                    layer.systems.present = createdSystem;
                                    // NO NEED TO PUSH TO PAST IN THIS CASE
                                    layer.save();
                                });
                            }
                        }
                    }); // IMPORTANT TO CHECK FOR USER!!! LIKE CHECKING OWNERSHIP
                    // REPLACE IN FUTURE DRAFT
                    Layer.find({"owner.id": req.user._id, "systems.future": foundSystem._id}, function(err, foundLayersFuture){
                        if(err){
                            console.log(err);
                        } else {
                            console.log(foundLayersFuture.length + " future drafts found");
                            if(foundLayersFuture.length > 0){
                                foundLayersFuture.forEach(function(layer){
                                    // REMOVE ORIGINAL SYSTEM
                                    layer.systems.future.remove(foundSystem);
                                    // ADD NEW SYSTEM
                                    layer.systems.future.push(createdSystem);
                                    layer.save();
                                });
                            }
                        }
                    });
                    // REPLACE IN PROJECT
                    Project.find({"owner.id": req.user._id, "system": foundSystem._id}, function(err, foundProjects){
                        if(err){
                            console.log(err);
                        } else {
                            console.log(foundProjects.length + " projects found");
                            if(foundProjects.length > 0){
                                foundProjects.forEach(function(project){
                                    // REPLACE SYSTEM
                                    project.system = createdSystem;
                                    project.save();
                                });
                            }
                        }
                    });
                    // Redirect to system page
                    res.redirect("/systems/" + createdSystem._id);
                }
            });
        }
    });
});*/

// SYSTEM DELETE ROUTE
router.delete(
  '/layers/:id/systems/:pid',
  middleware.isLoggedIn,
  function (req: any, res) {
    // FIND SYSTEM - ONLY POSSIBLE TO GET TO THIS ROUTE IF YOUR ARE THE OWNER BCS VIEW HAS IF OWNER STATEMENT
    System.findById(req.params.pid, function (err, foundSystem) {
      if (err) {
        console.log(err)
      } else {
        // CHECK FOR SYSTEM IN LAYER PRESENT. IF THERE, BACK.
        Layer.find(
          { 'owner.id': req.user._id, 'systems.present': foundSystem._id },
          function (err, foundLayersPresent) {
            if (err) {
              console.log(err)
            } else {
              console.log(foundLayersPresent.length + ' present found')
              if (foundLayersPresent.length > 0) {
                // SEND BACK IF LAYERS
                res.redirect('back')
              } else {
                // CHECK FOR SYSTEM IN PROJECT. IF THERE, BACK.
                Project.find(
                  { 'owner.id': req.user._id, system: foundSystem._id },
                  function (err, foundProjects) {
                    if (err) {
                      console.log(err)
                    } else {
                      console.log(foundProjects.length + ' projects found')
                      if (foundProjects.length > 0) {
                        // SEND BACK IF PROJECTS
                        res.redirect('back')
                      } else {
                        // CHECK EDGE SYSTEM!?
                        // DELETE IN FUTURE DRAFT
                        Layer.find(
                          {
                            'owner.id': req.user._id,
                            'systems.future': foundSystem._id,
                          },
                          async function (err, foundLayersFuture) {
                            if (err) {
                              console.log(err)
                            } else {
                              console.log(
                                foundLayersFuture.length +
                                  ' future drafts found'
                              )
                              if (foundLayersFuture.length > 0) {
                                foundLayersFuture.forEach(function (layer) {
                                  // REMOVE ORIGINAL SYSTEM
                                  //@ts-ignore
                                  layer.systems.future.remove(foundSystem)
                                  // ADD NEW SYSTEM
                                  layer.save()
                                })
                              }
                              // DELETE SYSTEM NOW
                              try {
                                await System.findByIdAndRemove(req.params.pid)
                              } catch (err) {
                                console.log(err)
                              }
                            }
                          }
                        )
                      }
                    }
                  }
                )
              }
            }
          }
        )
      }
    })
  }
)

// SYSTEM SUCCESSION ROUTE
router.get(
  '/systems/:id/succession',
  middleware.isLoggedIn,
  function (req, res) {
    System.findById(req.params.id)
      .populate('rows')
      .exec(function (err, foundSystem) {
        if (err) {
          console.log(err)
        } else {
          res.render('succession', { system: foundSystem })
        }
      })
  }
)

// SYSTEM COMPOSITION ROUTE
router.get(
  '/systems/:id/composition',
  middleware.isLoggedIn,
  async function (req: any, res) {
    let foundSystem = await System.findById(req.params.id)
      .populate('model.species')
      .exec()
    if (foundSystem) {
      // FIND ALL SPECIES IN SYSTEM
      var allSpecies: any[] = []
      foundSystem.model.forEach(function (species) {
        allSpecies.push(species.species)
      })
      // FIND UNIQUE SPECIES / REMOVE DUPLICATES
      var uniqueSpecies = unique(allSpecies)
      // FIND SPECIES AND POPULATE FLOWS
      Species.find({ _id: uniqueSpecies })
        .populate('flows')
        .exec(function (err, foundSpecies) {
          if (err) {
            console.log(err)
          } else {
            Parcel.findById(
              req.user.currentProject,
              function (err, foundParcel) {
                if (err) {
                  console.log(err)
                } else {
                  Species.find(
                    {
                      'precipitation.max': {
                        $gt: foundParcel.climate.annualaverageprec,
                      },
                      'precipitation.min': {
                        $lt: foundParcel.climate.annualaverageprec,
                      },
                      'temperature.min': {
                        $lt: foundParcel.climate.hardiness.high,
                      },
                      'temperature.max': {
                        $gt: foundParcel.climate.hardiness.low,
                      },
                    },
                    function (err, foundSuitableSpecies) {
                      if (err) {
                        console.log(err)
                      } else {
                        console.log(foundSuitableSpecies)
                        res.render('composition', {
                          system: foundSystem,
                          species: foundSpecies,
                          suitablespecies: foundSuitableSpecies,
                        })
                      }
                    }
                  )
                }
              }
            )
          }
        })
    }
  }
)

// SYSTEM ASSESSMENT ROUTE
router.get(
  '/layers/:id/analysis',
  middleware.isLoggedIn,
  async function (req: any, res) {
    let foundSystems = await System.find()
      .populate('model.species')
      .populate('flows')
      .populate('animals')
      .exec()
    if (foundSystems) {
      // FIND LAYER
      let foundLayer = await Layer.findById(req.params.id)
        .populate('systems.present')
        .exec()
      if (foundLayer) {
        let foundSystem = await System.findById(foundLayer.systems.present.id)
          .populate('model.species')
          .populate('animals')
          .exec()
        if (foundSystem) {
          let foundParcel = await Parcel.findById(req.user.currentProject)
          if (foundParcel) {
            // FIND SYSTEMS WITH SAME COMMODITY AS EXISTING SYSTEM (ONLY IF MONOCULTURE?) - COUNT OCCURRENCES?
            var commodity = ''
            var commodityName = ''
            foundSystem.model.forEach(function (species) {
              // CHECK IF ONLY ONE SPECIES (MONOCULTURE)
              if (
                species.species.nameCommon === 'Arabian coffee' ||
                species.species.nameCommon === 'Cacao' ||
                species.species.nameCommon === 'Cashew' ||
                species.species.nameCommon === 'Coconut palm' ||
                species.species.nameCommon === 'Scots pine'
              ) {
                commodity = species.species.id
                commodityName = species.species.nameCommon
              }
            })
            console.log(commodityName)
            // CHECK IF SYSTEM HAS ANIMALS
            var animals
            if (foundSystem.animals.length > 0) {
              animals = foundSystem.animals[0]
            }
            var systems: any[] = []
            for (let i = 0; i < foundSystems.length; i++) {
              if (
                foundSystems[i].shared === true &&
                foundSystems[i].model.length > 0
              ) {
                // FIND ALL SPECIES IN SYSTEM
                var allSpecies: string[] = []
                var allUtilities: string[] = []
                var grid = 0
                var dataset: any[] = []
                foundSystems[i].model.forEach(function (species) {
                  allSpecies.push(species.species.nameCommon)
                  if (species.species.utilities.length > 0) {
                    for (let j = 0; j < species.species.utilities.length; j++) {
                      allUtilities.push(species.species.utilities[j])
                    }
                  }
                  // CREATE ADD SPECIES ROWS
                  var count = 0
                  for (let j = 0; j < dataset.length; j++) {
                    if (dataset[j].row === species.position[0]) {
                      dataset[j].array.push(species)
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
                // FIND UNIQUE SPECIES / REMOVE DUPLICATES
                var uniqueSpecies = unique(allSpecies)
                foundSystems[i].uniqueSpecies = uniqueSpecies
                var uniqueUtilities = unique(allUtilities)
                foundSystems[i].uniqueUtilities = uniqueUtilities
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
                // SORT ROW
                for (let j = 0; j < dataset.length; j++) {
                  dataset[j].array.sort(compare1)
                  grid = grid + dataset[j].array[0].width
                }
                // SAVE ROWS
                foundSystems[i].sortedrows = dataset
                foundSystems[i].grid = grid
                systems.push(foundSystems[i])
              }
            }
            // COMMODITY SYSTEMS
            var commoditysystems: any[] = []
            for (let i = 0; i < systems.length; i++) {
              for (let j = 0; j < systems[i].model.length; j++) {
                if (
                  commodityName === systems[i].model[j].species.nameCommon &&
                  !commoditysystems.includes(systems[i])
                ) {
                  commoditysystems.push(systems[i])
                }
              }
            }
            console.log('Commodity systems: ' + commoditysystems.length)
            var systemsclimate: any[] = []
            for (let i = 0; i < systems.length; i++) {
              var count = 0
              for (let j = 0; j < systems[i].model.length; j++) {
                if (
                  systems[i].model[j].species.precipitation.min <
                    foundParcel.climate.annualaverageprec &&
                  systems[i].model[j].species.precipitation.max >
                    foundParcel.climate.annualaverageprec &&
                  systems[i].model[j].species.temperature.min <
                    foundParcel.climate.hardiness.high &&
                  systems[i].model[j].species.temperature.max >
                    foundParcel.climate.hardiness.low
                ) {
                  count = count + 1
                }
              }
              if (count === systems[i].model.length) {
                systemsclimate.push(systems[i])
              }
            }
            var animalsystems: any[] = []
            for (let i = 0; i < systemsclimate.length; i++) {
              if (systemsclimate[i].animals.length > 0 && !(animals === '')) {
                animalsystems.push(systemsclimate[i])
                /*if(systemsclimate[i].animals[0].equals(animals)) {
                                            }*/
              }
            }
            console.log('Animal systems: ' + animalsystems.length)
            var systemsproven: any[] = []
            for (let i = 0; i < systemsclimate.length; i++) {
              if (systemsclimate[i].flows.length > 0) {
                systemsproven.push(systemsclimate[i])
              }
            }
            console.log('Proven systems for this area: ' + systemsproven.length)
            if (systems.length < 1) {
              res.redirect('layers/' + foundLayer._id)
            } else {
              res.render('analysis', {
                layer: foundLayer,
                systems: systems,
                systemsproven: systemsproven,
                systemsclimate: systemsclimate,
                commoditysystems: commoditysystems,
                commodity: commodityName,
                animalsystems: animalsystems,
              })
            }
          }
        }
      }
    }
  }
)

// LAYER MY SYSTEMS FIND
router.get(
  '/layers/:id/mysystems',
  middleware.isLoggedIn,
  function (req: any, res) {
    Layer.findById(req.params.id, function (err, foundLayer) {
      if (err) {
        console.log(err)
      } else {
        System.find({ 'owner.id': req.user._id })
          .populate('model.species')
          .populate('flows')
          .populate('animals')
          .exec(function (err, foundSystems) {
            if (err) {
              console.log(err)
            } else {
              // SORT OUT MONOCULTURE SYSTEMS
              var realSystems: any[] = []
              for (let i = 0; i < foundSystems.length; i++) {
                var systemNameSplit = foundSystems[i].name.split(' ')
                if (
                  !(
                    systemNameSplit[systemNameSplit.length - 1] ===
                    'monoculture'
                  )
                ) {
                  realSystems.push(foundSystems[i])
                }
              }
              res.render('layers/mysystems', {
                layer: foundLayer,
                systems: realSystems,
              })
            }
          })
      }
    })
  }
)

// SYSTEM OCCURRENCE NEW ROUTE
router.get(
  '/systems/:id/occurrences/new',
  middleware.isLoggedIn,
  function (req, res) {
    System.findById(req.params.id, function (err, foundSystem) {
      if (err) {
        console.log(err)
      } else {
        res.render('systems/occurrences', { system: foundSystem })
      }
    })
  }
)

// SYSTEM OCCURRANCE CREATE ROUTE
router.put(
  '/systems/:id/occurrences',
  middleware.isLoggedIn,
  async function (req, res) {
    try {
      let updatedSystem = await System.findByIdAndUpdate(req.params.id, {
        $addToSet: { occurrences: req.body.occurrence },
      })
      if (updatedSystem) {
        console.log(req.body.occurrence + ' has been added to the system')
        res.redirect('/systems/' + updatedSystem._id)
      } else {
        console.log('No updatedSystem')
      }
    } catch (err) {
      console.log(err)
    }
  }
)

export default router

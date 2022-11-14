import express from 'express'
var router = express.Router()
import unique from 'array-unique'
import Budget from '../models/budget'
import Project from '../models/project'
import System from '../models/system'
import Posting from '../models/posting'
import Parcel from '../models/parcel'
import middleware from '../middleware'
import gisObj from '../middleware/gis'

import { area } from '@turf/turf'

// BUDGET INDEX ROUTE

// BUDGET NEW ROUTE

// BUDGET CREATE ROUTE

// BUDGET SHOW ROUTE
router.get('/budgets/:id', middleware.isLoggedIn, async function (req, res) {
  // CHECK OWNERSHIP ASAP
  try {
    let foundBudget = await Budget.findById(req.params.id)
      .populate('postings')
      .exec()
    // FIND BUDGET LENGTH
    var years = 0
    // CREATE ARRAY TO STORE ANNUAL TOTALS AND POSTINGS
    var postingsArray: any[] = []

    if (foundBudget) {
      // SET YEARS
      for (let i = 0; i < foundBudget.postings.length; i++) {
        // IF YEAR IS LARGER, ADD TO YEARS
        if (foundBudget.postings[i].year > years) {
          years = foundBudget.postings[i].year
        }
      }
      // SET ARRAY LENGTH
      for (let i = 0; i < years; i++) {
        var year = {
          year: i + 1,
          postings: Array,
          total: 0,
        }
        postingsArray.push(year)
      }
      // CHECK IF COST OR INCOME
      for (let i = 0; i < foundBudget.postings.length; i++) {
        for (let j = 0; j < postingsArray.length; j++) {
          // CHECK IF SAME YEAR
          if (foundBudget.postings[i].year === postingsArray[j].year) {
            // CHECK IF COST OR INCOME
            if (
              foundBudget.postings[i].postType === 'labor' ||
              foundBudget.postings[i].postType === 'material'
            ) {
              postingsArray[j].total =
                postingsArray[j].total -
                foundBudget.postings[i].value * foundBudget.postings[i].amount
            } else if (
              foundBudget.postings[i].postType === 'product' ||
              foundBudget.postings[i].postType === 'service'
            ) {
              postingsArray[j].total =
                postingsArray[j].total +
                foundBudget.postings[i].value * foundBudget.postings[i].amount
            }
          }
        }
      }
      res.render('budgets/show', {
        budget: foundBudget,
        total: postingsArray,
        years: years,
      })
    } else {
      console.log('No foundBudget')
    }
  } catch (err) {
    console.log(err)
  }
})

// BUDGET EDIT ROUTE
router.get('/budgets/:id/edit', middleware.isLoggedIn, function (req, res) {
  Budget.findById(req.params.id, function (err, foundBudget) {
    if (err) {
      console.log(err)
    } else {
      res.render('budgets/edit', { budget: foundBudget })
    }
  })
})

// BUDGET UPDATE ROUTE
router.post('/budgets/:id', middleware.isLoggedIn, async function (req, res) {
  try {
    let updatedBudget = await Budget.findByIdAndUpdate(
      req.params.id,
      req.body.budget
    )
    if (updatedBudget) {
      res.redirect('/budgets/' + updatedBudget._id)
    } else {
      console.log('No updatedBudget')
    }
  } catch (err) {
    console.log(err)
  }
})

// BUDGET DELETE ROUTE

// PARCEL BUDGET SHOW ROUTE
router.get('/parcels/:id/accounts', middleware.isLoggedIn, function (req, res) {
  Parcel.findById(req.params.id)
    .populate({
      path: 'layers',
      populate: { path: 'accounts', populate: { path: 'postings' } },
    })
    .exec(function (err, foundParcel) {
      if (err) {
        console.log(err)
      } else {
        res.render('accounts', { parcel: foundParcel })
      }
    })
})

// PARCEL BUDGET

// PROJECT BUDGET NEW ROUTE
router.get(
  '/projects/:id/budgets/new',
  middleware.isLoggedIn,
  async function (req, res) {
    try {
      let foundProject = await Project.findById(req.params.id)
        .populate('system')
        .exec()

      if (foundProject) {
        try {
          let foundSystem = await System.findById(foundProject.system)
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
            res.render('budgets/new', {
              project: foundProject,
              species: uniqueSpecies,
            })
          } else {
            console.log('No foundSystem')
          }
        } catch (err) {
          console.log(err)
        }
      }
    } catch (err) {
      console.log(err)
    }
  }
)

// PROJECT BUDGET CREATE ROUTE
router.post(
  '/projects/:id/budgets',
  middleware.isLoggedIn,
  function (req: any, res) {
    Project.findById(req.params.id, function (err, foundProject) {
      if (err) {
        console.log(err)
      } else {
        Budget.create(req.body.budget, function (err, createdBudget) {
          if (err) {
            console.log(err)
          } else {
            // BUDGET OWNER
            createdBudget.owner.id = req.user._id
            createdBudget.owner.username = req.user.username
            createdBudget.save()
            // SAVE BUDGET TO PROJECT
            foundProject.budget = createdBudget
            foundProject.save()
            res.redirect('/projects/' + foundProject._id)
          }
        })
      }
    })
  }
)

// GENERATE NEW PROJECT ESTABLISHMENT BUDGET
router.get(
  '/projects/:id/generateestablishment',
  middleware.isLoggedIn,
  async function (req, res) {
    // FIND PROJECT
    try {
      let foundProject = await Project.findById(req.params.id)
        .populate('system')
        .populate({
          path: 'rows',
          populate: { path: 'sequence', populate: { path: 'model.species' } },
        })
        .exec()

      if (foundProject) {
        try {
          let foundSystem = await System.findById(foundProject.system)
            .populate('model.species')
            .exec()

          // FIND ALL SPECIES IN SYSTEM OR ROWS
          var allSpecies: any[] = []
          if (foundProject.rows && foundProject.rows.length > 0) {
            for (let i = 0; i < foundProject.rows.length; i++) {
              if (foundProject.rows[i].sequence) {
                for (
                  let j = 0;
                  j < foundProject.rows[i].sequence.model.length;
                  j++
                ) {
                  allSpecies.push(
                    foundProject.rows[i].sequence.model[j].species
                  )
                }
              }
            }
          } else {
            foundSystem?.model.forEach(function (species) {
              if (
                species.species.form === 'grass' ||
                species.species.form === 'herb'
              ) {
                // DO NOTHING XD
              } else {
                allSpecies.push(species.species)
              }
            })
          }
          console.log('All species length: ' + allSpecies.length)
          // FIND UNIQUE SPECIES / REMOVE DUPLICATES
          var uniqueSpecies = unique(allSpecies)
          // SEND ARRAY OF SUBTYPES
          var subtypes = ['bed', 'plant', 'method']
          res.render('budgets/establishnew', {
            project: foundProject,
            species: uniqueSpecies,
            subtypes: subtypes,
          })
          if (foundProject) {
            try {
              let foundSystem = await System.findById(foundProject.system)
                .populate('model.species')
                .exec()
            } catch (err) {
              console.log(err)
            }
          }
        } catch (err) {
          console.log(err)
        }
      } else {
        console.log('No foundProject')
      }
    } catch (err) {
      console.log(err)
    }
  }
)

// GENERATE ESTABLISHMENT BUDGET CREATE ROUTE
router.post(
  '/projects/:id/generateestablishment',
  middleware.isLoggedIn,
  async function (req, res) {
    // FIND PROJECT
    try {
      let foundProject = await Project.findById(req.params.id)
        .populate('layer')
        .populate({ path: 'system', populate: { path: 'model.species' } })
        .populate({
          path: 'rows',
          populate: { path: 'sequence', populate: { path: 'model.species' } },
        })
        .populate({
          path: 'areas',
          populate: {
            path: 'rotation',
            populate: { path: 'model.speciesmix.species' },
          },
        })
        .exec()
      if (foundProject) {
        // CREATE BUDGET AND PLACE IN PROJECT
        var budget = req.body.budget
        try {
          let createdBudget = await Budget.create()
          // @ts-ignore
          foundProject.budgets.establishment = createdBudget
          foundProject.save()
          // PARSE QUERY
          var speciesPostings = req.body.speciespostings
          var speciesPostingsArray: any[] = []
          for (let i = 0; i < speciesPostings.length; i++) {
            // REMOVE NONE ONES
            if (!(speciesPostings[i] === 'none')) {
              var splitPostings = speciesPostings[i].split(' ')
              speciesPostingsArray.push(splitPostings)
            }
          }
          console.log(speciesPostingsArray)
          // FIND SYSTEM
          try {
            let foundSystem = await System.findById(foundProject.system)
              .populate('model.species')
              .exec()
            // SET VARIABLES HERE
            var layout: any = {}
            // IF ROWS, DO XXX
            if (foundProject.rows && foundProject.rows.length > 0) {
              // DO ROW LAYOUT
              layout = gisObj.rowBasedLayout(foundProject)
            } else {
              // DO PARAMETRIC LAYOUT
              layout = gisObj.systemBasedLayout(foundProject)
            }

            var uniqueSpeciesCount: any[] = []
            var uniqueSpecies: any[] = []
            if (layout.uniqueSpeciesCount) {
              uniqueSpeciesCount = layout.uniqueSpeciesCount
              uniqueSpecies = layout.uniqueSpecies
            }
            /////////////////////
            /////////////////////
            // FIND SPECIES ACTIVITIES AND CREATE POSTINGS
            var postings: any[] = []
            // RUN THROUGH ALL POSTINGS
            for (let i = 0; i < speciesPostingsArray.length; i++) {
              for (let j = 0; j < uniqueSpecies.length; j++) {
                // RUN THROUGH ALL ACTIVITIES
                if (speciesPostingsArray[i][0] === uniqueSpecies[j].id) {
                  // CREATE THE POSTING HERE AND PUSH
                  var posting: any = {
                    name:
                      uniqueSpecies[j].nameCommon +
                      ' ' +
                      uniqueSpecies[j].activities[speciesPostingsArray[i][1]]
                        .subtype +
                      ': ' +
                      uniqueSpecies[j].activities[speciesPostingsArray[i][1]]
                        .name,
                    postType: 'material',
                    amount: 1,
                    value:
                      uniqueSpecies[j].activities[speciesPostingsArray[i][1]]
                        .price,
                    year: 1,
                  }
                  // SET POSTTYPE DEPENDING ON POSTINGS TYPE
                  if (
                    uniqueSpecies[j].activities[speciesPostingsArray[i][1]]
                      .subtype === 'bed' ||
                    uniqueSpecies[j].activities[speciesPostingsArray[i][1]]
                      .subtype === 'method'
                  ) {
                    posting.postType = 'labor'
                  }
                  for (let k = 0; k < uniqueSpeciesCount.length; k++) {
                    if (
                      uniqueSpecies[j].nameCommon === uniqueSpeciesCount[k].id
                    ) {
                      posting.amount = uniqueSpeciesCount[k].uniqueCount
                    }
                  }
                  postings.push(posting)
                }
              }
            }
            console.log(postings)
            // SETUP POSTINGS FOR AREA ACTIVITIES - HOW TO GET VALUES FOR THESE?!

            // CREATE POSTINGS
            try {
              let createdPostings = await Posting.insertMany(postings)
              try {
                let updatedBudget = await Budget.findByIdAndUpdate(
                  // @ts-ignore
                    createdBudget._id,
                  { $push: { postings: { $each: createdPostings } } }
                )
                console.log('Postings added to budget')
                res.redirect('/projects/' + foundProject._id)
              } catch (err) {
                console.log(err)
              }
            } catch (err) {
              console.log(err)
            }
          } catch (err) {
            console.log(err)
          }
        } catch (err) {
          console.log(err)
        }
      } else {
        console.log('No foundProject')
      }
    } catch (err) {
      console.log(err)
    }
  }
)

// GENERATE NEW PROJECT CASH-FLOW BUDGET
router.get(
  '/projects/:id/generatemanagement',
  middleware.isLoggedIn,
  async function (req, res) {
    // FIND PROJECT
    try {
      let foundProject = await Project.findById(req.params.id)
        .populate({
          path: 'rows',
          populate: { path: 'sequence', populate: { path: 'model.species' } },
        })
        .populate({
          path: 'areas',
          populate: {
            path: 'rotation',
            populate: { path: 'model.speciesmix.species' },
          },
        })
        .exec()
      if (foundProject) {
        // FIND SYSTEM
        try {
          let foundSystem = System.findById(foundProject.system)
            .populate('model.species')
            .exec()
          // FIND ALL SPECIES IN SYSTEM OR ROWS
          var allSpecies: any[] = []
          if (foundProject.rows && foundProject.rows.length > 0) {
            for (let i = 0; i < foundProject.rows.length; i++) {
              if (foundProject.rows[i].sequence) {
                for (
                  let j = 0;
                  j < foundProject.rows[i].sequence.model.length;
                  j++
                ) {
                  allSpecies.push(
                    foundProject.rows[i].sequence.model[j].species
                  )
                }
              }
            }
            if (foundProject.areas && foundProject.areas.length > 0) {
              for (let i = 0; i < foundProject.areas.length; i++) {
                if (foundProject.areas[i].rotation) {
                  for (
                    let j = 0;
                    j < foundProject.areas[i].rotation.model.length;
                    j++
                  ) {
                    for (
                      let k = 0;
                      k <
                      foundProject.areas[i].rotation.model[j].speciesmix.length;
                      k++
                    ) {
                      allSpecies.push(
                        foundProject.areas[i].rotation.model[j].speciesmix[k]
                          .species
                      )
                    }
                  }
                }
              }
            }
          } else {
            // @ts-ignore
            foundSystem.model.forEach(function (species) {
              allSpecies.push(species.species)
            })
          }
          console.log('All species length: ' + allSpecies.length)
          // FIND UNIQUE SPECIES / REMOVE DUPLICATES
          var uniqueSpecies = unique(allSpecies)
          // SEND ARRAY OF SUBTYPES
          var subtypes = ['compost', 'pruning', 'weedcontrol', 'harvest']
          res.render('budgets/managementnew', {
            project: foundProject,
            species: uniqueSpecies,
            subtypes: subtypes,
          })
        } catch (err) {
          console.log(err)
        }
      } else {
        console.log('No foundProject')
      }
    } catch (err) {
      console.log(err)
    }
  }
)

// GENERATE CASH-FLOW BUDGET CREATE ROUTE
router.post(
  '/projects/:id/generatemanagement',
  middleware.isLoggedIn,
  async function (req, res) {
    // FIND PROJECT
    try {
      let foundProject = await Project.findById(req.params.id)
        .populate('layer')
        .populate({
          path: 'system',
          populate: { path: 'model.species', populate: { path: 'flows' } },
        })
        .populate({
          path: 'rows',
          populate: {
            path: 'sequence',
            populate: { path: 'model.species', populate: { path: 'flows' } },
          },
        })
        .populate({
          path: 'areas',
          populate: {
            path: 'rotation',
            populate: {
              path: 'model.speciesmix.species',
              populate: { path: 'flows' },
            },
          },
        })
        .exec()

      if (foundProject) {
        // CREATE BUDGET AND PLACE IN PROJECT
        var budget = req.body.budget
        try {
          let createdBudget = await Budget.create(budget)
          foundProject.budgets.management = createdBudget
          foundProject.save()
          // PARSE QUERY
          var speciesPostings = req.body.speciespostings
          var speciesPostingsArray: any[] = []
          for (let i = 0; i < speciesPostings.length; i++) {
            // REMOVE NONE ONES
            if (!(speciesPostings[i] === 'none')) {
              var splitPostings = speciesPostings[i].split(' ')
              speciesPostingsArray.push(splitPostings)
            }
          }
          console.log(speciesPostingsArray)
          // FIND SYSTEM
          try {
            let foundSystem = await System.findById(foundProject.system)
              .populate({
                path: 'model.species',
                populate: { path: 'flows' },
              })
              .exec()
            var layout: any = {}
            // IF ROWS, DO XXX
            if (foundProject.rows && foundProject.rows.length > 0) {
              // DO ROW LAYOUT
              layout = gisObj.rowBasedLayout(foundProject)
            } else {
              // DO PARAMETRIC LAYOUT
              layout = gisObj.systemBasedLayout(foundProject)
            }
            var uniqueSpeciesCount: any[] = []
            var uniqueSpecies: any[] = []
            if (layout.uniqueSpeciesCount) {
              uniqueSpeciesCount = layout.uniqueSpeciesCount
              uniqueSpecies = layout.uniqueSpecies
            }
            /////////////////////
            /////////////////////
            // FIND SPECIES ACTIVITIES AND CREATE POSTINGS
            var postings: any[] = []
            var period = req.body.period
            // FIND UNIQUE AREA SPECIES
            var uniqueAreaSpecies: any[] = []
            // AREA SIZES IN PERIOD BASED ON AREAS AND SPECIES IN ROTATIONS
            var areaArray = layout.alleyPolygonArray
            var areaSpeciesRotation = layout.alleySpeciesArray
            var speciesPeriodAreaArray: any[] = []
            for (let i = 0; i < period; i++) {
              var countArray: any[] = []
              for (let j = 0; areaArray.length > j; j++) {
                for (let k = 0; k < areaSpeciesRotation[j].length; k++) {
                  console.log(
                    'rotation length: ' + areaSpeciesRotation[j].length
                  )
                  console.log('rotation check' + ((i + 1) % (k + 1)))
                  // CHECK IF YEAR IS IN ROTATION
                  if (
                    (i + areaSpeciesRotation[j].length) %
                      areaSpeciesRotation[j].length ===
                    k
                  ) {
                    uniqueAreaSpecies.push(areaSpeciesRotation[j][k])
                    var count = 0
                    for (let l = 0; l < countArray.length; l++) {
                      if (areaSpeciesRotation[j][k] === countArray[l].id) {
                        countArray[l].count =
                          countArray[l].count + area(areaArray[j])
                        count = count + 1
                      }
                    }
                    if (count < 1) {
                      let speciesArea = {
                        id: areaSpeciesRotation[j][k],
                        count: area(areaArray[j]),
                      }
                      countArray.push(speciesArea)
                    }
                  }
                }
              }
              speciesPeriodAreaArray.push(countArray)
            }
            console.log(
              'Species area count ' + speciesPeriodAreaArray[1][0].count
            )
            console.log(
              'Species area species ' + speciesPeriodAreaArray[1][0].id
            )
            console.log(
              'Species area first year length ' +
                speciesPeriodAreaArray[1].length
            )
            // UNIQUE AREA SPECIES
            var uniqueAreaSpeciesSorted = unique(uniqueAreaSpecies)
            console.log('Unique area species ' + uniqueAreaSpeciesSorted.length)
            // RUN THROUGH ALL POSTINGS
            for (let i = 0; i < speciesPostingsArray.length; i++) {
              for (let j = 0; j < uniqueSpecies.length; j++) {
                // RUN THROUGH ALL ACTIVITIES
                if (speciesPostingsArray[i][0] === uniqueSpecies[j].id) {
                  // ITERATE FOR EACH YEAR
                  for (let k = 0; k < period; k++) {
                    // CREATE THE POSTING HERE AND PUSH
                    var posting: any = {
                      name:
                        uniqueSpecies[j].nameCommon +
                        ' ' +
                        uniqueSpecies[j].activities[speciesPostingsArray[i][1]]
                          .subtype +
                        ': ' +
                        uniqueSpecies[j].activities[speciesPostingsArray[i][1]]
                          .name,
                      postType: 'material',
                      amount: 1,
                      value:
                        uniqueSpecies[j].activities[speciesPostingsArray[i][1]]
                          .price,
                      year: k + 1,
                    }
                    // SET POSTTYPE DEPENDING ON POSTINGS TYPE
                    if (
                      uniqueSpecies[j].activities[speciesPostingsArray[i][1]]
                        .subtype === 'pruning' ||
                      uniqueSpecies[j].activities[speciesPostingsArray[i][1]]
                        .subtype === 'harvest'
                    ) {
                      posting.postType = 'labor'
                    }
                    for (let l = 0; l < uniqueSpeciesCount.length; l++) {
                      if (
                        uniqueSpecies[j].nameCommon === uniqueSpeciesCount[l].id
                      ) {
                        posting.amount = uniqueSpeciesCount[l].uniqueCount
                      }
                    }
                    // CHECK ROTATION HERE FOR SPECIES AREA SIZES -
                    // JUST CHECK EACH AREA
                    // ADD TO COUNTER
                    // THEN SET AMOUNT TO COUNTER

                    postings.push(posting)
                  }
                }
              }
            }
            console.log(postings.length + ' postings excluding yields')
            // SETUP POSTINGS FOR AREA ACTIVITIES - HOW TO GET VALUES FOR THESE?! CHECK FOR EACH YEAR?!

            // CREATE POSTINGS FOR YIELDS ;)
            for (let i = 0; i < uniqueSpecies.length; i++) {
              // CYCLE THROUGH ALL YEARS
              for (let j = 0; j < period; j++) {
                // CREATE YIELD POSTING
                var posting: any = {
                  name: uniqueSpecies[i].nameCommon + ' yields',
                  postType: 'product',
                  amount: 0,
                  value: 1,
                  year: j + 1,
                }
                if (
                  uniqueSpecies[i].flows &&
                  uniqueSpecies[i].flows.length > 0 &&
                  uniqueSpecies[i].flows[0].unit === 'food' &&
                  uniqueSpecies[i].flows[0].data.length >= j + 1
                ) {
                  for (let k = 0; k < uniqueSpeciesCount.length; k++) {
                    if (
                      uniqueSpecies[i].nameCommon === uniqueSpeciesCount[k].id
                    ) {
                      posting.amount =
                        uniqueSpeciesCount[k].uniqueCount *
                        uniqueSpecies[i].flows[0].data[j]
                    }
                  }
                  /*for(let k=0;k<speciesPeriodAreaArray[j].length;k++){
                                 if(uniqueSpecies[i].nameCommon === speciesPeriodAreaArray[j][k].id){
                                     posting.amount = speciesPeriodAreaArray[j][k].count * uniqueSpecies[i].flows[0].data[j];
                                 }
                             }*/
                }
                // DO IF AREA SIZE HERE TO CHECK WITH ROTATION. OK TO HAVE IT HERE SINCE IT OVERWRITE ABOVE FLOWS?

                // ADD TO POSTINGS
                postings.push(posting)
              }
            }
            // AREA YIELDS
            for (let i = 0; i < uniqueAreaSpeciesSorted.length; i++) {
              // CYCLE THROUGH ALL YEARS
              for (let j = 0; j < period; j++) {
                // CREATE YIELD POSTING
                var posting: any = {
                  name: uniqueAreaSpeciesSorted[i].nameCommon + ' yields',
                  postType: 'product',
                  amount: 0,
                  value: 1,
                  year: j + 1,
                }
                if (
                  uniqueAreaSpeciesSorted[i].flows &&
                  uniqueAreaSpeciesSorted[i].flows.length > 0 &&
                  uniqueAreaSpeciesSorted[i].flows[0].unit === 'food'
                ) {
                  for (let k = 0; k < speciesPeriodAreaArray[j].length; k++) {
                    if (
                      uniqueAreaSpeciesSorted[i].nameCommon ===
                      speciesPeriodAreaArray[j][k].id.nameCommon
                    ) {
                      posting.amount = Math.round(
                        speciesPeriodAreaArray[j][k].count *
                          uniqueAreaSpeciesSorted[i].flows[0].data[0]
                      )
                    }
                  }
                }
                // ADD TO POSTINGS
                postings.push(posting)
              }
            }
            console.log(postings.length + ' postings including yields')
            // POSTINGS FOR AREAS SIZES?

            // CREATE POSTINGS
            try {
              let createdPostings = await Posting.insertMany(postings)
              // ADD POSTINGS TO BUDGET
              try {
                await Budget.findByIdAndUpdate(createdBudget._id, {
                  $push: { postings: { $each: createdPostings } },
                })
                console.log('Postings added to budget')
                res.redirect('/projects/' + foundProject._id)
              } catch (err) {
                console.log(err)
              }
            } catch (err) {
              console.log(err)
            }
          } catch (err) {
            console.log(err)
          }
        } catch (err) {
          console.log(err)
        }
      } else {
        console.log('No foundProject')
      }
    } catch (err) {
      console.log(err)
    }
  }
)

export default router

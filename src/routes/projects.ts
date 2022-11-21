import express from 'express'
var router = express.Router()
import unique from 'array-unique'
import Parcel from '../models/parcel'
import Project, { IProjectSchema } from '../models/project'
import Practice from '../models/practice'
import Layer from '../models/layer'
import System, { ISystemSchema } from '../models/system'
import Budget from '../models/budget'
import Activity from '../models/activity'
import Species from '../models/species'
import Asset from '../models/asset'
import Posting, { IPostingSchema } from '../models/posting'
import Sequence from '../models/sequence'
import Rotation from '../models/rotation'
import Row from '../models/row'
import Area from '../models/area'
import middleware from '../middleware'
import gisObj from '../middleware/gis'
import { helpers as turf, length as turfLength, circle, area } from '@turf/turf'
import PDFDocument from 'pdfkit'

// NODE GEOCODER CODE
import NodeGeocoder from 'node-geocoder'

var options: NodeGeocoder.Options = {
  provider: 'google',
  apiKey: process.env.GEOCODER_API_KEY,
  formatter: null,
}

var geocoder = NodeGeocoder(options)

// PROJECTS INDEX ROUTE
router.get('/projects', middleware.isLoggedIn, function (req: any, res) {
  // GET ALL USERS PROJECTS IN DB
  Project.find({ 'owner.id': req.user._id }, function (err, allProjects) {
    if (err) {
      console.log(err)
    } else {
      res.render('projects/index', { projects: allProjects })
    }
  })
})

// SERVICES NEW ROUTE
router.get('/projects/new', middleware.isLoggedIn, function (req, res) {
  var place = undefined
  res.render('projects/new', { place: place })
})

// SERVICES CREATE ROUTE
router.post('/projects', middleware.isLoggedIn, function (req: any, res) {
  // Create a new project
  Project.create(req.body.project, function (err, service) {
    if (err) {
      console.log(err)
    } else {
      // CONVERT ADDRESS TO COORDINATES USING GEOCODER
      geocoder.geocode(req.body.service.location, function (err, data) {
        if (err || !data.length) {
          console.log(err)
          return res.redirect('back')
        }
        service.lat = data[0].latitude
        service.lng = data[0].longitude
        service.location = data[0].formattedAddress
        // Add ID to experience
        service.owner.id = req.user._id
        // Save the service - Not need if created after this step
        service.save()
        // Redirect to projects INDEX page
        // req.flash("success", "Successfully added service");
        res.redirect('/projects')
      })
    }
  })
})

// PROJECT SHOW ROUTE
router.get('/projects/:id', middleware.isLoggedIn, async function (req, res) {
  try {
    let foundProject = await Project.findById(req.params.id)
      .populate('layer')
      .populate('assets')
      .populate('budgets.establishment')
      .populate('budgets.management')
      .populate('system')
      .populate('edgesystem')
      .populate('activities')
      .exec()
    if (foundProject) {
      // TEST WITH BLANK
      var estPostings: IPostingSchema[] = []
      if (foundProject.budgets.establishment) {
        estPostings = foundProject.budgets.establishment.postings
      }

      try {
        let establishementPostings = await Posting.find({ _id: estPostings })

        console.log('Establishment postings: ' + establishementPostings.length)
        // TEST WITH BLANK
        var manPostings: IPostingSchema[] = []
        if (foundProject.budgets.management) {
          manPostings = foundProject.budgets.management.postings
        }

        try {
          let managementPostings = await Posting.find({ _id: manPostings })
          console.log('Management postings: ' + managementPostings.length)
          var irr = 0
          // SET YEARS VARIABLE FOR BOTH GRAPH AND BUDGET
          var years = 0
          if (
            foundProject.budgets.establishment ||
            foundProject.budgets.management
          ) {
            var totalEstablishment = 0
            if (establishementPostings.length > 0) {
              for (let i = 0; i < establishementPostings.length; i++) {
                /*if(establishementPostings[i].postType === "labor" || establishementPostings[i].postType === "material"){
                                YoY[establishementPostings[i].year] = YoY[establishementPostings[i].year] - (establishementPostings[i].value * establishementPostings[i].amount);
                            } else if(establishementPostings[i].postType === "product" || establishementPostings[i].postType === "service"){
                                YoY[establishementPostings[i].year] = YoY[establishementPostings[i].year] + (establishementPostings[i].value * establishementPostings[i].amount);
                            }*/
                if (establishementPostings[i].year) {
                  if (establishementPostings[i].year > years) {
                    years = establishementPostings[i].year
                  }
                }
              }
            }
            if (managementPostings.length > 0) {
              for (let i = 0; i < managementPostings.length; i++) {
                /*if(managementPostings[i].postType === "labor" || managementPostings[i].postType === "material"){
                                YoY[managementPostings[i].year] = YoY[managementPostings[i].year] - (managementPostings[i].value * managementPostings[i].amount);
                            } else if(managementPostings[i].postType === "product" || managementPostings[i].postType === "service"){
                                YoY[managementPostings[i].year] = YoY[managementPostings[i].year] + (managementPostings[i].value * managementPostings[i].amount);
                            }*/
                if (managementPostings[i].year) {
                  if (managementPostings[i].year > years) {
                    years = managementPostings[i].year
                  }
                }
              }
            }
            /*for(let i=0;i<foundProject.financial.period;i++){
                        irr = irr + (YoY[i])/(1+foundProject.financial.discountRate)^i;
                    }
                    irr = irr - totalEstablishment;*/
          }
          console.log(irr)
          console.log('Years: ' + years)
          // SET UP
          var YoY: any[] = []
          var labels: any[] = []
          for (let i = 1; i < years + 1; i++) {
            var label = i
            labels.push(label)
            YoY.push(0)
          }
          // SET UP
          if (
            foundProject.budgets.establishment ||
            foundProject.budgets.management
          ) {
            var totalEstablishment = 0
            if (establishementPostings.length > 0) {
              for (let i = 0; i < establishementPostings.length; i++) {
                if (
                  establishementPostings[i].postType === 'labor' ||
                  establishementPostings[i].postType === 'material'
                ) {
                  YoY[establishementPostings[i].year] =
                    YoY[establishementPostings[i].year] -
                    establishementPostings[i].value *
                      establishementPostings[i].amount
                } else if (
                  establishementPostings[i].postType === 'product' ||
                  establishementPostings[i].postType === 'service'
                ) {
                  YoY[establishementPostings[i].year] =
                    YoY[establishementPostings[i].year] +
                    establishementPostings[i].value *
                      establishementPostings[i].amount
                }
              }
            }
            if (managementPostings.length > 0) {
              for (let i = 0; i < managementPostings.length; i++) {
                if (
                  managementPostings[i].postType === 'labor' ||
                  managementPostings[i].postType === 'material'
                ) {
                  YoY[managementPostings[i].year] =
                    YoY[managementPostings[i].year] -
                    managementPostings[i].value * managementPostings[i].amount
                } else if (
                  managementPostings[i].postType === 'product' ||
                  managementPostings[i].postType === 'service'
                ) {
                  YoY[managementPostings[i].year] =
                    YoY[managementPostings[i].year] +
                    managementPostings[i].value * managementPostings[i].amount
                }
              }
            }
            /*for(let i=0;i<foundProject.financial.period;i++){
                        irr = irr + (YoY[i])/(1+foundProject.financial.discountRate)^i;
                    }
                    irr = irr - totalEstablishment;*/
          }
          var parsedLabels = JSON.stringify(labels)
          // GENERATE DATA FOR GRAPH

          // ROI
          var roi = 0
          /*
                var labels = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', "15"];
*/
          // CALCULATE DATASET
          var sumArray: any[] = []
          var sum = 0
          for (let i = 0; i < years; i++) {
            sum = sum + YoY[i]
            sumArray.push(sum)
          }
          /*
                var dataset = [-2, -1.2, 0.2, 0.5, 1, 1.2, 1.6, 2, 2.5, 2.9, 3.3, 4, 4.5, 5, 6];
*/
          console.log(YoY[0])
          console.log(YoY.length)
          var parseddataset = JSON.stringify(YoY)
          var parsedsum = JSON.stringify(sumArray)
          // CHECK LENGTH IS IDENTICAL
          res.render('projects/show', {
            project: foundProject,
            years: years,
            roi: roi,
            irr: irr,
            labels: parsedLabels,
            dataset: parseddataset,
            sum: parsedsum,
          })
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
})

// PROJECT EDIT ROUTE
router.get('/projects/:id/edit', middleware.isLoggedIn, function (req, res) {
  // MAKE SERVICE OWNERSHIP MIDDLEWARE
  // Find specific project in database
  Project.findById(req.params.id, function (err, foundProject) {
    if (err) {
      console.log(err)
    } else {
      res.render('projects/edit', { project: foundProject })
    }
  })
})

// PROJECT LAYOUT EDIT ROUTE
router.get(
  '/projects/:id/layout',
  middleware.isLoggedIn,
  async function (req, res) {
    try {
      let foundProject = await Project.findById(req.params.id)
        .populate({ path: 'system', populate: { path: 'model.species' } })
        .populate('edgesystem')
        .populate('layer')
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
        // CAN REMOVE THE TWO BELOW SYSTEMS AND JUST POPULATE IN ROUTE ABOVE
        let foundSystem = await System.findById(foundProject.system)
          .populate('model.species')
          .exec()
        // EDGE SYSTEM FIND, IF ONE
        // var edgesystem = '5e6639bc8add4f22f0820200'
        // if (foundProject.edgesystem) {
        //   edgesystem = foundProject.edgesystem
        // }
        // let foundEdgeSystem = await System.findById(edgesystem)
        //   .populate('model.species')
        //   .exec()

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

        // CREATE FEATURECOLLECTION FOR ROWS*/
        var featurecollection = turf.featureCollection(layout.rowLineArray)
        var collection = JSON.stringify(featurecollection)
        var bedArrayPolygons = turf.featureCollection(layout.bedPolygonArray)
        var stripsCollection = JSON.stringify(bedArrayPolygons)
        var alleyArrayPolygons = turf.featureCollection(
          layout.alleyPolygonArray
        )
        var alleysCollection = JSON.stringify(alleyArrayPolygons)
        // TEMP TESTING LINES
        var offsetArrayCollection = turf.featureCollection(layout.offsetArray)
        var offsetCollection = JSON.stringify(offsetArrayCollection)
        console.log('Length off offset array: ' + layout.offsetArray)
        // CREATE FEATURE COLLECTION FOR EDGEROWS
        /*   var edgeRowFeatureCollection = turf.featureCollection(edgeRowArray);
                    var edgeRowCollection = JSON.stringify(edgeRowFeatureCollection);*/
        // OFFSET LINE
        /*               var offsetline = lineOffset(line, -(3),{units: "meters"});
                                    var rowPoints = lineIntersect(offsetline, offsetPolygon);
                                    var row = turf.lineString([[rowPoints.features[0].geometry.coordinates[0],rowPoints.features[0].geometry.coordinates[1]],[rowPoints.features[1].geometry.coordinates[0],rowPoints.features[1].geometry.coordinates[1]]],{name: "line-2"});
                                    var stringline = JSON.stringify(row);
                                    var stringbox = JSON.stringify(box);*/
        // CLEAN DATASET FROM ANNUALS - ONLY WORKS IF ANNUALS IN FIRST POSITION
        /*var treeRows = [];
                    for(let i=0;i<dataset.length;i++){
                        if(!(dataset[i].array[0].species.form === "grass")){
                            treeRows.push(dataset[i]);
                        }
                    }
                    // CYCLE THROUGH ALL ROWS TO FIND SYSTEM LENGTH
                    var systemModelLength = 0;
                    for(let i=0;i<dataset.length;i++){
                        if(dataset[i].array[(dataset[i].array.length - 1)].position[1] > systemModelLength){
                            systemModelLength = dataset[i].array[(dataset[i].array.length - 1)].position[1]
                        }
                    }
                    // CALCULATE TREE COUNT REAL BASED ON ROW LENGTH AND SPECIES IN ROWS
                    var treeRowCount = 0;
                    var treeCountArray: any[] = [];
                    var treeMarkerArray: any[] = [];
                    var treeArray: any[] = [];
                    var treeRowArea = 0;
                    for(let i=0;i<rowArray.length;i++){
                        // COUNT SYSTEM MODEL ITERATIONS IN ROW
                        var rowLength = turfLength(rowArray[i], {units: "meters"});
                        // IF POSITION y IS 1, USE NEXT ROW TO FIND SYSTEM MODEL LENGTH?! THIS IS ONLY TEMP SOLUTION
                        /!*var systemModelLength = 0;
                        if(dataset[0].array[(dataset[0].array.length - 1)].position[1] <= 1){
                            systemModelLength = dataset[1].array[(dataset[1].array.length - 1)].position[1];
                        } else {
                            systemModelLength = dataset[0].array[(dataset[0].array.length - 1)].position[1];
                        }*!/
                        var systemModelCount = Math.floor(rowLength/systemModelLength);
                        var systemModelRowRest = ((rowLength/systemModelLength) - Math.floor(rowLength/systemModelLength))*systemModelLength;
                        // CALCULATE AREA
                        treeRowArea = treeRowArea + rowLength * treeRows[treeRowCount].array[0].width;
                        // ADD FIRST TREE IN EACH ROW - ADD LAST SPECIES IN ARRAY - DO IF TO CHECK DISTANCE
                        console.log("Position: " + treeRows[treeRowCount].array[(treeRows[treeRowCount].array.length)-1].position[1]);
                        if(!(treeRows[treeRowCount].array[(treeRows[treeRowCount].array.length)-1].position[1] < systemModelLength)){
                            treeArray.push(treeRows[treeRowCount].array[(treeRows[treeRowCount].array.length)-1].species);
                            var firstTreeMarker = turf.point(rowArray[i].geometry.coordinates[0]);
                            treeMarkerArray.push(firstTreeMarker);
                        }
                        // CALCULATE LENGTH ITERATIONS - EITHER ADD TO ARRAY COUNTER OR JUST SORT LATER
                        for(let j=0;j<systemModelCount;j++){
                            for(let k=0;k<treeRows[treeRowCount].array.length;k++){
                                // ADD TREE SPECIES TO COUNT ARRAY
                                treeArray.push(treeRows[treeRowCount].array[k].species);
                                // CREATE TREE POINTS FOR MARKERS
                                var treeMarker = along(rowArray[i], (j*systemModelLength + treeRows[treeRowCount].array[k].position[1]), {units: "meters"});
                                treeMarkerArray.push(treeMarker);
                            }
                        }
                        // ADD REST
                        for(let j=0;j<treeRows[treeRowCount].array.length;j++){
                            if(treeRows[treeRowCount].array[j].position[1] < systemModelRowRest){
                                treeArray.push(treeRows[treeRowCount].array[j].species);
                                // ADD POINT MARKER FOR REMAINING TREES
                                var treeMarker2 = along(rowArray[i], (systemModelCount*systemModelLength + treeRows[treeRowCount].array[j].position[1]), {units: "meters"});
                                treeMarkerArray.push(treeMarker2);
                            }
                        }
                        // ALIGN ROW ARRAY WITH SYSTEM ROWS (I.E. START NEW ROW MODEL COUNT.) AND REST LAST ROW
                        if(treeRowCount >= treeRows.length - 1){
                            treeRowCount = 0;
                        } else {
                            treeRowCount = treeRowCount + 1;
                        }
                    }
                    console.log(treeArray.length);
                    console.log(treeMarkerArray.length);
                    // DO POINT COLLECTION
                    var treeCanopyArray: any[] = [];
                    if(treeMarkerArray.length < 3000){
                        for(let i=0;i<treeMarkerArray.length;i++){
                            var circle1 = circle(treeMarkerArray[i].geometry.coordinates, 1, {units: "meters"});
                            treeCanopyArray.push(circle1);
                        }
                    }*/
        var treeMarkers = turf.featureCollection(layout.treeMarkerArray)
        var treeCollection = JSON.stringify(treeMarkers)
        /*// COPY ALL SPECIES
                    var allSpeciesCopy = [];
                    for(let i=0;allSpecies.length > i;i++){
                        allSpeciesCopy.push(allSpecies[i]);
                    }*/
        // UNIQUE ITEM COUNTS
        var rowWidth = 0
        if (layout.rowWidth) {
          // ONLY USED FOR SYSTEM BASED
          rowWidth = layout.rowWidth
        }
        var uniqueSpeciesCount = []
        if (layout.uniqueSpeciesCount) {
          uniqueSpeciesCount = layout.uniqueSpeciesCount
        }
        // CALCULATE AREA SIZES
        var treeRowArea = layout.treeRowArea
        // TREE ROW LENGTHS
        if (foundProject.rows && foundProject.rows.length > 0) {
          // DO ROW LENGTH
          console.log('rows ' + foundProject.rows[0])
          for (let i = 0; i < foundProject.rows.length; i++) {
            var rowGeometry = JSON.parse(foundProject.rows[i].geometry)
            foundProject.rows[i].rowlength = turfLength(rowGeometry, {
              units: 'meters',
            })
          }
        }
        /*for(let i=0;i<layout.alleyPolygonArray.length;i++){
                        console.log("area" + i + area(layout.alleyPolygonArray[i]));
                    }*/
        // TEMP VALUE HERE
        var marginArea = 0
        res.render('projects/layout', {
          project: foundProject,
          system: foundSystem,
          collection: collection,
          trees: treeCollection,
          species: uniqueSpeciesCount,
          rowWidth: rowWidth,
          treeArea: treeRowArea,
          marginArea: marginArea,
          strips: stripsCollection,
          alleys: alleysCollection,
          offset: offsetCollection,
        })
      }
    } catch (err) {
      console.log(err)
    }
  }
)

// PROJECT UPDATE ROUTE
router.put('/projects/:id', middleware.isLoggedIn, function (req, res) {
  Project.findByIdAndUpdate(
    req.params.id,
    req.body.project,
    function (err, updatedProject) {
      if (err) {
        console.log(err)
      } else {
        // req.flash("success", "Successfully added service");
        res.redirect('/projects/' + req.params.id)
      }
    }
  )
})

// PROJECT UPDATE ROUTE
router.put('/projects/:id/layout', middleware.isLoggedIn, function (req, res) {
  Project.findByIdAndUpdate(
    req.params.id,
    req.body.project,
    function (err, updatedProject) {
      if (err) {
        console.log(err)
      } else {
        // req.flash("success", "Successfully added service");
        res.redirect('/projects/' + req.params.id + '/layout')
      }
    }
  )
})

// PROJECT VIZ ROUTE
router.get(
  '/projects/:id/viz',
  middleware.isLoggedIn,
  async function (req, res) {
    try {
      let foundProject = await Project.findById(req.params.id)
        .populate({ path: 'system', populate: { path: 'model.species' } })
        .populate('edgesystem')
        .populate('layer')
        .populate({
          path: 'rows',
          populate: { path: 'sequence', populate: { path: 'model.species' } },
        })
        .populate('areas')
        .exec()
      if (foundProject) {
        // CAN REMOVE THE TWO BELOW SYSTEMS AND JUST POPULATE IN ROUTE ABOVE
        try {
          let foundSystem = await System.findById(foundProject.system)
            .populate('model.species')
            .exec()
          // EDGE SYSTEM FIND, IF ONE
          // var edgesystem = '5e6639bc8add4f22f0820200'
          // if (foundProject.edgesystem) {
          //   edgesystem = foundProject.edgesystem
          // }

          //   let foundEdgeSystem = await System.findById(edgesystem)
          //     .populate('model.species')
          //     .exec()
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
          var featurecollection = turf.featureCollection(layout.rowLineArray)
          var collection = JSON.stringify(featurecollection)
          var bedArrayPolygons = turf.featureCollection(layout.bedPolygonArray)
          var stripsCollection = JSON.stringify(bedArrayPolygons)
          var alleyArrayPolygons = turf.featureCollection(
            layout.alleyPolygonArray
          )
          var alleysCollection = JSON.stringify(alleyArrayPolygons)
          var treeMarkers = turf.featureCollection(layout.treeMarkerArray)
          var treeCollection = JSON.stringify(treeMarkers)
          // UNIQUE ITEM COUNTS
          var rowWidth = 0
          if (layout.rowWidth) {
            // ONLY USED FOR SYSTEM BASED
            rowWidth = layout.rowWidth
          }
          var uniqueSpeciesCount = []
          if (layout.uniqueSpeciesCount) {
            uniqueSpeciesCount = layout.uniqueSpeciesCount
          }
          // CALCULATE AREA SIZES
          var treeRowArea = layout.treeRowArea
          // TEMP VALUE HERE
          var marginArea = 0
          res.render('projects/viz', {
            project: foundProject,
            system: foundSystem,
            collection: collection,
            trees: treeCollection,
            species: uniqueSpeciesCount,
            rowWidth: rowWidth,
            treeArea: treeRowArea,
            marginArea: marginArea,
            strips: stripsCollection,
            alleys: alleysCollection,
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

// PROJECT 3D VIZ
router.get('/projects/:id/3dviz', middleware.isLoggedIn, function (req, res) {
  res.render('projects/3dviz')
})

// PROJECT STATUS CHANGE ROUTE - IMPLEMENT
router.put(
  '/projects/:id/implement',
  middleware.isLoggedIn,
  function (req, res) {
    Project.findByIdAndUpdate(
      req.params.id,
      { $set: { status: 'Implementation' } },
      function (err, plannedProject) {
        if (err) {
          console.log(err)
        } else {
          res.redirect('/projects/' + req.params.id)
        }
      }
    )
  }
)

// PROJECT STATUS CHANGE ROUTE - RETIRED
router.put('/projects/:id/retire', middleware.isLoggedIn, function (req, res) {
  Project.findByIdAndUpdate(
    req.params.id,
    { $set: { status: 'Retired' } },
    function (err, retiredProject) {
      if (err) {
        console.log(err)
      } else {
        res.redirect('/projects/' + req.params.id)
      }
    }
  )
})

// PROJECT STATUS CHANGE ROUTE - COMPLETE
router.put(
  '/projects/:id/complete',
  middleware.isLoggedIn,
  async function (req, res) {
    try {
      let completedProject = await Project.findByIdAndUpdate(req.params.id, {
        $set: { status: 'Completed' },
      })
      if (completedProject) {
        // FIND AREA, UPDATE PRESENT SYSTEM AND PUSH OLD PRESENT SYSTEM TO PAST SYSTEMS
        try {
          let projectArea = await Layer.findById(completedProject.layer)

          if (projectArea) {
            projectArea.systems.past.push(projectArea.systems.present)
            projectArea.systems.present = completedProject.system
            // CLEAR FUTURE DRAFTS?
            // ADD ASSETS AND ROWS TO LAYER
            if (completedProject.rows && completedProject.rows.length > 0) {
              projectArea.rows = completedProject.rows
            }
            if (completedProject.assets && completedProject.assets.length > 0) {
              projectArea.assets = completedProject.assets
            }
            if (completedProject.areas && completedProject.areas.length > 0) {
              projectArea.areas = completedProject.areas
            }
            // SAVE AREA
            projectArea.save()
            // REDIRECT
            res.redirect('/projects/' + req.params.id)
          } else {
            console.log('No projectArea')
          }
        } catch (err) {
          console.log(err)
        }
      } else {
        console.log('No completedProject')
      }
    } catch (err) {
      console.log(err)
    }
  }
)

// ADD PROJECT EDGE SYSTEM NEW
router.get(
  '/projects/:id/addedgesystem',
  middleware.isLoggedIn,
  function (req: any, res) {
    Project.findById(req.params.id, function (err, foundProject) {
      if (err) {
        console.log(err)
      } else {
        System.find({ 'owner.id': req.user._id }, function (err, foundSystems) {
          if (err) {
            console.log(err)
          } else {
            // SORT OUT MONOCULTURE SYSTEMS
            var realSystems: any[] = []
            for (let i = 0; i < foundSystems.length; i++) {
              var systemNameSplit = foundSystems[i].name.split(' ')
              if (
                !(systemNameSplit[systemNameSplit.length - 1] === 'monoculture')
              ) {
                realSystems.push(foundSystems[i])
              }
            }
            res.render('projects/addedgesystem', {
              project: foundProject,
              systems: realSystems,
            })
          }
        })
      }
    })
  }
)

// ADD PROJECT EDGE SYSTEM UPDATE
router.post(
  '/projects/:id/addedgesystem',
  middleware.isLoggedIn,
  async function (req, res) {
    // FIND SYSTEM
    try {
      let foundSystem = await System.findById(req.body.systemid)

      // FIND PROJECT
      try {
        let foundProject = await Project.findByIdAndUpdate(req.params.id, {
          $set: { edgesystem: foundSystem },
        })
        if (foundProject) {
          res.redirect('/projects/' + foundProject._id)
        } else {
          console.log('No foundProject')
        }
      } catch (err) {
        console.log(err)
      }
    } catch (err) {
      console.log(err)
    }
  }
)

// PROJECT ASSET CREATION
router.get(
  '/projects/:id/generateassets',
  middleware.isLoggedIn,
  async function (req, res) {
    // FIND PROJECT
    try {
      let foundProject = await Project.findById(req.params.id)
        .populate({ path: 'system', populate: { path: 'model.species' } })
        .populate('edgesystem')
        .populate('layer')
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

          var treeAssetRowRef = layout.treeAssetRowRef
          var treeAssetArray = layout.treeAssetArray
          var treeMarkerArray = layout.treeMarkerArray
          /*// DON'T HAVE MARKERS. THEY ARE CIRCLES/POLYGONS
                    console.log("Trees: " + treeAssetArray.length);
                    console.log("Tree #1 - " + treeAssetArray[0]);
                    console.log(treeAssetArray[0].species);
                    console.log(treeAssetArray[0].lat);
                    res.redirect("/projects/" + req.params.id);*/
          console.log('Trees Assets: ' + treeAssetArray.length)
          console.log('Trees Markets: ' + treeMarkerArray.length)
          console.log('Trees Row Refs: ' + treeAssetRowRef.length)
          /*
                                        res.redirect("/projects/" + req.params.id);
                    */
          // CREATE ASSETS
          try {
            let createdAssets = await Asset.insertMany(treeAssetArray)

            console.log(createdAssets.length)
            try {
              let updatedProject = await Project.findByIdAndUpdate(
                foundProject._id,
                { $push: { assets: { $each: createdAssets } } }
              )

              // SAVE TREE ASSETS ON ROWS AS WELL - IF NO ROWS, GENERATE THEM AND AREAS?
              if (updatedProject) {
                try {
                  let foundRows = await Row.find({
                    _id: { $in: updatedProject.rows },
                  })

                  for (let i = 0; i < createdAssets.length; i++) {
                    var ref = treeAssetRowRef[i]
                    console.log('ref ' + ref)
                    foundRows[ref].assets.push(createdAssets[i])
                  }
                  // SAVE ROWS INDIVIDUALLY
                  for (let i = 0; i < foundRows.length; i++) {
                    foundRows[i].save()
                  }
                  console.log('Assets added to project')
                  res.redirect('/projects/' + req.params.id)
                } catch (err) {
                  console.log(err)
                }
              } else {
                console.log('No updatedProject')
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

// PROJECT LAYOUT EXPLODE ROUTE
router.get('/projects/:id/explode', middleware.isLoggedIn, function (req, res) {
  // FIND PROJECT
  Project.findById(req.params.id)
    .populate({ path: 'system', populate: { path: 'model.species' } })
    .populate({ path: 'edgesystem', populate: { path: 'model.species' } })
    .populate('layer')
    .exec(async function (err, foundProject) {
      if (err) {
        console.log(err)
      } else {
        var layout = gisObj.systemBasedLayout(foundProject)
        // CREATE ROWS ON PROJECT
        var rows: any[] = []
        for (let i = 0; i < layout.rowLineArray.length; i++) {
          var row = {
            geometry: JSON.stringify(layout.rowLineArray[i]),
            name: 'Row ' + i,
          }
          // PUSH TO ARRAY
          rows.push(row)
        }
        console.log(rows[0])
        // CREATE AREAS
        var areas: any[] = []
        for (let i = 0; i < layout.alleyPolygonArray.length; i++) {
          var alleyGeometry = layout.alleyPolygonArray[i]
          var alley = {
            geometry: JSON.stringify(layout.alleyPolygonArray[i]),
            name: 'Alley ' + i,
            size: area(alleyGeometry),
          }
          // PUSH TO ARRAY
          areas.push(alley)
        }
        for (let i = 0; i < layout.bedPolygonArray.length; i++) {
          var bedGeometry = layout.bedPolygonArray[i]
          var treeStrip = {
            geometry: JSON.stringify(layout.bedPolygonArray[i]),
            name: 'Tree Strip ' + i,
            size: area(bedGeometry),
          }
          // PUSH TO ARRAY
          areas.push(treeStrip)
        }
        var rowCollection = JSON.stringify(layout.rowLineCollection)
        // CREATE AREAS ON AREA
        var alleyCollection = JSON.stringify(layout.bedPolygonCollection)
        // CREATE ROWS
        try {
          let createdRows = await Row.insertMany(rows)
          // CREATE AREAS
          try {
            let createdAreas = await Area.insertMany(areas)
            try {
              let updatedProject = await Project.findByIdAndUpdate(
                req.params.id,
                {
                  $push: {
                    rows: { $each: createdRows },
                    areas: { $each: createdAreas },
                  },
                }
              )
              if (updatedProject) {
                res.redirect('/projects/' + updatedProject._id + '/layout')
              } else {
                console.log('No updatedProject')
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
      }
    })
})

// PROJECT DELETE ALL ROWS, AND LATER ON AREAS ON PROJECT
router.get(
  '/projects/:id/deleterows',
  middleware.isLoggedIn,
  async function (req, res) {
    // FIND PROJECT
    try {
      let foundProject = await Project.findById(req.params.id)
      if (foundProject) {
        try {
          await Row.deleteMany({ _id: { $in: foundProject.rows } })
          // DELETE ROWS
          try {
            let updatedProject = await Project.findByIdAndUpdate(
              req.params.id,
              {
                $set: { rows: [] },
              }
            )
            if (updatedProject) {
              // REDIRECT
              res.redirect('/projects/' + updatedProject._id + '/layout')
            } else {
              console.log('No updatedProject')
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

// PROJECT ASSET SHOW PAGE
router.get(
  '/projects/:id/assets',
  middleware.isLoggedIn,
  async function (req, res) {
    // FIND PROJECT
    try {
      let foundProject = await Project.findById(req.params.id)
        .populate('assets')
        .populate('layer')
        .exec()

      var allTrees: any[] = []
      var allTreesArray: any[] = []
      // GENERATE ASSET CIRCLES
      var treeCanopyArray: any[] = []
      if (foundProject) {
        for (let i = 0; foundProject.assets.length > i; i++) {
          var point = turf.point([
            foundProject.assets[i].lat,
            foundProject.assets[i].lng,
          ])
          var circle1 = circle(point.geometry.coordinates, 1, {
            units: 'meters',
          })
          allTrees.push(foundProject.assets[i].name)
          allTreesArray.push(foundProject.assets[i].name)
          treeCanopyArray.push(circle1)
        }
        var treeMarkers = turf.featureCollection(treeCanopyArray)
        var treeCollection = JSON.stringify(treeMarkers)
        // UNIQUE TREE SPECIES
        var uniqueSpecies = unique(allTrees)
        // UNIQUE SPECIES COUNTS
        var uniqueSpeciesCount: any[] = []
        for (let i = 0; uniqueSpecies.length > i; i++) {
          var count = 0
          for (let j = 0; j < allTreesArray.length; j++) {
            if (allTreesArray[j] === uniqueSpecies[i]) {
              count = count + 1
            }
          }
          let speciesCount = {
            name: uniqueSpecies[i],
            uniqueCount: count,
          }
          uniqueSpeciesCount.push(speciesCount)
        }
        console.log(uniqueSpeciesCount)
        res.render('projects/assets', {
          project: foundProject,
          trees: treeCollection,
          treecounts: uniqueSpeciesCount,
        })
      } else {
        console.log('No foundProject')
      }
    } catch (err) {
      console.log(err)
    }
  }
)

// SERVICES DELETE ROUTE
router.delete(
  '/projects/:id',
  middleware.isLoggedIn,
  async function (req, res) {
    // MAKE PROJECT OWNERSHIP MIDDLEWARE
    // FIND PROJECT FIRST FOR REFERENCES
    try {
      let foundProject = await Project.findById(req.params.id)

      // REMOVE PROJECT REFERENCE FROM LAYER
      if (foundProject) {
        try {
          let updatedLayer = await Layer.findByIdAndUpdate(foundProject.layer, {
            $pull: { projects: foundProject._id },
          })
          console.log('project removed from layer')

          // DELETE BUDGET(S)
          try {
            await Budget.findByIdAndRemove(foundProject.budgets.establishment)
            console.log('establishment budget deleted from project')

            try {
              await Budget.findByIdAndRemove(foundProject.budgets.management)
              console.log('management budget deleted from project')
              // DELETE ACTIVITIES
              foundProject.activities.forEach(async function (activity) {
                try {
                  await Activity.findByIdAndRemove(activity)
                } catch (err) {
                  console.log(err)
                }
              })

              // DELETE PROJECT
              try {
                await Project.findByIdAndRemove(req.params.id)
                console.log('project deleted')
                res.redirect('/projects')
              } catch (err) {
                console.log(err)
                res.redirect('/projects')
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

// --------------- NESTED ROUTES ---------------- //

// LAYER PROJECT NEW ROUTE WITH SYSTEM REF
router.get(
  '/layers/:id/projects/new/:system',
  middleware.isLoggedIn,
  function (req, res) {
    // CHECK OWNERSHIP!!!
    // FIND LAYER ID
    Layer.findById(req.params.id, function (err, foundLayer) {
      if (err) {
        console.log(err)
        // res.flash(err);
      } else {
        System.findById(req.params.system, function (err, foundSystem) {
          if (err) {
            console.log(err)
          } else {
            res.render('projects/new', {
              layer: foundLayer,
              system: foundSystem,
            })
          }
        })
      }
    })
  }
)

// LAYER PROJECT CREATE ROUTE
router.post(
  '/layers/:id/projects',
  middleware.isLoggedIn,
  async function (req: any, res) {
    // Lookup place using id
    try {
      let foundLayer = await Layer.findById(req.params.id)
        .populate('rows')
        .exec()

      let createdProject = await Project.create(req.body.project)

      // FIND SYSTEM AND ADD TO PROJECT
      let foundSystem = await System.findById(req.body.systemid)
        .populate('model.species')
        .exec()

      if (foundLayer && createdProject && foundSystem) {
        // CREATE CURRENCY
        // ADD PROJECT STUFF
        createdProject.owner.id = req.user._id
        createdProject.system = foundSystem
        createdProject.layer = foundLayer
        createdProject.financial = {
          discountRate: 0.05,
          period: 20,
        }
        createdProject.status = 'planning'
        // Connect new project to layer
        foundLayer.projects.push(createdProject)
        foundLayer.save()
        // Save rows from layer on project - Do it so that they are just blank for now
        if (req.body.existingrows === 'on') {
          var newRows: any[] = []
          for (let i = 0; i < foundLayer.rows.length; i++) {
            var row = {
              geometry: foundLayer.rows[i].geometry,
              name: foundLayer.rows[i].name,
            }
            newRows.push(row)
          }
          try {
            let createdRows = await Row.insertMany(newRows)

            // @ts-ignore
            createdProject.rows = createdRows
            // Save the project
            createdProject.save()
            res.redirect('/projects/' + createdProject._id)
          } catch (err) {
            console.log(err)
          }
        } else {
          // Save the project
          createdProject.save()
          res.redirect('/projects/' + createdProject._id)
        }
      }
    } catch (err) {
      console.log(err)
      res.redirect('/layers/' + req.params.id)
    }
  }
)

// PROJECT ASSETS DELETE ROUTE
router.delete(
  '/projects/:id/allassets',
  middleware.isLoggedIn,
  async function (req, res) {
    // FIND PROJECT
    try {
      let foundProject = await Project.findById(req.params.id)
      // FIND ASSETS AND DELETE
      if (foundProject) {
        for (let i = 0; foundProject.assets.length > i; i++) {
          // @ts-ignore
          foundProject.assets.remove(foundProject.assets[i])
          // SAVE PROJECT
          foundProject.save()
          // DELETE ASSET
          try {
            await Asset.findByIdAndRemove(foundProject.assets[i])
            console.log('Deleted asset')
          } catch (err) {
            console.log(err)
          }
        }
        res.redirect('/projects/' + foundProject.id)
      } else {
        console.log("No foundProject");
      }
    } catch (err) {
      console.log(err)
    }
  }
)

// ROW NEW ROUTE
router.get(
  '/projects/:id/row/new',
  middleware.isLoggedIn,
  function (req: any, res) {
    // FIND PROJECT
    Project.findById(req.params.id)
      .populate('layer')
      .exec(function (err, foundProject) {
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
                res.render('projects/row', {
                  project: foundProject,
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
router.post('/projects/:id/row', middleware.isLoggedIn, function (req, res) {
  // REDIRECT IF NO GEOMETRY
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
    Row.create(row, async function (err, createdRow) {
      if (err) {
        console.log(err)
      } else {
        // FIND PROJECT
        try {
          let foundProject = await Project.findByIdAndUpdate(req.params.id, {
            $addToSet: { rows: createdRow },
          })
          // CREATE ROW
          if (foundProject){
          console.log('Row has been added to project')
          res.redirect('/projects/' + foundProject.id + '/layout')
          } else {
            console.log("No foundProject")
          }
        } catch (err) {
          console.log(err)
        }
      }
    })
  }
})

// EDIT ROW
router.get(
  '/projects/:id/row/:pid/edit',
  middleware.isLoggedIn,
  function (req: any, res) {
    // FIND LAYER
    Project.findById(req.params.id)
      .populate({ path: 'rows', populate: { path: 'sequence' } })
      .populate('layer')
      .exec(function (err, foundProject) {
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
                      res.render('projects/editrow', {
                        project: foundProject,
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
router.put(
  '/projects/:id/row/:pid',
  middleware.isLoggedIn,
  function (req, res) {
    // CREATE ROW HERE?
    var row: any = {
      name: req.body.row.name,
    }
    if (!(req.body.sequenceid === 'none') && req.body.sequenceid) {
      row.sequence = req.body.sequenceid
    }
    // FIND PROJECT
    Project.findById(req.params.id, function (err, foundProject) {
      if (err) {
        console.log(err)
      } else {
        // FIND AND UPDATE ROW
        Row.findByIdAndUpdate(req.params.pid, row, function (err, updatedRow) {
          if (err) {
            console.log(err)
          } else {
            res.redirect('/projects/' + foundProject._id + '/layout')
          }
        })
      }
    })
  }
)

// DELETE ROW
router.delete(
  '/projects/:id/row/:pid',
  middleware.isLoggedIn,
  function (req, res) {
    // FIND LAYER
    Project.findById(req.params.id, async function (err, updatedProject) {
      if (err) {
        console.log(err)
      } else {
        // REMOVE ROW
        console.log('Length before ' + updatedProject.rows.length)
        updatedProject.rows.remove(req.params.pid)
        // DELETE ROW
        try {
          await Row.findByIdAndRemove(req.params.pid)
          console.log('Length after ' + updatedProject.rows.length)
          res.redirect('/projects/' + updatedProject._id + '/layout')
        } catch (err) {
          console.log(err)
        }
      }
    })
  }
)

// ---------------- AREAS

// EDIT AREA
router.get(
  '/projects/:id/areas/:pid/edit',
  middleware.isLoggedIn,
  function (req: any, res) {
    // FIND LAYER
    Project.findById(req.params.id)
      .populate({ path: 'areas', populate: { path: 'rotation' } })
      .populate('layer')
      .exec(function (err, foundProject) {
        if (err) {
          console.log(err)
        } else {
          // FIND ROW
          Area.findById(req.params.pid)
            .populate('rotation')
            .exec(function (err, foundArea) {
              if (err) {
                console.log(err)
              } else {
                // FIND MY SYSTEMS
                Rotation.find(
                  { 'owner.id': req.user._id },
                  function (err, foundRotations) {
                    if (err) {
                      console.log(err)
                    } else {
                      res.render('projects/editarea', {
                        project: foundProject,
                        area: foundArea,
                        rotations: foundRotations,
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

// UPDATE AREA
router.put(
  '/projects/:id/areas/:pid',
  middleware.isLoggedIn,
  function (req, res) {
    // CREATE AREA HERE?
    var area: any = {
      name: req.body.area.name,
    }
    if (!(req.body.rotationid === 'none') && req.body.rotationid) {
      area.rotation = req.body.rotationid
    }
    // FIND PROJECT
    Project.findById(req.params.id, function (err, foundProject) {
      if (err) {
        console.log(err)
      } else {
        // FIND AND UPDATE AREA
        Area.findByIdAndUpdate(
          req.params.pid,
          area,
          function (err, updatedArea) {
            if (err) {
              console.log(err)
            } else {
              console.log('Updated area: ' + updatedArea)
              res.redirect('/projects/' + foundProject._id + '/layout')
            }
          }
        )
      }
    })
  }
)

// -------------------- PDFS

// BUDGET PDF
router.get(
  '/projects/:id/budgetpdf',
  middleware.isLoggedIn,
  async function (req, res, next) {
    // FIND PROJECT

    // GENERATE PDF TEST
    var myDoc = new PDFDocument({ bufferPages: true })

    let buffers: any[] = []
    myDoc.on('data', buffers.push.bind(buffers))
    myDoc.on('end', () => {
      let pdfData = Buffer.concat(buffers)
      res.writeHead(200, {
        'Content-Length': Buffer.byteLength(pdfData),
        'Content-Type': 'application/pdf',
        'Content-disposition': 'attachment;filename=test.pdf',
      })
    })

    myDoc.font('Times-Roman').fontSize(12).text(`this is a test text`)

    myDoc.end()
  }
)

// --------------- NESTED ROUTES ---------------- //

export default router

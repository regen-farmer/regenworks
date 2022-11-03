const express = require('express');

const router = express.Router();
const request = require('request'); // Making REST requests
const turf = require('@turf/helpers');
const centroid = require('@turf/centroid');
const length = require('@turf/length');
const along = require('@turf/along');
const circle = require('@turf/circle');

// NODE GEOCODER CODE
const NodeGeocoder = require('node-geocoder');
const middleware = require('../middleware'); // Will automatically require the middleware "index" file as the standard
const Layer = require('../models/layer');
const Practice = require('../models/practice');
const Parcel = require('../models/parcel');
const User = require('../models/user');

const options = {
  provier: 'google',
  httpAdapter: 'https',
  apiKey: process.env.GEOCODER_API_KEY,
  formatter: null,
};

const geocoder = NodeGeocoder(options);

// PARCEL INDEX ROUTE
router.get('/parcels', middleware.isLoggedIn, (req, res) => {
  // Get all parcels from DB
  Parcel.find({ 'owner.id': req.user._id }, (err, allUserParcels) => {
    if (err) {
      console.log(err);
    } else {
      res.render('parcels/index', { parcels: allUserParcels });
    }
  });
});

// PARCEL NEW ROUTE
router.get('/parcels/new', middleware.isLoggedIn, (req, res) => {
  // Find all products in database and pass to ejs
  Practice.find((err, foundPractices) => {
    if (err) {
      console.log(err);
    } else {
      res.render('parcels/new', { practices: foundPractices });
    }
  });
});

// PARCEL CREATE ROUTE
router.post('/parcels', middleware.isLoggedIn, (req, res) => {
  // Create variable with new place posted from place form
  const { name } = req.body.parcel;
  const climate = {
    annualaverageprec: req.body.parcel.climate.annualaverageprec,
    hardiness: {
      low: -1,
      high: 16,
    },
  };
  const { soilType } = req.body.parcel;
  const { agType } = req.body.parcel;
  const { size } = req.body.parcel;
  const { description } = req.body.parcel;
  const practices = req.body.practiceids;
  const { measurement } = req.body.parcel;
  const owner = {
    id: req.user._id,
    username: req.user.username,
  };
    // CONVERT ADDRESS TO COORDINATES USING GEOCODER
  geocoder.geocode(req.body.parcel.location, (err, data) => {
    if (err || !data.length) {
      console.log(err);
      console.log(data);
      return res.redirect('back');
    }
    const lat = data[0].latitude;
    const lng = data[0].longitude;
    const location = data[0].formattedAddress;
    // HARDCODE COLD HARDINESS FOR CERTAIN REGIONS
    if (data[0].country === 'Brazil') {
      climate.hardiness.low = 1;
      climate.hardiness.high = 10;
    }
    if (data[0].country === 'Sweden') {
      climate.hardiness.low = -18;
      climate.hardiness.high = -12;
    }
    if (data[0].country === 'Canada') {
      climate.hardiness.low = -34;
      climate.hardiness.high = -29;
    }
    if (data[0].country === 'Denmark') {
      climate.hardiness.low = -12;
      climate.hardiness.high = -9;
    }
    if (data[0].country === 'Vietnam') {
      climate.hardiness.low = 9;
      climate.hardiness.high = 16;
    }
    if (data[0].country === 'India') {
      climate.hardiness.low = 9;
      climate.hardiness.high = 16;
    }
    if (data[0].country === 'Guatemala') {
      climate.hardiness.low = 4;
      climate.hardiness.high = 10;
    }
    if (data[0].country === 'Nicaragua') {
      climate.hardiness.low = 10;
      climate.hardiness.high = 16;
    }
    if (data[0].country === 'Colombia') {
      climate.hardiness.low = 4;
      climate.hardiness.high = 16;
    }
    if (data[0].country === 'Costa Rica') {
      climate.hardiness.low = 8;
      climate.hardiness.high = 16;
    }
    if (data[0].country === 'Philippines') {
      climate.hardiness.low = 10;
      climate.hardiness.high = 16;
    }
    if (data[0].country === 'Greece') {
      climate.hardiness.low = -7;
      climate.hardiness.high = -1;
    }
    if (data[0].country === 'Uganda') {
      climate.hardiness.low = 6;
      climate.hardiness.high = 16;
    }
    if (data[0].country === 'Guinea-Bissau') {
      climate.hardiness.low = 10;
      climate.hardiness.high = 16;
    }
    if (data[0].country === 'Sri Lanka') {
      climate.hardiness.low = 10;
      climate.hardiness.high = 16;
    }
    if (data[0].country === 'United Kingdom') {
      climate.hardiness.low = -12;
      climate.hardiness.high = -7;
    }
    if (data[0].country === 'Spain') {
      climate.hardiness.low = -7;
      climate.hardiness.high = -1;
    }
    if (data[0].country === 'Portugal') {
      climate.hardiness.low = -7;
      climate.hardiness.high = -1;
    }
    if (data[0].country === 'Saudi Arabia') {
      climate.hardiness.low = 7;
      climate.hardiness.high = 16;
    }
    if (data[0].country === 'Myanmar') {
      climate.hardiness.low = 10;
      climate.hardiness.high = 16;
    }
    if (data[0].country === 'United States') {
      climate.hardiness.low = -34;
      climate.hardiness.high = -23;
    }
    if (data[0].country === 'Germany') {
      climate.hardiness.low = -12;
      climate.hardiness.high = -9;
    }
    if (data[0].country === 'Netherlands') {
      climate.hardiness.low = -12;
      climate.hardiness.high = -9;
    }
    if (data[0].country === 'Belgium') {
      climate.hardiness.low = -12;
      climate.hardiness.high = -9;
    }
    // Create new parcel
    const newParcel = {
      name, soilType, agType, size, description, location, lat, lng, practices, owner, climate, measurement,
    };
    // Create a new parcel and save it to the database
    Parcel.create(newParcel, (err, newlyCreated) => {
      if (err) {
        // req.flash("error", "Something went wrong");
        console.log(err);
      } else {
        console.log(`${newlyCreated} added`);
        // Find user based on ID
        User.findById(newlyCreated.owner.id, (err, foundUser) => {
          if (err) {
            console.log(err);
          } else {
            // Add the parcel to the users parcels for referencing
            foundUser.parcels.push(newlyCreated);
            foundUser.currentProject = newlyCreated;
            foundUser.save();
            // Save JSON file to geometry
            newlyCreated.geometry = req.body.geometry;
            // Save the layer
            newlyCreated.save();
            // ADD PRECIPITATION?HARDINESS?
            // req.flash("success", "You have successfully created a new parcel");
            res.redirect(`/parcels/${newlyCreated._id}/layers/new`);
          }
        });
      }
    });
  });
});

// PARCEL SHOW ROUTE
router.get('/parcels/:id', middleware.checkParcelOwnership, (req, res) => {
  Parcel.findById(req.params.id).populate('practices').populate('layers').exec((err, foundParcel) => {
    if (err) {
      console.log(err);
    } else {
      const geometry = turf.polygon([[[0, 0], [0, 1], [1, 0], [0, 0]]]);
      const geometryArray = [];
      const placesArray = [];
      geometryArray.push(geometry);
      if (foundParcel.layers.length > 0) {
        for (i = 0; foundParcel.layers.length > i; i++) {
          // GET GEOMETRY
          const polygon = JSON.parse(foundParcel.layers[i].geometry);
          // PUSH TO ARRAY
          const properties = {
            description: foundParcel.layers[i].name,
          };
          const feature = turf.feature(polygon.geometry, properties);
          geometryArray.push(feature);
          // CREATE PLACE
          const centroidPoint = centroid(polygon.geometry);
          const place = turf.point(centroidPoint.geometry.coordinates, properties);
          placesArray.push(place);
        }
      }
      // CREATE LABEL COLLECTION
      const placesCollection = turf.featureCollection(placesArray);
      const places = JSON.stringify(placesCollection);
      // CREATE FEATURECOLLECTION
      const featurecollection = turf.featureCollection(geometryArray);
      const collection = JSON.stringify(featurecollection);
      res.render('parcels/show', { parcel: foundParcel, collection, places });
    }
  });
});

// PARCEL EDIT ROUTE
router.get('/parcels/:id/edit', middleware.checkParcelOwnership, (req, res) => {
  // Find specific place in database
  Parcel.findById(req.params.id).populate('practices').exec((err, foundParcel) => {
    if (err) {
      console.log(err);
    } else {
      // RENDER EDIT PAGE FOR PARCEL
      res.render('parcels/edit', { parcel: foundParcel });
    }
  });
});

// PLACES UPDATE ROUTE
router.put('/parcels/:id', middleware.checkParcelOwnership, (req, res) => {
  // UPDATE PARCEL
  const { parcel } = req.body;
  // CONVERT ADDRESS TO COORDINATES USING GEOCODER
  geocoder.geocode(req.body.parcel.location, (err, data) => {
    if (err || !data.length) {
      console.log(err);
      console.log(data);
      return res.redirect('back');
    }
    parcel.lat = data[0].latitude;
    parcel.lng = data[0].longitude;
    parcel.location = data[0].formattedAddress;
    // UPDATE PARCEL
    Parcel.findByIdAndUpdate(req.params.id, parcel, (err, updatedParcel) => {
      if (err) {
        console.log(err);
      } else {
        console.log(updatedParcel);
        res.redirect(`/parcels/${req.params.id}`);
      }
    });
  });
});

// PLACES DESTROY ROUTE
router.delete('/parcels/:id', middleware.checkParcelOwnership, (req, res) => {
  Parcel.findByIdAndRemove(req.params.id, (err) => {
    if (err) {
      console.log(err);
      res.redirect(`/users/${req.user.id}`);
    } else {
      res.redirect(`/users/${req.user.id}`);
    }
  });
});

// ANALYSIS ROUTE FOR ALL PARCEL LAYERS
router.get('/parcels/:id/analysis', middleware.checkParcelOwnership, (req, res) => {
  Parcel.findById(req.params.id).populate('layers').exec((err, foundParcel) => {
    if (err) {
      console.log(err);
    } else {
      res.render('parcelanalysis', { parcel: foundParcel });
    }
  });
});

// SUCCESSION ROUTE FOR ALL SYSTEMS IN PARCEL LAYERS
router.get('/parcels/:id/composition', middleware.checkParcelOwnership, (req, res) => {
  Parcel.findById(req.params.id).populate('layers').exec((err, foundParcel) => {
    if (err) {
      console.log(err);
    } else {
      const layerarray = [];
      foundParcel.layers.forEach((layer) => {
        layerarray.push(layer._id);
      });
      Layer.find({ _id: layerarray }).populate('systems.future').exec((err, foundLayers) => {
        if (err) {
          console.log(err);
        } else {
          res.render('parcelcomposition', { parcel: foundParcel, layers: foundLayers });
        }
      });
    }
  });
});

// BIGQUERY PARCEL LAT LNG TEST
router.get('/parcels/:id/climate', middleware.checkParcelOwnership, (req, res) => {
  Parcel.findById(req.params.id, (err, foundParcel) => {
    if (err) {
      console.log(err);
    } else {
      geocoder.geocode(foundParcel.location, (err, data) => {
        if (err || !data.length) {
          console.log(err);
          console.log(data);
          return res.redirect('back');
        }
        console.log(data[0].country);
        console.log(data[0].administrativeLevels.level1long);
        console.log(data[0].city);
        request(`https://restcountries.eu/rest/v2/name/${data[0].country}?fullText=true&fields=alpha3Code`, (error, response, body) => {
          console.log('error:', error);
          console.log('statusCode:', response && response.statusCode);
          const alphacountry = JSON.parse(body);
          console.log(alphacountry[0].alpha3Code);
          request(`http://climatedataapi.worldbank.org/climateweb/rest/v1/country/annualavg/pr/1980/1999/${alphacountry[0].alpha3Code}`, (error1, response1, body1) => {
            console.log('error:', error1);
            console.log('statusCode:', response1 && response1.statusCode);
            const weather = JSON.parse(body1);
            console.log(weather[0].annualData[0]);
            res.render('parcels/climate');
          });
        });
      });
    }
  });
});

// PARCEL
router.get('/parcels/:id/layout', middleware.isLoggedIn, (req, res) => {
  // FIND PARCEL
  Parcel.findById(req.params.id).populate({ path: 'layers', populate: { path: 'areas' } }).populate({ path: 'layers', populate: { path: 'rows', populate: { path: 'sequence' } } }).exec((err, foundParcel) => {
    if (err) {
      console.log(err);
    } else {
      const geometry = turf.polygon([[[0, 0], [0, 1], [1, 0], [0, 0]]]);
      const geometryArray = [];
      const placesArray = [];
      geometryArray.push(geometry);
      if (foundParcel.layers.length > 0) {
        for (i = 0; foundParcel.layers.length > i; i++) {
          // GET GEOMETRY
          const polygon = JSON.parse(foundParcel.layers[i].geometry);
          // PUSH TO ARRAY
          const properties = {
            description: foundParcel.layers[i].name,
          };
          const feature = turf.feature(polygon.geometry, properties);
          geometryArray.push(feature);
          // CREATE PLACE
          const centroidPoint = centroid(polygon.geometry);
          const place = turf.point(centroidPoint.geometry.coordinates, properties);
          placesArray.push(place);
        }
      }
      // CREATE LABEL COLLECTION
      const placesCollection = turf.featureCollection(placesArray);
      const places = JSON.stringify(placesCollection);
      // CREATE FEATURECOLLECTION
      const featurecollection = turf.featureCollection(geometryArray);
      const collection = JSON.stringify(featurecollection);
      // GENERATE ROWS AND TREES
      const treeAssetsArray = [];
      const treeMarkerArray = [];
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
      // CYCLE THROUGH EACH LAYER
      for (j = 0; j < foundParcel.layers.length; j++) {
        // CYCLE THROUGH EACH ROW OF EACH LAYER
        for (i = 0; i < foundParcel.layers[j].rows.length; i++) {
          // SET ROW DATA
          if (foundParcel.layers[j].rows[i].sequence) {
            const datasetRows = foundParcel.layers[j].rows[i].sequence.model;
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
            const rowLine = JSON.parse(foundParcel.layers[j].rows[i].geometry);
            const rowLength = length(rowLine, { units: 'meters' });
            console.log(`Row length ${rowLength}`);
            // SYSTEM MODEL LENGTH
            const systemModelLength = foundParcel.layers[j].rows[i].sequence.sequencelength;
            /* if (datasetRows[0].array[(datasetRows[0].array.length - 1)].position[1] <= 1) {
                            systemModelLength = datasetRows[1].array[(datasetRows[1].array.length - 1)].position[1];
                        } else {
                            systemModelLength = datasetRows[0].array[(datasetRows[0].array.length - 1)].position[1];
                        } */
            console.log(`System model length:${systemModelLength}`);
            // FIND MODEL COUNT AND REST
            const systemModelCount = Math.floor(rowLength / systemModelLength);
            const systemModelRowRest = ((rowLength / systemModelLength) - Math.floor(rowLength / systemModelLength)) * systemModelLength;
            // ADD FIRST TREE IN EACH ROW - ADD LAST SPECIES IN ARRAY - DO IF TO CHECK DISTANCE
            const firstTreeMarker = turf.point(rowLine.geometry.coordinates[0]);
            treeMarkerArray.push(firstTreeMarker);
            const firstAsset = {
              marker: firstTreeMarker,
              species: datasetRows[(datasetRows.length - 1)].species,
            };
            treeAssetsArray.push(firstAsset);
            // ROW MARKERS
            // CALCULATE LENGTH ITERATIONS - EITHER ADD TO ARRAY COUNTER OR JUST SORT LATER
            for (l = 0; l < systemModelCount; l++) {
              for (k = 0; k < datasetRows.length; k++) {
                // CREATE COORDINATES FOR THE TREE
                const treeMarker = along(rowLine, (l * systemModelLength + datasetRows[k].position), { units: 'meters' });
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
            for (l = 0; l < datasetRows.length; l++) {
              if (datasetRows[l].position < systemModelRowRest) {
                /*
                                                                        treeArray.push(treeRows[treeRowCount].array[j].species);
                                */
                // ADD POINT MARKER FOR REMAINING TREES
                const treeMarker2 = along(rowLine, (systemModelCount * systemModelLength + datasetRows[l].position), { units: 'meters' });
                const asset2 = {
                  marker: treeMarker2,
                  species: datasetRows[l].species,
                };
                treeMarkerArray.push(treeMarker2);
                treeAssetsArray.push(asset2);
              }
            }
          }
        }
      }
      // DO POINT COLLECTION
      const treeCanopyArray = [];
      if (treeAssetsArray.length < 4000) {
        for (i = 0; i < treeAssetsArray.length; i++) {
          // FIND TREE DIMENSIONS
          const diameter = 1;
          const circle1 = circle(treeAssetsArray[i].marker.geometry.coordinates, diameter, { units: 'meters' });
          treeCanopyArray.push(circle1);
        }
      }
      const treeMarkers = turf.featureCollection(treeCanopyArray);
      const treeCollection = JSON.stringify(treeMarkers);
      // GENERATE AREAS
      const alleyPolygonArray = [];
      const bedPolygonArray = [];
      for (j = 0; j < foundParcel.layers.length; j++) {
        for (i = 0; i < foundParcel.layers[j].areas.length; i++) {
          // ROW VIZ
          const areaGeometry = JSON.parse(foundParcel.layers[j].areas[i].geometry);
          if (foundParcel.layers[j].areas[i].name.charAt(0) === 'A') {
            alleyPolygonArray.push(areaGeometry);
          } else if (foundParcel.layers[j].areas[i].name.charAt(0) === 'T') {
            bedPolygonArray.push(areaGeometry);
          } else {
            alleyPolygonArray.push(areaGeometry);
          }
        }
      }
      const bedArrayPolygons = turf.featureCollection(bedPolygonArray);
      const stripsCollection = JSON.stringify(bedArrayPolygons);
      const alleyArrayPolygons = turf.featureCollection(alleyPolygonArray);
      const alleysCollection = JSON.stringify(alleyArrayPolygons);
      res.render('parcels/layout', {
        parcel: foundParcel, collection, places, trees: treeCollection, strips: stripsCollection, alleys: alleysCollection,
      });
    }
  });
});

module.exports = router;

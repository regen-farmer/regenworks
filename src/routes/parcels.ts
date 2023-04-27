import express from 'express';
import {
  centroid,
  helpers as turf,
  length as turfLength,
  circle,
  along,
} from '@turf/turf';
import NodeGeocoder from 'node-geocoder';
import User, { UserDocument } from '../models/user';
import Parcel from '../models/parcel';
import Practice from '../models/practice';
import Layer from '../models/layer';
import middleware from '../middleware'; // Will automatically require the middleware "index" file as the standard
import { ISpeciesSchema } from '../models/species';
import { Auth0IDToken } from '../app';

// NODE GEOCODER CODE

const router = express.Router();

console.log('GEOCODER', process.env.GEOCODER_API_KEY);

const options: NodeGeocoder.Options = {
  provider: 'google',
  apiKey: process.env.GEOCODER_API_KEY,
  formatter: null,
};

const geocoder = NodeGeocoder(options);

// PARCEL INDEX ROUTE
router.get('/parcels', middleware.isLoggedIn, async (req: express.Request & { user?: UserDocument, idToken?: Auth0IDToken }, res: express.Response) => {
  console.log('Get all parcels for user');
  // Get all parcels from DB
  try {
    const allUserParcels = await Parcel.find({ 'owner.id': req.user?._id });
    res.send({ parcels: allUserParcels, currentUser: req.user });
  } catch (err) {
    console.log(err);
  }
});

// PARCEL NEW ROUTE
router.get('/new-parcel', middleware.isLoggedIn, async (req: express.Request & { user?: UserDocument, idToken?: Auth0IDToken }, res: express.Response) => {
  // Find all products in database and pass to ejs
  try {
    const foundPractices = await Practice.find();
    res.send({ practices: foundPractices });
  } catch (err) {
    console.log(err);
  }
});

// PARCEL CREATE ROUTE
router.post('/parcels', middleware.isLoggedIn, async (req: express.Request & { user?: UserDocument, idToken?: Auth0IDToken }, res: express.Response) => {
  // Create variable with new place posted from place form
  const name = req.body.parcel.name;
  const climate = {
    annualaverageprec: req.body.parcel.climate.annualaverageprec,
    hardiness: {
      low: -1,
      high: 16,
    },
  };
  const soilType = req.body.parcel.soilType;
  const agType = req.body.parcel.agType;
  const size = req.body.parcel.size;
  const description = req.body.parcel.description;
  const practices = req.body.practiceids;
  const measurement = req.body.parcel.measurement;
  const owner = {
    id: req.user?._id,
  };
  // CONVERT ADDRESS TO COORDINATES USING GEOCODER
  geocoder.geocode(req.body.parcel.location, async (err, data) => {
    if (err || !data.length) {
      console.log(err);
      console.log(data);
      return res.status(500).send({ error: `Error while geocoding: ${err.toString()}` });
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
      name,
      soilType,
      agType,
      size,
      description,
      location,
      lat,
      lng,
      practices,
      owner,
      climate,
      measurement,
    };
    // Create a new parcel and save it to the database
    try {
      const newlyCreated = await Parcel.create(newParcel);

      console.log(`${newlyCreated} added`);
      // Find user based on ID
      try {
        const foundUser = await User.findById(newlyCreated.owner.id);
        // Add the parcel to the users parcels for referencing
        if (foundUser) {
          foundUser.parcels.push(newlyCreated);
          foundUser.currentProject = newlyCreated;
          await foundUser.save();
          // Save JSON file to geometry
          newlyCreated.geometry = req.body.geometry;
          // Save the layer
          await newlyCreated.save();
          // ADD PRECIPITATION?HARDINESS?
          // req.flash("success", "You have successfully created a new parcel");
          res.send(newlyCreated);
        }
      } catch (err) {
        console.log(err);
      }
    } catch (err) {
      // req.flash("error", "Something went wrong");
      console.log(err);
    }
  });
});

// PARCEL SHOW ROUTE
router.get(
  '/parcels/:id',
  middleware.checkParcelOwnership,
  async (req: express.Request & { user?: UserDocument, idToken?: Auth0IDToken }, res: express.Response) => {
    try {
      const foundParcel = await Parcel.findById(req.params.id)
        .populate('practices')
        .populate('layers')
        .exec();
      if (foundParcel) {
        const geometry = turf.polygon([
          [
            [0, 0],
            [0, 1],
            [1, 0],
            [0, 0],
          ],
        ]);
        const geometryArray: turf.Feature<any, any>[] = [];
        const placesArray: turf.Feature<turf.Point, {
          description: string;
        }>[] = [];
        geometryArray.push(geometry);
        if (foundParcel.layers.length > 0) {
          for (let i = 0; foundParcel.layers.length > i; i++) {
            // GET GEOMETRY
            const polygon = JSON.parse(foundParcel.layers[i].geometry);
            // PUSH TO ARRAY
            const properties = {
              description: foundParcel.layers[i].name,
              id: foundParcel.layers[i]._id.toString(),
            };
            const feature = turf.feature(polygon.geometry, properties);
            geometryArray.push(feature);
            // CREATE PLACE
            const centroidPoint = centroid(polygon.geometry);
            const place = turf.point(
              centroidPoint.geometry.coordinates,
              properties,
            );
            placesArray.push(place);
          }
        }
        // CREATE LABEL COLLECTION
        const placesCollection = turf.featureCollection(placesArray);

        // CREATE FEATURECOLLECTION
        const featurecollection = turf.featureCollection(geometryArray);

        res.send({
          parcel: foundParcel,
          collection: featurecollection,
          places: placesCollection,
        });
      } else {
        console.log('No foundParcel');
      }
    } catch (err) {
      console.log(err);
    }
  },
);

// PARCEL EDIT ROUTE
router.get(
  '/parcels/:id/edit',
  middleware.checkParcelOwnership,
  async (req: express.Request & { user?: UserDocument, idToken?: Auth0IDToken }, res: express.Response) => {
    try {
      // Find specific place in database
      const foundParcel = await Parcel.findById(req.params.id)
        .populate('practices')
        .exec();
      // RENDER EDIT PAGE FOR PARCEL
      res.send(foundParcel);
    } catch (err) {
      console.log(err);
    }
  },
);

// PLACES UPDATE ROUTE
router.put(
  '/parcels/:id',
  middleware.checkParcelOwnership,
  async (req: express.Request & { user?: UserDocument, idToken?: Auth0IDToken }, res: express.Response) => {
    // UPDATE PARCEL
    const parcel = req.body.parcel;
    // CONVERT ADDRESS TO COORDINATES USING GEOCODER
    geocoder.geocode(req.body.parcel.location, async (err, data) => {
      if (err || !data.length) {
        console.log(err);
        console.log(data);
        return res.status(500).send({ error: `Error while geocoding: ${err.toString()}` });
      }
      parcel.lat = data[0].latitude;
      parcel.lng = data[0].longitude;
      parcel.location = data[0].formattedAddress;
      // UPDATE PARCEL
      try {
        const updatedParcel = await Parcel.findByIdAndUpdate(
          req.params.id,
          parcel,
        );
        // console.log(updatedParcel);
        res.send(updatedParcel);
      } catch (err) {
        console.log(err);
      }
    });
  },
);

// PLACES DESTROY ROUTE
router.delete(
  '/parcels/:id',
  middleware.checkParcelOwnership,
  async (req: express.Request & { user?: UserDocument, idToken?: Auth0IDToken }, res: express.Response) => {
    try {
      await Parcel.findByIdAndRemove(req.params.id);
      res.send(`/users/${req.user?.id}`);
    } catch (err) {
      console.log(err);
      res.send(`/users/${req.user?.id}`);
    }
  },
);

// ANALYSIS ROUTE FOR ALL PARCEL LAYERS
router.get(
  '/parcels/:id/analysis',
  middleware.checkParcelOwnership,
  async (req: express.Request & { user?: UserDocument, idToken?: Auth0IDToken }, res: express.Response) => {
    try {
      const foundParcel = await Parcel.findById(req.params.id)
        .populate('layers')
        .exec();
      res.send({ parcel: foundParcel });
    } catch (err) {
      console.log(err);
    }
  },
);

// SUCCESSION ROUTE FOR ALL SYSTEMS IN PARCEL LAYERS
router.get(
  '/parcels/:id/composition',
  middleware.checkParcelOwnership,
  async (req: express.Request & { user?: UserDocument, idToken?: Auth0IDToken }, res: express.Response) => {
    try {
      const foundParcel = await Parcel.findById(req.params.id)
        .populate('layers')
        .exec();
      if (foundParcel) {
        const layerarray: string[] = [];
        foundParcel.layers.forEach((layer) => {
          layerarray.push(layer._id.toString());
        });
        try {
          const foundLayers = await Layer.find({ _id: layerarray })
            .populate('systems.future')
            .exec();
          res.send({
            parcel: foundParcel,
            layers: foundLayers,
          });
        } catch (err) {
          console.log(err);
        }
      } else {
        console.log('No foundParcel');
      }
    } catch (err) {
      console.log(err);
    }
  },
);

// BIGQUERY PARCEL LAT LNG TEST
router.get(
  '/parcels/:id/climate',
  middleware.checkParcelOwnership,
  async (req: express.Request & { user?: UserDocument, idToken?: Auth0IDToken }, res: express.Response) => {
    try {
      const foundParcel = await Parcel.findById(req.params.id);
      if (foundParcel) {
        geocoder.geocode(foundParcel.location, async (err, data) => {
          if (err || !data.length) {
            console.log(err);
            console.log(data);
            return res.status(500).send({ error: `Error while geocoding: ${err.toString()}` });
          }
          console.log(data[0].country);
          console.log(data[0].administrativeLevels?.level1long);
          console.log(data[0].city);
          try {
            const countrydata = await fetch(
              `https://restcountries.eu/rest/v2/name/${
                data[0].country
              }?fullText=true&fields=alpha3Code`,
            );

            console.log('statusCode:', countrydata.status);
            const alphacountry = JSON.parse(await countrydata.json());
            console.log(alphacountry[0].alpha3Code);
            try {
              const climatedata = await fetch(
                `http://climatedataapi.worldbank.org/climateweb/rest/v1/country/annualavg/pr/1980/1999/${
                  alphacountry[0].alpha3Code}`,
              );
              console.log('statusCode:', climatedata.status);
              const weather = JSON.parse(await climatedata.json());
              console.log(weather[0].annualData[0]);
              res.send();
            } catch (err) {
              console.log('error:', err);
            }
          } catch (err) {
            console.log('error:', err);
          }
        });
      }
    } catch (err) {
      console.log(err);
    }
  },
);

// PARCEL
router.get(
  '/parcels/:id/layout',
  middleware.isLoggedIn,
  async (req: express.Request & { user?: UserDocument, idToken?: Auth0IDToken }, res: express.Response) => {
    // FIND PARCEL
    try {
      const foundParcel = await Parcel.findById(req.params.id)
        .populate({ path: 'layers', populate: { path: 'areas' } })
        .populate({
          path: 'layers',
          populate: { path: 'rows', populate: { path: 'sequence' } },
        })
        .exec();
      if (foundParcel) {
        const geometry = turf.polygon([
          [
            [0, 0],
            [0, 1],
            [1, 0],
            [0, 0],
          ],
        ]);

        const geometryArray: (turf.Feature<any, { description: string; }> |
          turf.Feature<turf.Polygon, turf.Properties>)[] = [];

        const placesArray: turf.Feature<turf.Point, { description: string; }>[] = [];

        geometryArray.push(geometry);
        if (foundParcel.layers.length > 0) {
          for (let i = 0; foundParcel.layers.length > i; i++) {
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
            const place = turf.point(
              centroidPoint.geometry.coordinates,
              properties,
            );
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
        const treeAssetsArray: {
          marker: turf.Feature<turf.Point, turf.Properties>;
          species: ISpeciesSchema;
        }[] = [];
        const treeMarkerArray: turf.Feature<turf.Point, turf.Properties>[] = [];

        // CYCLE THROUGH EACH LAYER
        for (let j = 0; j < foundParcel.layers.length; j++) {
          // CYCLE THROUGH EACH ROW OF EACH LAYER
          for (let i = 0; i < foundParcel.layers[j].rows.length; i++) {
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
              datasetRows.sort((a, b) => {
                if (a.position < b.position) {
                  return -1;
                }
                if (a.position > b.position) {
                  return 1;
                }
                return 0;
              });
              // ROW LENGTH
              const rowLine = JSON.parse(foundParcel.layers[j].rows[i].geometry);
              const rowLength = turfLength(rowLine, { units: 'meters' });
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
              for (let l = 0; l < systemModelCount; l++) {
                for (let k = 0; k < datasetRows.length; k++) {
                  // CREATE COORDINATES FOR THE TREE
                  const treeMarker = along(
                    rowLine,
                    l * systemModelLength + datasetRows[k].position,
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
              for (let l = 0; l < datasetRows.length; l++) {
                if (datasetRows[l].position < systemModelRowRest) {
                  /*
                                                                      treeArray.push(treeRows[treeRowCount].array[j].species);
                              */
                  // ADD POINT MARKER FOR REMAINING TREES
                  const treeMarker2 = along(
                    rowLine,
                    systemModelCount * systemModelLength
                      + datasetRows[l].position,
                    { units: 'meters' },
                  );
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
        const treeCanopyArray: turf.Feature<turf.Polygon, turf.Properties>[] = [];
        if (treeAssetsArray.length < 4000) {
          for (let i = 0; i < treeAssetsArray.length; i++) {
            // FIND TREE DIMENSIONS
            const diameter = 1;
            const circle1 = circle(
              treeAssetsArray[i].marker.geometry.coordinates,
              diameter,
              { units: 'meters' },
            );
            treeCanopyArray.push(circle1);
          }
        }
        const treeMarkers = turf.featureCollection(treeCanopyArray);
        const treeCollection = JSON.stringify(treeMarkers);
        // GENERATE AREAS
        const alleyPolygonArray: turf.Feature<turf.Polygon, {
          name: string;
        }>[] = [];
        const bedPolygonArray: turf.Feature<turf.Polygon, {
          name: string;
        }>[] = [];
        for (let j = 0; j < foundParcel.layers.length; j++) {
          for (let i = 0; i < foundParcel.layers[j].areas.length; i++) {
            // ROW VIZ
            const areaGeometry = JSON.parse(
              foundParcel.layers[j].areas[i].geometry,
            );
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
        res.send({
          parcel: foundParcel,
          collection,
          places,
          trees: treeCollection,
          strips: stripsCollection,
          alleys: alleysCollection,
        });
      } else {
        console.log('No foundParcel');
      }
    } catch (err) {
      console.log(err);
    }
  },
);

export default router;

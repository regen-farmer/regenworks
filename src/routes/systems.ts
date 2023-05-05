import express from 'express';
import unique from 'array-unique';
import System, { ISystemSchema } from '../models/system';
import Layer from '../models/layer';
import Species, { ISpeciesSchema } from '../models/species';
import Parcel from '../models/parcel';
import Animal from '../models/animal';
import Project from '../models/project';
import middleware from '../middleware';
import { UserDocument } from '../models/user';
import { Auth0IDToken } from '../app';

const router = express.Router();

// SYSTEM INDEX
router.get('/systems', middleware.adminIsLoggedIn, async (req: express.Request & { user?: UserDocument, idToken?: Auth0IDToken }, res: express.Response) => {
  try {
    const foundSystems = await System.find();
    res.send({ systems: foundSystems });
  } catch (err) {
    console.log(err);
  }
});

router.put('/parcels/:parcelId/layers/:layerId/projects/:projectId/systems/:systemId/pick', middleware.isLoggedIn, async (req: express.Request & { user?: UserDocument, idToken?: Auth0IDToken }, res: express.Response) => {
  const foundProject = await Project.findById(req.params.projectId);

  // FIND SYSTEM AND ADD TO PROJECT
  const foundSystem = await System.findById(req.params.systemId)
    .populate('model.species')
    .exec();

  if (foundProject && foundSystem) {
    // CREATE CURRENCY
    // ADD PROJECT STUFF
    foundProject.system = foundSystem;

    try {
      // Save the project
      await foundProject.save();
      res.send(foundProject);
    } catch (err) {
      console.log(err);
    }
  }
});

// NESTED AREA SYSTEM INDEX
/* router.get("/layers/:id/systems", middleware.isLoggedIn, function(req: express.Request & { user?: UserDocument, idToken?: Auth0IDToken }, res: express.Response){
    // FIND LAYER ID
    Layer.findById(req.params.id).populate("systems.future").populate("systems.present").populate("systems.past").exec(function(err, foundLayer){
        if(err) {
            console.log(err);
        } else {
            res.send("systems/index", {layer: foundLayer});
        }
    });
}); */

// NEW AREA SYSTEM GRID NEW ROUTE
router.get(
  '/layers/:id/systems/newgrid',
  middleware.isLoggedIn,
  async (req: express.Request & { user?: UserDocument, idToken?: Auth0IDToken }, res: express.Response) => {
    // FIND LAYER
    try {
      const foundLayer = await Layer.findById(req.params.id);

      res.send({ layer: foundLayer });
    } catch (err) {
      console.log(err);
    }
  },
);

// NEW AREA SYSTEM GRID REDIRECT ROUTE
router.post(
  '/layers/:id/systems/newgrid',
  middleware.isLoggedIn,
  async (req: express.Request & { user?: UserDocument, idToken?: Auth0IDToken }, res: express.Response) => {
    // CHECK LENGTH IS DIVISIBLE
    if ((req.body.length / req.body.distance) % 1 === 0) {
      // FIND LAYER
      try {
        const foundLayer = await Layer.findById(req.params.id);
        res.send(
          `/layers/${foundLayer?._id
          }/systems/new?rows=${req.body.rows
          }&distance=${req.body.distance
          }&length=${req.body.length}`,
        );
      } catch (err) {
        console.log(err);
      }
    } else {
      console.log(
        'Length must be divisible with distance between speciee in rows.',
      );
      res.status(400).send({ error: 'Length must be divisible with distance between speciee in rows.' });
    }
  },
);

// NESTED AREA SYSTEM NEW ROUTE
router.get(
  '/layers/:id/systems/new',
  middleware.isLoggedIn,
  async (req: express.Request & { user?: UserDocument, idToken?: Auth0IDToken }, res: express.Response) => {
    // FIND LAYER ID
    try {
      const foundLayer = await Layer.findById(req.params.id);
      // FIND ALL SPECIES IN THE DATABASE
      try {
        const foundSpecies = await Species.find();
        // SORT SPECIES
        foundSpecies.sort((a, b) => {
          if (a.nameCommon < b.nameCommon) {
            return -1;
          }
          if (a.nameCommon > b.nameCommon) {
            return 1;
          }
          return 0;
        });
        // FIND ALL ANIMALS AND SORT
        try {
          const foundAnimals = await Animal.find();
          // SORT ANIMALS
          foundAnimals.sort((a, b) => {
            if (a.name < b.name) {
              return -1;
            }
            if (a.name > b.name) {
              return 1;
            }
            return 0;
          });
          // RENDER NEW SYSTEM PAGE WITH SPECIES
          res.send({
            layer: foundLayer,
            species: foundSpecies,
            animals: foundAnimals,
            rows: req.query.rows,
            distance: req.query.distance,
            length: req.query.length,
          });
        } catch (err) {
          console.log(err);
        }
      } catch (err) {
        console.log(err);
      }
    } catch (err) {
      console.log(err);
    }
  },
);

// NESTED AREA SYSTEM CREATE ROUTE
router.post(
  '/layers/:id/systems',
  middleware.isLoggedIn,
  async (req: express.Request & { user?: UserDocument, idToken?: Auth0IDToken }, res: express.Response) => {
    try {
      const foundLayer = await Layer.findById(req.params.id);
      if (foundLayer) {
        const system = req.body.system;

        console.log('system received', JSON.stringify(system));

        const model: {
          species: any;
          position: number[];
          width: number;
        }[] = [];

        // SPECIES ARRAY FOR UNIQUE SPECIES
        const allSpecies: string[] = [];
        // ADD SPECIES TO MODEL
        console.log('system.model.length: ', system.model.length);
        for (let i = 0; i < system.model.length; i++) {
          // FIX IF ONLY ONE ITEM IN ROW

          if (system.model[i].species instanceof Array) {
            for (let j = 0; j < system.model[i].species.length; j++) {
              // IF SPECIES ID IS NULL
              if (!(system.model[i].species[j].id === '')) {
                // ADD SPECIES ID TO SPECIES ARRAY
                allSpecies.push(system.model[i].species[j].id);
                const species = {
                  species: system.model[i].species[j].id,
                  position: [
                    i,
                    Number(system.model[i].species[j].y),
                  ],
                  width: Number(system.model[i].width),
                };
                model.push(species);
              }
            }
          }
        }
        // FIND UNIQUE SPECIES / REMOVE DUPLICATES
        console.log(`Unique species:${allSpecies}`);

        system.uniqueSpecies = [...new Set(allSpecies)].map((species) => ({
          id: species,
          activities: [],
        }));

        // RE-ROUTE
        if (model.length < 1) {
          // REDIRECT IF NO SPECIES
          return;
        }
        console.log(`Model length:${model.length}`);
        system.model = model;
        // REMOVE ANIMAL ITEMS IF NONE
        for (let i = system.animals.length - 1; i >= 0; i--) {
          if (system.animals[i] === '') {
            system.animals.splice(i, 1);
          }
        }
        // SET BOOLEAN
        if (req.body.system.shared) {
          system.shared = true;
        }
        // CREATE SYSTEM
        try {
          const createdSystem = await System.create(system);
          console.log(createdSystem);
          // ADD OWNER
          createdSystem.owner.id = req.user?._id.toString()!;
          await createdSystem.save();
          // IF LAYER IS AGROFORESTRY AND NO PRESENT, PUSH TO CURRENT
          if (
            foundLayer.type === 'agroforestry'
            && foundLayer.systems.present === undefined
          ) {
            foundLayer.systems.present = createdSystem;
          } else {
            // Push system to layer future if layer type is not agroforestry
            foundLayer.systems.future.push(createdSystem);
          }
          await foundLayer.save();
          console.log('success');
          res.send();
        } catch (err) {
          console.log(err);
        }
      }
    } catch (err) {
      console.log(err);
    }
  },
);

// LAYER FUTURE SYSTEMS COMPARE ROUTE
router.get(
  '/layers/:id/systems/compare',
  middleware.isLoggedIn,
  async (req: express.Request & { user?: UserDocument, idToken?: Auth0IDToken }, res: express.Response) => {
    // FIND LAYER
    const foundLayer = await Layer.findById(req.params.id)
      .populate('systems.future')
      .exec();
    if (foundLayer) {
      // FIND FUTURE SYSTEM TO POPULATE ROWS ETC
      const foundSystems = await System.find({ _id: foundLayer.systems.future })
        .populate('flows')
        .populate('model.species')
        .exec();
      if (foundSystems) {
        for (let i = 0; i < foundSystems.length; i++) {
          // FIND ALL SPECIES IN SYSTEM
          const allSpecies: string[] = [];
          const allUtilities: string[] = [];
          const dataset: {
            row: number, array: {
              species: ISpeciesSchema;
              position: number[];
              width: number;
            }[]
          }[] = [];
          const nutritional: {
            fat: number;
            carb: number;
            protein: number;
          }[] = [];
          foundSystems[i].model.forEach((species) => {
            // PUSH SPECIES TO ARRAY
            allSpecies.push(species.species.nameCommon);
            // FIND SPECIES UTILITIES
            if (species.species.utilities.length > 0) {
              for (let j = 0; j < species.species.utilities.length; j++) {
                allUtilities.push(species.species.utilities[j]);
              }
            }
            // ADD SPECIES NUTRITIONAL VALUE TO ARRAY
            nutritional.push(species.species.nutrients);
            // ADD SPECIES TO ROWS
            let count = 0;
            for (let j = 0; j < dataset.length; j++) {
              if (dataset[j].row === species.position[0]) {
                dataset[j].array.push(species);
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
          /* // AVERAGE NUTRITIONAL VALUE
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
                        nutrientvalue.fat = nutrientvalue.fat / nutritional.length; */
          // SORT FIRST ROW ITEMS

          let grid = 0;
          for (let j = 0; j < dataset.length; j++) {
            dataset[j].array.sort((a, b) => {
              if (a.position[1] < b.position[1]) {
                return -1;
              }
              if (a.position[1] > b.position[1]) {
                return 1;
              }
              return 0;
            });
            grid += dataset[j].array[0].width;
          }
          // FIND UNIQUE SPECIES / REMOVE DUPLICATES
          const uniqueUtilities = unique(allUtilities);
          foundSystems[i].uniqueUtilities = uniqueUtilities;
          foundSystems[i].grid = grid;
          // @ts-ignore
          foundSystems[i].sortedrows = dataset;
          // @ts-ignore
          foundSystems[i].nutritional = nutritional[0];
        }
        res.send({
          layer: foundLayer,
          systems: foundSystems,
        });
      }
    }
  },
);

// SYSTEM SHOW ROUTE
router.get('/systems/:id', middleware.isLoggedIn, async (req: express.Request & { user?: UserDocument, idToken?: Auth0IDToken }, res: express.Response) => {
  const foundSystem = await System.findById(req.params.id)
    .populate('model.species')
    .populate('animals')
    .exec();
  if (foundSystem) {
    // FIND ALL SPECIES IN SYSTEM
    const allSpecies: ISpeciesSchema[] = [];
    const dataset: {
      row: number, array: {
        species: ISpeciesSchema;
        position: number[];
        width: number;
      }[]
    }[] = [];
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
    console.log(`Unique species:${foundSystem.uniqueSpecies}`);
    // SORT FIRST ROW ITEM

    let systemwidth = 0;
    let systemlength = 0;
    for (let i = 0; i < dataset.length; i++) {
      dataset[i].array.sort((a, b) => {
        if (a.position[1] < b.position[1]) {
          return -1;
        }
        if (a.position[1] > b.position[1]) {
          return 1;
        }
        return 0;
      });
      console.log(dataset[i].array[0]);
      systemwidth += dataset[i].array[0].width;
      if (
        dataset[i].array[dataset[i].array.length - 1].position[1] > systemlength
      ) {
        systemlength = dataset[i].array[dataset[i].array.length - 1].position[1];
      }
    }
    // FIND SPECIES AND POPULATE FLOWS
    try {
      const foundSpecies = await Species.find({ _id: uniqueSpecies })
        .populate('flows')
        .exec();

      res.send({
        system: foundSystem,
        species: foundSpecies,
        rows: dataset,
        systemwidth,
        systemlength,
      });
    } catch (err) {
      console.log(err);
    }
  }
});

// SYSTEM EDIT ROUTE
router.get(
  '/systems/:id/edit',
  middleware.isLoggedIn,
  async (req: express.Request & { user?: UserDocument, idToken?: Auth0IDToken }, res: express.Response) => {
    const foundSystem = await System.findById(req.params.id)
      .populate('model.species')
      .populate('animals')
      .exec();
    if (foundSystem) {
      const foundSpecies = await Species.find();
      if (foundSpecies) {
        // SORT SPECIES
        foundSpecies.sort((a, b) => {
          if (a.nameCommon < b.nameCommon) {
            return -1;
          }
          if (a.nameCommon > b.nameCommon) {
            return 1;
          }
          return 0;
        });
        // FIND ALL ANIMALS AND SORT
        const foundAnimals = await Animal.find();
        if (foundAnimals) {
          // SORT SPECIES
          foundAnimals.sort((a, b) => {
            if (a.name < b.name) {
              return -1;
            }
            if (a.name > b.name) {
              return 1;
            }
            return 0;
          });
          // FIND ROWS IN SYSTEM
          const allSpecies: ISpeciesSchema[] = [];
          const dataset: {
            row: number, array: {
              species: ISpeciesSchema;
              position: number[];
              width: number;
            }[]
          }[] = [];
          const distanceArray: number[] = [];
          foundSystem.model.forEach((species) => {
            allSpecies.push(species.species);
            distanceArray.push(species.position[1]);
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
          // FIND UNIQUE SPECIES / REMOVE DUPLICATES
          // const uniqueSpecies = unique(allSpecies);
          // SORT FIRST ROW ITEMS

          for (let i = 0; i < dataset.length; i++) {
            dataset[i].array.sort((a, b) => {
              if (a.position[1] < b.position[1]) {
                return -1;
              }
              if (a.position[1] > b.position[1]) {
                return 1;
              }
              return 0;
            });
            console.log(dataset[i].array[0]);
          }
          const rows = dataset;
          // CALCULATE DISTANCE
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
          console.log(distanceArray[distanceArray.length - 1]);
          // SET LENGTH TO HIGHEST Y COORDINATE
          const length = distanceArray[distanceArray.length - 1];
          // FIND DISTANCE Y MIN
          distanceDifference.sort(compare3);
          let distance = 0;
          if (
            distanceDifference[0] > distanceArray[0]
            || distanceDifference.length === 0
          ) {
            distance = distanceArray[0];
          } else {
            distance = distanceDifference[0];
          }
          console.log(distance);
          if (req.query.distance && typeof req.query.distance === 'string') {
            console.log('Distance query');
            distance /= parseInt(req.query.distance, 10);
          }
          // JUST SET NEW VARIABLE TO CONTROL NEW ROW
          let newRow = -1;
          if (req.query.row && typeof req.query.row === 'string') {
            console.log(`Row query ${req.query.row}`);
            newRow = parseInt(req.query.row, 10);
            console.log(typeof newRow);
          }
          // CHECK IF DISTANCE IS DIVISIBLE BY LENGTH?! THROW ERROR IF IT'S FOR SOME REASON NOT?
          res.send({
            system: foundSystem,
            species: foundSpecies,
            animals: foundAnimals,
            rows,
            distance,
            length,
            newrow: newRow,
          });
        }
      }
    }
  },
);

// SYSTEM EDIT ROUTE OLD
router.get('/systems/:id/editold', middleware.isLoggedIn, async (req: express.Request & { user?: UserDocument, idToken?: Auth0IDToken }, res: express.Response) => {
  try {
    const foundSystem = await System.findById(req.params.id)
      .populate('rows.sequense')
      .populate('animals')
      .exec();

    try {
      const foundSpecies = await Species.find();
      // SORT SPECIES

      foundSpecies.sort((a, b) => {
        if (a.nameCommon < b.nameCommon) {
          return -1;
        }
        if (a.nameCommon > b.nameCommon) {
          return 1;
        }
        return 0;
      });
      // FIND ALL ANIMALS AND SORT
      try {
        const foundAnimals = await Animal.find();
        // SORT SPECIES
        foundAnimals.sort((a, b) => {
          if (a.name < b.name) {
            return -1;
          }
          if (a.name > b.name) {
            return 1;
          }
          return 0;
        });
        res.send({
          system: foundSystem,
          species: foundSpecies,
          animals: foundAnimals,
        });
      } catch (err) {
        console.log(err);
      }
    } catch (err) {
      console.log(err);
    }
  } catch (err) {
    console.log(err);
  }
});

// SYSTEM EDIT W. SPECIES ROUTE
router.get(
  '/systems/:id/edit/:speciesid',
  middleware.isLoggedIn,
  async (req: express.Request & { user?: UserDocument, idToken?: Auth0IDToken }, res: express.Response) => {
    const foundSystem = await System.findById(req.params.id)
      .populate('model.species')
      .populate('animals')
      .exec();
    if (foundSystem) {
      // FIND ALL SPECIES IN SYSTEM
      const allSpecies: string[] = [];
      const dataset: {
        row: number, array: {
          species: ISpeciesSchema;
          position: number[];
          width: number;
        }[]
      }[] = [];
      const distanceArray: number[] = [];
      foundSystem.model.forEach((species) => {
        allSpecies.push(species.species.id);
        distanceArray.push(species.position[1]);
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
      // PUSH NEW SPECIES TO LIST
      allSpecies.push(req.params.speciesid);
      // FIND UNIQUE SPECIES / REMOVE DUPLICATES
      const uniqueSpecies = unique(allSpecies);
      // FIND ALL SPECIES IN SYSTEM
      const foundSpecies = await Species.find({ _id: uniqueSpecies });
      if (foundSpecies) {
        // SORT FIRST ROW ITEMS

        // SORT ROWS
        for (let i = 0; i < dataset.length; i++) {
          dataset[i].array.sort((a, b) => {
            if (a.position[1] < b.position[1]) {
              return -1;
            }
            if (a.position[1] > b.position[1]) {
              return 1;
            }
            return 0;
          });
          console.log(dataset[i].array[0]);
        }
        const rows = dataset;
        // CALCULATE DISTANCE
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
        console.log(distanceArray[distanceArray.length - 1]);
        // SET LENGTH TO HIGHEST Y COORDINATE
        const length = distanceArray[distanceArray.length - 1];
        // FIND DISTANCE Y MIN
        distanceDifference.sort(compare3);
        let distance = 0;
        if (
          distanceDifference[0] > distanceArray[0]
          || distanceDifference.length === 0
        ) {
          distance = distanceArray[0];
        } else {
          distance = distanceDifference[0];
        }
        // NEWROW
        let newRow = -1;
        if (req.query.row && typeof req.query.row === 'string') {
          console.log(`Row query ${req.query.row}`);
          newRow = parseInt(req.query.row, 10);
          console.log(typeof newRow);
        }
        res.send({
          system: foundSystem,
          species: foundSpecies,
          animals: foundSystem.animals,
          rows,
          distance,
          length,
          newrow: newRow,
        });
      }
    }
  },
);

// SYSTEM UPDATE ROUTE
router.put('/systems/:id', middleware.isLoggedIn, async (req: express.Request & { user?: UserDocument, idToken?: Auth0IDToken }, res: express.Response) => {
  // NEED TO CHECK OWNERSHIP HERE!!! YES
  try {
    const foundSystem = await System.findById(req.params.id);

    if (foundSystem) {
      // CLEAN SYSTEM - MAKE MIDDLEWARE FOR THIS
      // GET SYSTEM
      const system = req.body.system;
      // SET BOOLEAN
      if (req.body.system.shared) {
        system.shared = true;
      }
      // NEW GRID MODEL SETUP
      const model: {
        species: any;
        position: number[];
        width: number;
      }[] = [];

      // SPECIES ARRAY FOR UNIQUE SPECIES
      const allSpecies: string[] = [];
      // ADD SPECIES TO MODEL
      for (let i = 0; i < system.model.length; i++) {
        // FIX IF ONLY ONE ITEM IN ROW
        if (system.model[i].species.id instanceof Array) {
          for (let j = 0; j < system.model[i].species.length; j++) {
            // IF SPECIES ID IS NULL
            if (!(system.model[i].species[j].id === '')) {
              // ADD SPECIES TO UNIQUE SPECIES ARRAY
              allSpecies.push(system.model[i].species[j].id);
              const species = {
                species: system.model[i].species[j].id,
                position: [
                  i,
                  Number(system.model[i].species[j].y),
                ],
                width: Number(system.model[i].width),
              };
              model.push(species);
            }
          }
        } else {
          // ADD SPECIES TO UNIQUE SPECIES ARRAY
          allSpecies.push(system.model[i].species.id);
          // FIX IF ONLY ONE ITEM IN ROW
          const species = {
            species: system.model[i].species.id,
            position: [
              i,
              Number(system.model[i].species.y),
            ],
            width: Number(system.model[i].width),
          };
          model.push(species);
        }
      }
      console.log(model);
      system.model = model;
      // FIND UNIQUE SPECIES / REMOVE DUPLICATES
      system.uniqueSpecies = [...new Set(allSpecies)].map((species) => ({
        id: species,
        activities: [],
      }));

      console.log('US', system.uniqueSpecies);
      // REMOVE ANIMAL ITEMS IF NONE
      for (let i = system.animals.length - 1; i >= 0; i--) {
        if (system.animals[i] === '') {
          system.animals.splice(i, 1);
        }
      }
      if (foundSystem.owner.id === req.user?._id.toString()) {
        // if true, update existing system

        console.log('OWNER');
        try {
          const updatedSystem = await System.findByIdAndUpdate(
            req.params.id,
            system,
          );
          if (updatedSystem) {
            res.send({
              updatedSystem,
            });
          } else {
            console.log('No updatedSystem');
          }
        } catch (err) {
          console.log(err);
        }
      } else {
        console.log('NOT OWNER');

        // if false, create a new system and add current user as owner
        const createdSystem = await System.create(system);

        // Add owner
        createdSystem.owner.id = req.user?._id.toString()!;
        createdSystem.shared = false;
        await createdSystem.save();
        // REPLACE IN PRESENT
        try {
          const foundLayersPresent = await Layer.find({
            'owner.id': req.user?._id,
            'systems.present': foundSystem._id,
          });
          console.log(`${foundLayersPresent.length} present found`);
          if (foundLayersPresent.length > 0) {
            foundLayersPresent.forEach(async (layer) => {
              // REPLACE SYSTEM
              layer.systems.present = createdSystem;
              // NO NEED TO PUSH TO PAST IN THIS CASE
              await layer.save();
            });
          }
        } catch (err) {
          console.log(err);
        }

        // IMPORTANT TO CHECK FOR USER!!! LIKE CHECKING OWNERSHIP
        // REPLACE IN FUTURE DRAFT
        try {
          const foundLayersFuture = await Layer.find({
            'owner.id': req.user?._id,
            'systems.future': foundSystem._id,
          });
          console.log(`${foundLayersFuture.length} future drafts found`);
          if (foundLayersFuture.length > 0) {
            foundLayersFuture.forEach(async (layer) => {
              // REMOVE ORIGINAL SYSTEM
              layer.systems.future.forEach(async (futureSystem) => {
                if (futureSystem._id === foundSystem._id) {
                  await futureSystem.deleteOne();
                }
              });
              // ADD NEW SYSTEM
              layer.systems.future.push(createdSystem);
              await layer.save();
            });
          }
        } catch (err) {
          console.log(err);
        }

        // REPLACE IN PROJECT
        try {
          const foundProjects = await Project.find({
            'owner.id': req.user?._id,
            system: foundSystem._id,
          });
          console.log(`${foundProjects.length} projects found`);
          if (foundProjects.length > 0) {
            foundProjects.forEach(async (project) => {
              // REPLACE SYSTEM
              project.system = createdSystem;
              await project.save();
            });
          }
        } catch (err) {
          console.log(err);
        }
        // Redirect to system page

        res.send({ createdSystem });
      }
    }
  } catch (err) {
    console.log(err);
  }
});

// SYSTEM DELETE ROUTE
router.delete(
  '/layers/:id/systems/:pid',
  middleware.isLoggedIn,
  async (req: express.Request & { user?: UserDocument, idToken?: Auth0IDToken }, res: express.Response) => {
    // FIND SYSTEM - ONLY POSSIBLE TO GET TO THIS ROUTE IF YOUR ARE THE OWNER BCS VIEW HAS IF OWNER STATEMENT
    try {
      const foundSystem = await System.findById(req.params.pid);
      // CHECK FOR SYSTEM IN LAYER PRESENT. IF THERE, BACK.
      if (foundSystem) {
        try {
          const foundLayersPresent = await Layer.find(
            { 'owner.id': req.user?._id, 'systems.present': foundSystem._id },
          );
          console.log(`${foundLayersPresent.length} present found`);
          if (foundLayersPresent.length > 0) {
            // SEND BACK IF LAYERS
            res.status(500).send({ error: 'Can\'t delete system because layers exist' });
          } else {
            // CHECK FOR SYSTEM IN PROJECT. IF THERE, BACK.
            try {
              const foundProjects = await Project.find(
                { 'owner.id': req.user?._id, system: foundSystem._id },
              );
              console.log(`${foundProjects.length} projects found`);
              if (foundProjects.length > 0) {
                // SEND BACK IF PROJECTS
                res.status(500).send({ error: 'Can\'t delete system because projects exist' });
              } else {
                // CHECK EDGE SYSTEM!?
                // DELETE IN FUTURE DRAFT
                try {
                  const foundLayersFuture = await Layer.find(
                    {
                      'owner.id': req.user?._id,
                      'systems.future': foundSystem._id,
                    },
                  );
                  console.log(
                    `${foundLayersFuture.length
                    } future drafts found`,
                  );
                  if (foundLayersFuture.length > 0) {
                    foundLayersFuture.forEach(async (layer) => {
                      // REMOVE ORIGINAL SYSTEM
                      layer.systems.future.forEach(async (futureSystem) => {
                        if (futureSystem._id === foundSystem._id) {
                          await futureSystem.deleteOne();
                        }
                      });
                      // ADD NEW SYSTEM
                      await layer.save();
                    });
                  }
                  // DELETE SYSTEM NOW
                  try {
                    await System.findByIdAndRemove(req.params.pid);
                  } catch (err) {
                    console.log(err);
                  }
                } catch (err) {
                  console.log(err);
                }
              }
            } catch (err) {
              console.log(err);
            }
          }
        } catch (err) {
          console.log(err);
        }
      }
    } catch (err) {
      console.log(err);
    }
  },
);

// SYSTEM SUCCESSION ROUTE
router.get(
  '/systems/:id/succession',
  middleware.isLoggedIn,
  async (req: express.Request & { user?: UserDocument, idToken?: Auth0IDToken }, res: express.Response) => {
    try {
      const foundSystem = await System.findById(req.params.id)
        .populate('rows')
        .exec();
      res.send({ system: foundSystem });
    } catch (err) {
      console.log(err);
    }
  },
);

// SYSTEM COMPOSITION ROUTE
router.get(
  '/systems/:id/composition',
  middleware.isLoggedIn,
  async (req: express.Request & { user?: UserDocument, idToken?: Auth0IDToken }, res: express.Response) => {
    const foundSystem = await System.findById(req.params.id)
      .populate('model.species')
      .exec();
    if (foundSystem) {
      // FIND ALL SPECIES IN SYSTEM
      const allSpecies: ISpeciesSchema[] = [];
      foundSystem.model.forEach((species) => {
        allSpecies.push(species.species);
      });
      // FIND UNIQUE SPECIES / REMOVE DUPLICATES
      const uniqueSpecies = unique(allSpecies);
      // FIND SPECIES AND POPULATE FLOWS
      try {
        const foundSpecies = await Species.find({ _id: uniqueSpecies })
          .populate('flows')
          .exec();

        try {
          const foundParcel = await Parcel.findById(req.user?.currentProject);

          if (foundParcel && foundSystem) {
            try {
              const foundSuitableSpecies = await Species.find(
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
              );

              console.log(foundSuitableSpecies);
              res.send({
                system: foundSystem,
                species: foundSpecies,
                suitablespecies: foundSuitableSpecies,
              });
            } catch (err) {
              console.log(err);
            }
          }
        } catch (err) {
          console.log(err);
        }
      } catch (err) {
        console.log(err);
      }
    }
  },
);

// SYSTEM ASSESSMENT ROUTE
router.get(
  '/layers/:id/analysis',
  middleware.isLoggedIn,
  async (req: express.Request & { user?: UserDocument, idToken?: Auth0IDToken }, res: express.Response) => {
    const foundSystems = await System.find()
      .populate('model.species')
      .populate('flows')
      .populate('animals')
      .exec();
    if (foundSystems) {
      // FIND LAYER
      const foundLayer = await Layer.findById(req.params.id)
        .populate('systems.present')
        .exec();
      if (foundLayer) {
        const foundSystem = await System.findById(foundLayer.systems.present.id)
          .populate('model.species')
          .populate('animals')
          .exec();
        if (foundSystem) {
          const foundParcel = await Parcel.findById(req.user?.currentProject);
          if (foundParcel) {
            // FIND SYSTEMS WITH SAME COMMODITY AS EXISTING SYSTEM (ONLY IF MONOCULTURE?) - COUNT OCCURRENCES?
            // let commodity = '';
            let commodityName = '';
            foundSystem.model.forEach((species) => {
              // CHECK IF ONLY ONE SPECIES (MONOCULTURE)
              if (
                species.species.nameCommon === 'Arabian coffee'
                || species.species.nameCommon === 'Cacao'
                || species.species.nameCommon === 'Cashew'
                || species.species.nameCommon === 'Coconut palm'
                || species.species.nameCommon === 'Scots pine'
              ) {
                // commodity = species.species.id;
                commodityName = species.species.nameCommon;
              }
            });
            console.log(commodityName);
            // CHECK IF SYSTEM HAS ANIMALS
            let animals;
            if (foundSystem.animals.length > 0) {
              animals = foundSystem.animals[0];
            }
            const systems: ISystemSchema[] = [];
            for (let i = 0; i < foundSystems.length; i++) {
              if (
                foundSystems[i].shared === true
                && foundSystems[i].model.length > 0
              ) {
                // FIND ALL SPECIES IN SYSTEM
                const allSpecies: string[] = [];
                const allUtilities: string[] = [];
                let grid = 0;
                const dataset: {
                  array: {
                    species: ISpeciesSchema;
                    position: number[];
                    width: number;
                  }[], row: number
                }[] = [];
                foundSystems[i].model.forEach((species) => {
                  allSpecies.push(species.species.nameCommon);
                  if (species.species.utilities.length > 0) {
                    for (let j = 0; j < species.species.utilities.length; j++) {
                      allUtilities.push(species.species.utilities[j]);
                    }
                  }
                  // CREATE ADD SPECIES ROWS
                  let count = 0;
                  for (let j = 0; j < dataset.length; j++) {
                    if (dataset[j].row === species.position[0]) {
                      dataset[j].array.push(species);
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
                // FIND UNIQUE SPECIES / REMOVE DUPLICATES

                // TODO: 24-Jan 2023 FIX UNIQUE SPECIES

                const uniqueUtilities = unique(allUtilities);
                foundSystems[i].uniqueUtilities = uniqueUtilities;

                // SORT ROW
                for (let j = 0; j < dataset.length; j++) {
                  dataset[j].array.sort((a, b) => {
                    if (a.position[1] < b.position[1]) {
                      return -1;
                    }
                    if (a.position[1] > b.position[1]) {
                      return 1;
                    }
                    return 0;
                  });
                  grid += dataset[j].array[0].width;
                }
                // SAVE ROWS
                // @ts-ignore
                foundSystems[i].sortedrows = dataset;
                // @ts-ignore
                foundSystems[i].grid = grid;
                systems.push(foundSystems[i]);
              }
            }
            // COMMODITY SYSTEMS
            const commoditysystems: ISystemSchema[] = [];
            for (let i = 0; i < systems.length; i++) {
              for (let j = 0; j < systems[i].model.length; j++) {
                if (
                  commodityName === systems[i].model[j].species.nameCommon
                  && !commoditysystems.includes(systems[i])
                ) {
                  commoditysystems.push(systems[i]);
                }
              }
            }
            console.log(`Commodity systems: ${commoditysystems.length}`);
            const systemsclimate: ISystemSchema[] = [];
            for (let i = 0; i < systems.length; i++) {
              let count = 0;
              for (let j = 0; j < systems[i].model.length; j++) {
                if (
                  systems[i].model[j].species.precipitation.min
                  < foundParcel.climate.annualaverageprec
                  && systems[i].model[j].species.precipitation.max
                  > foundParcel.climate.annualaverageprec
                  && systems[i].model[j].species.temperature.min
                  < foundParcel.climate.hardiness.high
                  && systems[i].model[j].species.temperature.max
                  > foundParcel.climate.hardiness.low
                ) {
                  count += 1;
                }
              }
              if (count === systems[i].model.length) {
                systemsclimate.push(systems[i]);
              }
            }
            const animalsystems: ISystemSchema[] = [];
            for (let i = 0; i < systemsclimate.length; i++) {
              if (systemsclimate[i].animals.length > 0 && animals) {
                animalsystems.push(systemsclimate[i]);
                /* if(systemsclimate[i].animals[0].equals(animals)) {
                                            } */
              }
            }
            console.log(`Animal systems: ${animalsystems.length}`);
            const systemsproven: ISystemSchema[] = [];
            for (let i = 0; i < systemsclimate.length; i++) {
              if (systemsclimate[i].flows.length > 0) {
                systemsproven.push(systemsclimate[i]);
              }
            }
            console.log(`Proven systems for this area: ${systemsproven.length}`);
            if (systems.length < 1) {
              res.send(`layers/${foundLayer._id}`);
            } else {
              res.send({
                layer: foundLayer,
                systems,
                systemsproven,
                systemsclimate,
                commoditysystems,
                commodity: commodityName,
                animalsystems,
              });
            }
          }
        }
      }
    }
  },
);

// LAYER MY SYSTEMS FIND
router.get(
  '/layers/:id/mysystems',
  middleware.isLoggedIn,
  async (req: express.Request & { user?: UserDocument, idToken?: Auth0IDToken }, res: express.Response) => {
    try {
      const foundLayer = await Layer.findById(req.params.id);
      try {
        const foundSystems = await System.find({ 'owner.id': req.user?._id })
          .populate('model.species')
          .populate('flows')
          .populate('animals')
          .exec();
        // SORT OUT MONOCULTURE SYSTEMS
        const realSystems: ISystemSchema[] = [];
        for (let i = 0; i < foundSystems.length; i++) {
          const systemNameSplit: string[] = foundSystems[i].name.split(' ');
          if (
            !(
              systemNameSplit[systemNameSplit.length - 1]
              === 'monoculture'
            )
          ) {
            realSystems.push(foundSystems[i]);
          }
        }
        res.send({
          layer: foundLayer,
          systems: realSystems,
        });
      } catch (err) {
        console.log(err);
      }
    } catch (err) {
      console.log(err);
    }
  },
);

// SYSTEM OCCURRENCE NEW ROUTE
router.get(
  '/systems/:id/occurrences/new',
  middleware.isLoggedIn,
  async (req: express.Request & { user?: UserDocument, idToken?: Auth0IDToken }, res: express.Response) => {
    try {
      const foundSystem = await System.findById(req.params.id);
      res.send({ system: foundSystem });
    } catch (err) {
      console.log(err);
    }
  },
);

// SYSTEM OCCURRANCE CREATE ROUTE
router.put(
  '/systems/:id/occurrences',
  middleware.isLoggedIn,
  async (req: express.Request & { user?: UserDocument, idToken?: Auth0IDToken }, res: express.Response) => {
    try {
      const updatedSystem = await System.findByIdAndUpdate(req.params.id, {
        $addToSet: { occurrences: req.body.occurrence },
      });
      if (updatedSystem) {
        console.log(`${req.body.occurrence} has been added to the system`);
        res.send(`/systems/${updatedSystem._id}`);
      } else {
        console.log('No updatedSystem');
      }
    } catch (err) {
      console.log(err);
    }
  },
);

export default router;

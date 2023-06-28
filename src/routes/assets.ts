import express from 'express';
import Asset from '../models/asset.js';
import Layer from '../models/layer.js';
import Project from '../models/project.js';
import Species from '../models/species.js';
import middleware from '../middleware/index.js';
import { UserDocument } from '../models/user.js';
import { Auth0IDToken, Variables } from '../app.js';

import { Hono } from "hono";

// import logger from '../middleware/logger';

export default function indexRoutes(
  router: Hono<
    {
      Variables: Variables;
    },
    {},
    "/"
  >
) {

// ASSET INDEX ROUTE
router.get('/assets', async (c) => {
  await middleware.adminIsLoggedIn(c);
  // Get all assets from DB
  try {
    const allAssets = await Asset.find({ 'owner.id': c.get('user')?._id });
    return c.json({ assets: allAssets });
  } catch (err) {
    console.log(err);
  }
});

// ASSET NEW ROUTE
router.get('/assets/new', async (c) => {
await middleware.isLoggedIn(c);
  try {
    const foundLayers = await Layer.find({ 'owner.id': c.get('user')?._id });
    // console.log("Reached this far");
    // foundLayers.forEach(function(layer){
    //     console.log(layer.id);
    // });
    return c.json({ layers: foundLayers });
  } catch (err) {
    console.log(err);
  }
});

// ASSET CREATE ROUTE
router.post('/assets', async (c) => {
await middleware.isLoggedIn(c);
  // Create a new experience
  try {
    const createdAsset = await Asset.create((await c.req.json()).asset);
    // Add ID to experience
    createdAsset.owner.id = c.get('user')?._id.toString()!;
    // Save the asset - Not needed if created after this step
    await createdAsset.save();
    return c.json('/assets');
  } catch (err) {
    console.log(err);
  }
});

// ASSET SHOW ROUTES
router.get('/assets/:entityid', async (c) => {
await middleware.isLoggedIn(c);
  // Find specific asset
  try {
    const foundAsset = await Asset.findById(c.req.param('entityid'))
      .populate('layer')
      .exec();
    return c.json({ asset: foundAsset });
  } catch (err) {
    console.log(err);
  }
});

// ASSET EDIT ROUTE
router.get(
  '/assets/:entityid/edit',
  async (c) => {
    await middleware.isLoggedIn(c)
    // FIND ASSET AND RENDER EDIT PAGE
    try {
      const foundAsset = await Asset.findById(c.req.param('entityid'))
        .populate('species')
        .exec();
      if (foundAsset) {
        // GET ALL SPECIES!!
        try {
          const foundSpecies = await Species.find();
          console.log(foundAsset.species);
          console.log(foundSpecies[0]);
          return c.json({
            asset: foundAsset,
            species: foundSpecies,
          });
        } catch (err) {
          console.log(err);
        }
      }
    } catch (err) {
      console.log(err);
    }
  },
);

// ASSET UPDATE ROUTE
router.put('/assets/:entityid', async (c) => {
await middleware.isLoggedIn(c);
  // UPDATE ASSET
  try {
    const updatedAsset = await Asset.findByIdAndUpdate(
      c.req.param('entityid'),
      (await c.req.json()).asset,
    );
    if (updatedAsset) {
      return c.json(`/assets/${updatedAsset._id}`);
    } else {
      console.log('Asset not updated');
    }
  } catch (err) {
    console.log(err);
  }
});

// ASSET DELETE ROUTE
router.delete('/assets/:entityid', async (c) => {
await middleware.isLoggedIn(c);
  // MAKE ACTIVITY OWNERSHIP MIDDLEWARE
  // FIND ASSET
  try {
    const foundAsset = await Asset.findById(c.req.param('entityid'));
    console.log(foundAsset);
    // REMOVE ASSET FROM PROJECT
    if (foundAsset) {
      try {
        const foundProject = await Project.findOne({ assets: foundAsset._id });
        if (foundProject) {
          try {
            await Project.findByIdAndUpdate(
              foundProject._id,
              { $pull: { assets: foundAsset._id } },
            );

            // DELETE ASSET
            try {
              await Asset.findByIdAndRemove(c.req.param('entityid'));
              return c.json(`/projects/${foundProject._id}`);
            } catch (err) {
              console.log(err);
              return c.json('/assets');
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
});

// AREA ASSET NEW ROUTE
router.get(
  '/layers/:entityid/assets/new',
  async (c) => {
    await middleware.isLoggedIn(c)
    try {
      const foundLayer = await Layer.findById(c.req.param('entityid'));
      return c.json({ layer: foundLayer });
    } catch (err) {
      console.log(err);
    }
  },
);

// AREA ASSET CREATE ROUTE
router.post(
  '/layers/:entityid/assets',
  async (c) => {
    await middleware.isLoggedIn(c)
    try {
      const foundLayer = await Layer.findById(c.req.param('entityid'));
      if (foundLayer) {
        const createdAsset = await Asset.create((await c.req.json()).asset);

        // Add user ID to experience
        createdAsset.owner.id = c.get('user')?._id.toString()!;
        await createdAsset.save();
        // ADD ASSET TO LAYER
        foundLayer.assets.push(createdAsset);
        // REDIRECT TO
        return c.json(`/layers/${foundLayer._id}`);
      }
    } catch (err) {
      console.log(err);
    }
  },
);

}

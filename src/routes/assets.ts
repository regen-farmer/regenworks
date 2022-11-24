import express from 'express';
import Asset from '../models/asset';
import Layer from '../models/layer';
import Project from '../models/project';
import Species from '../models/species';
import middleware from '../middleware';
import { IUserSchema } from '../models/user';

const router = express.Router();

// ASSET INDEX ROUTE
router.get('/assets', middleware.adminIsLoggedIn, async (req: express.Request & { user?: IUserSchema}, res: express.Response) => {
  // Get all assets from DB
  try {
    const allAssets = await Asset.find({ 'owner.id': req.user?._id });
    res.render('assets/index', { assets: allAssets });
  } catch (err) {
    console.log(err);
  }
});

// ASSET NEW ROUTE
router.get('/assets/new', middleware.isLoggedIn, async (req: express.Request & { user?: IUserSchema}, res: express.Response) => {
  try {
    const foundLayers = await Layer.find({ 'owner.id': req.user?._id });
    // console.log("Reached this far");
    // foundLayers.forEach(function(layer){
    //     console.log(layer.id);
    // });
    res.render('assets/new', { layers: foundLayers });
  } catch (err) {
    console.log(err);
  }
});

// ASSET CREATE ROUTE
router.post('/assets', middleware.isLoggedIn, async (req: express.Request & { user?: IUserSchema}, res: express.Response) => {
  // Create a new experience
  try {
    const createdAsset = await Asset.create(req.body.asset);
    // Add ID to experience
    createdAsset.owner.id = req.user?._id;
    // Save the asset - Not needed if created after this step
    createdAsset.save();
    res.redirect('/assets');
  } catch (err) {
    console.log(err);
  }
});

// ASSET SHOW ROUTES
router.get('/assets/:id', middleware.isLoggedIn, async (req: express.Request & { user?: IUserSchema}, res: express.Response) => {
  // Find specific asset
  Asset.findById(req.params.id)
    .populate('layer')
    .exec((err, foundAsset) => {
      if (err) {
        console.log(err);
      } else {
        res.render('assets/show', { asset: foundAsset });
      }
    });
});

// ASSET EDIT ROUTE
router.get(
  '/assets/:id/edit',
  middleware.isLoggedIn,
  async (req: express.Request & { user?: IUserSchema}, res: express.Response) => {
    // FIND ASSET AND RENDER EDIT PAGE
    try {
      const foundAsset = await Asset.findById(req.params.id)
        .populate('species')
        .exec();
      if (foundAsset) {
        // GET ALL SPECIES!!
        try {
          const foundSpecies = await Species.find();
          console.log(foundAsset.species);
          console.log(foundSpecies[0]);
          res.render('assets/edit', {
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
router.put('/assets/:id', middleware.isLoggedIn, async (req: express.Request & { user?: IUserSchema}, res: express.Response) => {
  // UPDATE ASSET
  try {
    const updatedAsset = await Asset.findByIdAndUpdate(
      req.params.id,
      req.body.asset,
    );
    if (updatedAsset) {
      res.redirect(`/assets/${updatedAsset._id}`);
    } else {
      console.log('Asset not updated');
    }
  } catch (err) {
    console.log(err);
  }
});

// ASSET DELETE ROUTE
router.delete('/assets/:id', middleware.isLoggedIn, async (req: express.Request & { user?: IUserSchema}, res: express.Response) => {
  // MAKE ACTIVITY OWNERSHIP MIDDLEWARE
  // FIND ASSET
  try {
    const foundAsset = await Asset.findById(req.params.id);
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
              await Asset.findByIdAndRemove(req.params.id);
              res.redirect(`/projects/${foundProject._id}`);
            } catch (err) {
              console.log(err);
              res.redirect('/assets');
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
  '/layers/:id/assets/new',
  middleware.isLoggedIn,
  async (req: express.Request & { user?: IUserSchema}, res: express.Response) => {
    try {
      const foundLayer = await Layer.findById(req.params.id);
      res.render('assets/new', { layer: foundLayer });
    } catch (err) {
      console.log(err);
    }
  },
);

// AREA ASSET CREATE ROUTE
router.post(
  '/layers/:id/assets',
  middleware.isLoggedIn,
  async (req: express.Request & { user?: IUserSchema}, res: express.Response) => {
    try {
      const foundLayer = await Layer.findById(req.params.id);
      if (foundLayer) {
        const createdAsset = await Asset.create(req.body.asset);

        // Add user ID to experience
        createdAsset.owner.id = req.user?._id;
        createdAsset.save();
        // ADD ASSET TO LAYER
        foundLayer.assets.push(createdAsset);
        // REDIRECT TO
        res.redirect(`/layers/${foundLayer._id}`);
      }
    } catch (err) {
      console.log(err);
    }
  },
);

export default router;

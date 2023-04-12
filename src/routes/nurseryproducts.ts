import express from 'express';
import NurseryProduct from '../models/nurseryproduct';
import Nursery from '../models/nursery';
import Species from '../models/species';
import middleware from '../middleware';
import { UserDocument } from '../models/user';
import { Auth0IDToken } from '../app';

const router = express.Router();

// ADMIN ALL VARIETIES
router.get('/nurseryproducts', middleware.adminIsLoggedIn, async (req: express.Request & { user?: UserDocument, idToken?: Auth0IDToken }, res: express.Response) => {
  try {
    const foundNurseryProducts = await NurseryProduct.find()
      .populate('species')
      .populate('rootstock')
      .populate('hybrid')
      .exec();
    res.send({ products: foundNurseryProducts });
  } catch (err) {
    console.log(err);
  }
});

// NURSERY PRODUCT NURSERY NEW
router.get(
  '/nurseries/:id/nurseryproducts/new',
  middleware.isLoggedIn,
  async (req: express.Request & { user?: UserDocument, idToken?: Auth0IDToken }, res: express.Response) => {
    // FIND NURSERY
    try {
      const foundNursery = await Nursery.findById(req.params.id);
      // FIND ALL SPECIES
      try {
        const allSpecies = await Species.find();
        // SORT SPECIES

        allSpecies.sort((a, b) => {
          if (a.genus < b.genus) {
            return -1;
          }
          if (a.genus > b.genus) {
            return 1;
          }
          return 0;
        });
        res.send({
          nursery: foundNursery,
          species: allSpecies,
        });
      } catch (err) {
        console.log(err);
      }
    } catch (err) {
      console.log(err);
    }
  },
);

// NURSERY PRODUCT NURSERY CREATE
router.post(
  '/nurseries/:id/nurseryproducts',
  middleware.isLoggedIn,
  async (req: express.Request & { user?: UserDocument, idToken?: Auth0IDToken }, res: express.Response) => {
    // CLEAN NONE OPTIONS
    const product = req.body.product;
    if (req.body.product.species === '') {
      delete product.species;
    }
    if (req.body.product.hybrid === '') {
      delete product.hybrid;
    }
    if (req.body.product.rootstock === '') {
      delete product.rootstock;
    }
    if (req.body.product.availability) {
      product.availability = true;
    }
    // FIND NURSERY
    try {
      const foundNursery = await Nursery.findById(req.params.id);
      // CREATE PRODUCT
      if (foundNursery) {
        try {
          const createdProduct = await NurseryProduct.create(product);
          // SET OWNERSHIP
          createdProduct.owner.id = req.user?._id.toString()!;
          await createdProduct.save();
          // INSERT PRODUCT IN NURSERY
          foundNursery.products.push(createdProduct);
          await foundNursery.save();
          // REDIRECT TO NURSERY
          res.send(`/nurseries/${foundNursery._id}`);
        } catch (err) {
          console.log(err);
        }
      }
    } catch (err) {
      console.log(err);
    }
  },
);

// NURSERY PRODUCT SHOW
router.get(
  '/nurseries/:id/nurseryproducts/:pid',
  middleware.isLoggedIn,
  async (req: express.Request & { user?: UserDocument, idToken?: Auth0IDToken }, res: express.Response) => {
    // FIND NURSERY
    try {
      const foundNursery = await Nursery.findById(req.params.id);
      try {
      // FIND PRODUCT
        const foundProduct = await NurseryProduct.findById(req.params.pid)
          .populate('species')
          .populate('rootstock')
          .populate('hybrid')
          .exec();
        res.send({
          nursery: foundNursery,
          product: foundProduct,
        });
      } catch (err) {
        console.log(err);
      }
    } catch (err) {
      console.log(err);
    }
  },
);

// NURSERY PRODUCT EDIT
router.get(
  '/nurseries/:id/nurseryproducts/:pid/edit',
  middleware.isLoggedIn,
  async (req: express.Request & { user?: UserDocument, idToken?: Auth0IDToken }, res: express.Response) => {
    // FIND NURSERY
    try {
      const foundNursery = await Nursery.findById(req.params.id);
      // FIND PRODUCT
      try {
        const foundProduct = await NurseryProduct.findById(req.params.pid)
          .populate('species')
          .populate('rootstock')
          .populate('hybrid')
          .exec();
        // FIND ALL SPECIES
        try {
          const allSpecies = await Species.find();
          // SORT SPECIES

          allSpecies.sort((a, b) => {
            if (a.genus < b.genus) {
              return -1;
            }
            if (a.genus > b.genus) {
              return 1;
            }
            return 0;
          });
          res.send({
            nursery: foundNursery,
            product: foundProduct,
            species: allSpecies,
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

// NURSERY PRODUCT UPDATE
router.put(
  '/nurseries/:id/nurseryproducts/:pid',
  middleware.isLoggedIn,
  async (req: express.Request & { user?: UserDocument, idToken?: Auth0IDToken }, res: express.Response) => {
    // CLEAN NONE OPTIONS
    const product = req.body.product;
    if (req.body.product.species === '') {
      delete product.species;
    }
    if (req.body.product.hybrid === '') {
      delete product.hybrid;
    }
    if (req.body.product.rootstock === '') {
      delete product.rootstock;
    }
    if (req.body.product.availability) {
      product.availability = true;
    } else {
      product.availability = false;
    }
    console.log(req.body.product.availability);
    console.log(typeof req.body.product.availability);
    try {
      const updatedProduct = await NurseryProduct.findByIdAndUpdate(
        req.params.pid,
        product,
      );
      // REDIRECT TO PRODUCT
      /* if(req.body.product.hybrid === ""){
                updatedProduct.hybrid = {};
                updatedProduct.save();
            }
            if(req.body.product.rootstock === ""){
                delete updatedProduct.rootstock;
                updatedProduct.save();
            } */
      if (updatedProduct) {
        res.send(
          `/nurseries/${
            req.params.id
          }/nurseryproducts/${
            updatedProduct._id}`,
        );
      } else {
        console.log('No updatedProduct');
      }
    } catch (err) {
      console.log(err);
    }
  },
);

// NURSERY PRODUCT DUPLICATE

export default router;

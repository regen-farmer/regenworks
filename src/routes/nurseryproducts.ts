import express from 'express';
import NurseryProduct from '../models/nurseryproduct.js';
import Nursery from '../models/nursery.js';
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

// ADMIN ALL VARIETIES
router.get('/nurseryproducts', async (c) => {
  await middleware.adminIsLoggedIn(c);
  try {
    const foundNurseryProducts = await NurseryProduct.find()
      .populate('species')
      .populate('rootstock')
      .populate('hybrid')
      .exec();
    return c.json({ products: foundNurseryProducts });
  } catch (err) {
    console.log(err);
  }
});

// NURSERY PRODUCT NURSERY NEW
router.get(
  '/nurseries/:entityid/nurseryproducts/new',
  async (c) => {
    await middleware.isLoggedIn(c)
    // FIND NURSERY
    try {
      const foundNursery = await Nursery.findById(c.req.param('entityid'));
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
        return c.json({
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
  '/nurseries/:entityid/nurseryproducts',
  async (c) => {
    await middleware.isLoggedIn(c)
    // CLEAN NONE OPTIONS
    const product = (await c.req.json()).product;
    if ((await c.req.json()).product.species === '') {
      delete product.species;
    }
    if ((await c.req.json()).product.hybrid === '') {
      delete product.hybrid;
    }
    if ((await c.req.json()).product.rootstock === '') {
      delete product.rootstock;
    }
    if ((await c.req.json()).product.availability) {
      product.availability = true;
    }
    // FIND NURSERY
    try {
      const foundNursery = await Nursery.findById(c.req.param('entityid'));
      // CREATE PRODUCT
      if (foundNursery) {
        try {
          const createdProduct = await NurseryProduct.create(product);
          // SET OWNERSHIP
          createdProduct.owner.id = c.get('user')?._id.toString()!;
          await createdProduct.save();
          // INSERT PRODUCT IN NURSERY
          foundNursery.products.push(createdProduct);
          await foundNursery.save();
          // REDIRECT TO NURSERY
          return c.json(`/nurseries/${foundNursery._id}`);
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
  '/nurseries/:entityid/nurseryproducts/:pid',
  async (c) => {
    await middleware.isLoggedIn(c)
    // FIND NURSERY
    try {
      const foundNursery = await Nursery.findById(c.req.param('entityid'));
      try {
      // FIND PRODUCT
        const foundProduct = await NurseryProduct.findById(c.req.param('pid'))
          .populate('species')
          .populate('rootstock')
          .populate('hybrid')
          .exec();
        return c.json({
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
  '/nurseries/:entityid/nurseryproducts/:pid/edit',
  async (c) => {
    await middleware.isLoggedIn(c)
    // FIND NURSERY
    try {
      const foundNursery = await Nursery.findById(c.req.param('entityid'));
      // FIND PRODUCT
      try {
        const foundProduct = await NurseryProduct.findById(c.req.param('pid'))
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
          return c.json({
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
  '/nurseries/:entityid/nurseryproducts/:pid',
  async (c) => {
    await middleware.isLoggedIn(c)
    // CLEAN NONE OPTIONS
    const product = (await c.req.json()).product;
    if ((await c.req.json()).product.species === '') {
      delete product.species;
    }
    if ((await c.req.json()).product.hybrid === '') {
      delete product.hybrid;
    }
    if ((await c.req.json()).product.rootstock === '') {
      delete product.rootstock;
    }
    if ((await c.req.json()).product.availability) {
      product.availability = true;
    } else {
      product.availability = false;
    }
    console.log((await c.req.json()).product.availability);
    console.log(typeof (await c.req.json()).product.availability);
    try {
      const updatedProduct = await NurseryProduct.findByIdAndUpdate(
        c.req.param('pid'),
        product,
      );
      // REDIRECT TO PRODUCT
      /* if((await c.req.json()).product.hybrid === ""){
                updatedProduct.hybrid = {};
                updatedProduct.save();
            }
            if((await c.req.json()).product.rootstock === ""){
                delete updatedProduct.rootstock;
                updatedProduct.save();
            } */
      if (updatedProduct) {
        return c.json(
          `/nurseries/${
            c.req.param('entityid')
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

}

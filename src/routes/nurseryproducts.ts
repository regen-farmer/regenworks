import express from 'express';
import NurseryProduct from '../models/nurseryproduct';
import Nursery from '../models/nursery';
import Species from '../models/species';
import middleware from '../middleware';
import { IUserSchema } from '../models/user';

const router = express.Router();

// ADMIN ALL VARIETIES
router.get('/nurseryproducts', middleware.adminIsLoggedIn, (req: express.Request & { user?: IUserSchema}, res: express.Response) => {
  NurseryProduct.find()
    .populate('species')
    .populate('rootstock')
    .populate('hybrid')
    .exec((err, foundNurseryProducts) => {
      if (err) {
        console.log(err);
      } else {
        res.render('nurseryproducts/index', { products: foundNurseryProducts });
      }
    });
});

// NURSERY PRODUCT NURSERY NEW
router.get(
  '/nurseries/:id/nurseryproducts/new',
  middleware.isLoggedIn,
  (req: express.Request & { user?: IUserSchema}, res: express.Response) => {
    // FIND NURSERY
    Nursery.findById(req.params.id, (err, foundNursery) => {
      if (err) {
        console.log(err);
      } else {
        // FIND ALL SPECIES
        Species.find((err, allSpecies) => {
          if (err) {
            console.log(err);
          } else {
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
            res.render('nurseryproducts/new', {
              nursery: foundNursery,
              species: allSpecies,
            });
          }
        });
      }
    });
  },
);

// NURSERY PRODUCT NURSERY CREATE
router.post(
  '/nurseries/:id/nurseryproducts',
  middleware.isLoggedIn,
  (req: express.Request & { user?: IUserSchema}, res: express.Response) => {
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
    Nursery.findById(req.params.id, (err, foundNursery) => {
      if (err) {
        console.log(err);
      } else {
        // CREATE PRODUCT
        NurseryProduct.create(product, (err, createdProduct) => {
          if (err) {
            console.log(err);
          } else {
            // SET OWNERSHIP
            createdProduct.owner.id = req.user?._id;
            createdProduct.save();
            // INSERT PRODUCT IN NURSERY
            foundNursery.products.push(createdProduct);
            foundNursery.save();
            // REDIRECT TO NURSERY
            res.redirect(`/nurseries/${foundNursery._id}`);
          }
        });
      }
    });
  },
);

// NURSERY PRODUCT SHOW
router.get(
  '/nurseries/:id/nurseryproducts/:pid',
  middleware.isLoggedIn,
  (req: express.Request & { user?: IUserSchema}, res: express.Response) => {
    // FIND NURSERY
    Nursery.findById(req.params.id, (err, foundNursery) => {
      if (err) {
        console.log(err);
      } else {
        // FIND PRODUCT
        NurseryProduct.findById(req.params.pid)
          .populate('species')
          .populate('rootstock')
          .populate('hybrid')
          .exec((err, foundProduct) => {
            if (err) {
              console.log(err);
            } else {
              res.render('nurseryproducts/show', {
                nursery: foundNursery,
                product: foundProduct,
              });
            }
          });
      }
    });
  },
);

// NURSERY PRODUCT EDIT
router.get(
  '/nurseries/:id/nurseryproducts/:pid/edit',
  middleware.isLoggedIn,
  (req: express.Request & { user?: IUserSchema}, res: express.Response) => {
    // FIND NURSERY
    Nursery.findById(req.params.id, (err, foundNursery) => {
      if (err) {
        console.log(err);
      } else {
        // FIND PRODUCT
        NurseryProduct.findById(req.params.pid)
          .populate('species')
          .populate('rootstock')
          .populate('hybrid')
          .exec((err, foundProduct) => {
            if (err) {
              console.log(err);
            } else {
              // FIND ALL SPECIES
              Species.find((err, allSpecies) => {
                if (err) {
                  console.log(err);
                } else {
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
                  res.render('nurseryproducts/edit', {
                    nursery: foundNursery,
                    product: foundProduct,
                    species: allSpecies,
                  });
                }
              });
            }
          });
      }
    });
  },
);

// NURSERY PRODUCT UPDATE
router.put(
  '/nurseries/:id/nurseryproducts/:pid',
  middleware.isLoggedIn,
  async (req: express.Request & { user?: IUserSchema}, res: express.Response) => {
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
        res.redirect(
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

import express from 'express';
import Animal from '../models/animal';
import middleware from '../middleware';
import { UserDocument } from '../models/user';
import { Auth0IDToken } from '../app';

const router = express.Router();

// ANIMAL INDEX
router.get('/animals', middleware.isLoggedIn, async (req: express.Request & { user?: UserDocument, idToken?: Auth0IDToken }, res: express.Response) => {
  const foundAnimals = await Animal.find();
  res.send({ animals: foundAnimals });
});

// ANIMAL NEW
router.get('/animals/new', middleware.isLoggedIn, async (req: express.Request & { user?: UserDocument, idToken?: Auth0IDToken }, res: express.Response) => { // ADMIN LOGIN REQUIRED
  res.send();
});

// ANIMAL CREATE
router.post('/animals', middleware.isLoggedIn, async (req: express.Request & { user?: UserDocument, idToken?: Auth0IDToken }, res: express.Response) => {
  try {
    const createdAnimal = await Animal.create(req.body.animal);
    console.log(`Animal created: ${createdAnimal}`);
    res.send('/animals');
  } catch (err) {
    console.log(err);
  }
});

export default router;

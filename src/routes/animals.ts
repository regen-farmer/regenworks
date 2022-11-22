import express from 'express';
import Animal from '../models/animal';
import middleware from '../middleware';

const router = express.Router();

// ANIMAL INDEX
router.get('/animals', middleware.isLoggedIn, async (req, res) => {
  const foundAnimals = await Animal.find();
  res.render('animals/index', { animals: foundAnimals });
});

// ANIMAL NEW
router.get('/animals/new', middleware.isLoggedIn, (req, res) => { // ADMIN LOGIN REQUIRED
  res.render('animals/new');
});

// ANIMAL CREATE
router.post('/animals', middleware.isLoggedIn, async (req, res) => {
  try {
    const createdAnimal = await Animal.create(req.body.animal);
    console.log(`Animal created: ${createdAnimal}`);
    res.redirect('/animals');
  } catch (err) {
    console.log(err);
  }
});

export default router;

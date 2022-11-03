const express = require('express');

const router = express.Router();
const Animal = require('../models/animal');
const middleware = require('../middleware');

// ANIMAL INDEX
router.get('/animals', middleware.isLoggedIn, (req, res) => {
  Animal.find((err, foundAnimals) => {
    if (err) {
      console.log(err);
    } else {
      res.render('animals/index', { animals: foundAnimals });
    }
  });
});

// ANIMAL NEW
router.get('/animals/new', middleware.isLoggedIn, (req, res) => { // ADMIN LOGIN REQUIRED
  res.render('animals/new');
});

// ANIMAL CREATE
router.post('/animals', middleware.isLoggedIn, (req, res) => {
  Animal.create(req.body.animal, (err, createdAnimal) => {
    if (err) {
      console.log(err);
    } else {
      console.log(`Animal created: ${createdAnimal}`);
      res.redirect('/animals');
    }
  });
});

module.exports = router;

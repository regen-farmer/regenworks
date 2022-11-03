const mongoose = require('mongoose');

// ANIMAL SCHEMA SETUP
const animalSchema = new mongoose.Schema({
  name: String,
  family: String,
  genus: String,
  species: String,
});

module.exports = mongoose.model('Animal', animalSchema);

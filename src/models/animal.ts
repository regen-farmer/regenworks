var mongoose = require("mongoose");

// ANIMAL SCHEMA SETUP
var animalSchema = new mongoose.Schema({
    name: String,
    family: String,
    genus: String,
    species: String
});

module.exports = mongoose.model("Animal", animalSchema);
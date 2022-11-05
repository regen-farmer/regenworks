import mongoose from "mongoose";

// ANIMAL SCHEMA SETUP
var animalSchema = new mongoose.Schema({
    name: String,
    family: String,
    genus: String,
    species: String
});

export default mongoose.model("Animal", animalSchema);
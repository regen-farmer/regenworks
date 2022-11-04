var mongoose = require("mongoose");

// PRACTICE SCHEMA SETUP
var practicesSchema = new mongoose.Schema({
    name: String,
    type: String,
    description: String,
    tasks: String,
    regenScores: {
        soilScore: Number,
        bioScore: Number,
        waterScore: Number,
        climateScore: Number
    }
});

module.exports = mongoose.model("Practice", practicesSchema);
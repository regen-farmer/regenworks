import mongoose from "mongoose";

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

export default mongoose.model("Practice", practicesSchema);
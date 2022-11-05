import mongoose from "mongoose";

// FLOW SCHEMA SETUP
var farmflowSchema = new mongoose.Schema({
    name: String,
    description: String,
    type: String,
    unit: String,
    timeframe: String,
    source: String,
    timestamp: Date,
    amount: Number,
    species: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Species"
    }
});

export default mongoose.model("Farmflow", farmflowSchema);
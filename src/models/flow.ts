import mongoose from "mongoose";

// FLOW SCHEMA SETUP
var flowSchema = new mongoose.Schema({
    name: String,
    type: String,
    unit: String,
    timeframe: String,
    data: [Number],
    source: String
});

export default mongoose.model("Flow", flowSchema);
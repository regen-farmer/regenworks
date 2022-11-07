import mongoose from "mongoose";

// LOG SCHEMA SETUP
var logSchema = new mongoose.Schema({
    message: String,
    level: String,
    timestamp: Number
});

export default mongoose.model("Log", logSchema);
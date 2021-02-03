var mongoose = require("mongoose");

// FLOW SCHEMA SETUP
var farmflowSchema = new mongoose.Schema({
    name: String,
    description: String,
    type: String,
    unit: String,
    timeframe: String,
    source: String,
    timestamp: Date,
    amount: Number
});

module.exports = mongoose.model("Farmflow", farmflowSchema);
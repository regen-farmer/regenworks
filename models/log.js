var mongoose = require("mongoose");

// LOG SCHEMA SETUP
var logSchema = new mongoose.Schema({
    message: String,
    level: String,
    timestamp: Number
});

module.exports = mongoose.model("Log", logSchema);
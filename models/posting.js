var mongoose = require("mongoose");

// POSTING SCHEMA SETUP
var postingSchema = new mongoose.Schema({
    name: String,
    postType: String,
    amount: Number,
    value: Number,
    year: Number
});

module.exports = mongoose.model("Posting", postingSchema);
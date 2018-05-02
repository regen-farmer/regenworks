var mongoose = require("mongoose");

// PRODUCT SCHEMA SETUP
var productsSchema = new mongoose.Schema({
    name: String,
    image: String,
    type: String
});

module.exports = mongoose.model("Product", productsSchema);
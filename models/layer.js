var mongoose = require("mongoose");
var GeoJSON = require("mongoose-geojson-schema");

// LAYER SCHEMA SETUP
var layerSchema = new mongoose.Schema({
    name: String,
    description: String,
    type: String,
    owner: {
        id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User"
        },
        username: String
    },
    geometry: String,
    size: Number
});

module.exports = mongoose.model("Layer", layerSchema);
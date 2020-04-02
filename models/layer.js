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
    climate: {
        monthlyaveragetemp: {
            january: Number,
            february: Number,
            march: Number,
            april: Number,
            may: Number,
            june: Number,
            july: Number,
            august: Number,
            september: Number,
            october: Number,
            november: Number,
            december: Number
        },
        annualaverageprec: Number,
        monthlyaverageprec: {
            january: Number,
            february: Number,
            march: Number,
            april: Number,
            may: Number,
            june: Number,
            july: Number,
            august: Number,
            september: Number,
            october: Number,
            november: Number,
            december: Number
        }
    },
    geometry: String,
    lat: Number,
    lng: Number,
    size: Number,
    systems: {
        past: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: "System"
            }
        ],
        present: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "System"
        },
        future: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: "System"
            }
        ]
    },
    projects: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Project"
        }
    ]
});

module.exports = mongoose.model("Layer", layerSchema);
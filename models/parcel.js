var mongoose = require("mongoose");
var GeoJSON = require("mongoose-geojson-schema");

// PARCEL SCHEMA SETUP
var parcelSchema = new mongoose.Schema({
    name: String,
    agType: [
        {
            type: String
        }
    ],
    description: String,
    soilType: String,
    size: Number,
    location: String,
    lat: Number,
    lng: Number,
    geometry: String,
    owner: {
        id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User"
        },
        username: String
    },
    practices: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Practice"
        }
     ],
    layers: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Layer"
        }
    ],
    projects: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Project"
        }
    ],
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
    }
});

module.exports = mongoose.model("Parcel", parcelSchema);
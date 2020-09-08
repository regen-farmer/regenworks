var mongoose = require("mongoose");

// PROJECT SCHEMA SETUP
var projectSchema = new mongoose.Schema({
    name: String,
    description: String,
    location: String,
    lat: Number,
    lng: Number,
    assets: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Asset"
        }
    ],
    owner: {
        id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User"
        },
        username: String
    },
    layer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Layer"
    },
    activities: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Activity"
        }
    ],
    system: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "System"
    },
    budgets: {
        establishment: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Budget"
        },
        management: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Budget"
        }
    },
    financial: {
        discountRate: Number,
        period: Number
    },
    layout: String,
    alignment: String,
    bearing: {type: Number, default: 0},
    headland: Number,
    status: String
});

module.exports = mongoose.model("Project", projectSchema);
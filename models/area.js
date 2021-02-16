var mongoose = require("mongoose");

// AREA SCHEMA SETUP
var areaSchema = new mongoose.Schema({
    name: String,
    description: String,
    geometry: String,
    size: Number,
    rotation: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Rotation"
    },
    owner: {
        id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User"
        },
        username: String
    },
    activities: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Activity"
        }
    ],
    farmflows: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Farmflow"
        }
    ],
    notes: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Note"
        }
    ]
});

module.exports = mongoose.model("Area", areaSchema);
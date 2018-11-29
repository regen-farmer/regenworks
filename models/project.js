var mongoose = require("mongoose");

// PROJECT SCHEMA SETUP
var projectSchema = new mongoose.Schema({
    name: String,
    description: String,
    location: String,
    lat: Number,
    lng: Number,
    owner: {
        id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User"
        },
        username: String
    },
    parcel: {
        id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Parcel"
        },
        name: String
    },
    type: String,
    price: String,
    action: String
});

module.exports = mongoose.model("Project", projectSchema);
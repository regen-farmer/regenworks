var mongoose = require("mongoose");

// ASSET SCHEMA SETUP
var assetSchema = new mongoose.Schema({
    name: String,
    description: String,
    type: String,
    amount: Number,
    species: String,
    value: Number,
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
    }
});

module.exports = mongoose.model("Asset", assetSchema);
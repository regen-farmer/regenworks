var mongoose = require("mongoose");

// ASSET SCHEMA SETUP
var assetSchema = new mongoose.Schema({
    name: String,
    description: String,
    typeAsset: String,
    amount: Number,
    species: String,
    value: Number,
    creation: Number,
    owner: {
        id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User"
        },
        username: String
    }
});

module.exports = mongoose.model("Asset", assetSchema);
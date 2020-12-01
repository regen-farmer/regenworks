var mongoose = require("mongoose");

// NURSERY PRODUCT SCHEMA SETUP
var nurseryProductSchema = new mongoose.Schema({
    name: String,
    variety: String,
    species: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Species"
    },
    price: Number,
    description: String,
    stock: Number,
    class: String,
    pollination: String,
    orderlimit: Number,
    rootstock: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Species"
    },
    hybrid: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Species"
    },
    owner: {
        id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User"
        },
        username: String
    },
    availability: {type: Boolean, default: false},
    season: {
        start: String,
        end: String
    }
});

module.exports = mongoose.model("Nurseryproduct", nurseryProductSchema);
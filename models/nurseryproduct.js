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
    }
});

module.exports = mongoose.model("Nurseryproduct", nurseryProductSchema);
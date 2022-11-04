var mongoose = require("mongoose");

// VARIETY SCHEMA SETUP
var varietySchema = new mongoose.Schema({
    name: String,
    species: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Species"
    },
    price: Number,
    description: String,
    class: String,
    pollination: String,
    rootstock: {
        name: String,
        species: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Species"
        }
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
});

module.exports = mongoose.model("Variety", varietySchema);
var mongoose = require("mongoose");

// NURSERY SCHEMA SETUP
var nurserySchema = new mongoose.Schema({
    name: String,
    location: String,
    currency: String,
    lat: Number,
    lng: Number,
    owner: {
        id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User"
        },
        username: String
    },
    products: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Nurseryproduct"
        }
    ]
});

module.exports = mongoose.model("Nursery", nurserySchema);
var mongoose = require("mongoose");

// PLACE SCHEMA SETUP
var placesSchema = new mongoose.Schema({
    name: String,
    type: String,
    image: String,
    description: String,
    phone: Number,
    email: String,
    facebook: String,
    website: String,
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
    experiences: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Experience"
        }
    ],
    products: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Product"
        }
     ],
    hours: {
        mon: {
            open: String,
            close: String
        },
        tue: {
            open: String,
            close: String
        },
        wed: {
            open: String,
            close: String
        },
        thu: {
            open: String,
            close: String
        },
        fri: {
            open: String,
            close: String
        },
        sat: {
            open: String,
            close: String
        },
        sun: {
            open: String,
            close: String
        }
    },
    action: String
});

module.exports = mongoose.model("Place", placesSchema);
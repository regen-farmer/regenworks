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
    openhours: {
        mon: {
            open: Number,
            close: Number
        },
        tue: {
            open: Number,
            close: Number
        },
        wed: {
            open: Number,
            close: Number
        },
        thu: {
            open: Number,
            close: Number
        },
        fri: {
            open: Number,
            close: Number
        },
        sat: {
            open: Number,
            close: Number
        },
        sun: {
            open: Number,
            close: Number
        }
    }
});

module.exports = mongoose.model("Place", placesSchema);
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
            active: Boolean,
            open: Number,
            close: Number
        },
        tue: {
            active: Boolean,
            open: Number,
            close: Number
        },
        wed: {
            active: Boolean,
            open: Number,
            close: Number
        },
        thu: {
            active: Boolean,
            open: Number,
            close: Number
        },
        fri: {
            active: Boolean,
            open: Number,
            close: Number
        },
        sat: {
            active: Boolean,
            open: Number,
            close: Number
        },
        sun: {
            active: Boolean,
            open: Number,
            close: Number
        }
    },
    action: String
});

module.exports = mongoose.model("Place", placesSchema);
var mongoose = require("mongoose");

// PLACE SCHEMA SETUP
var placesSchema = new mongoose.Schema({
    name: String,
    type: String,
    image: String,
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
    products: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Product"
        }
     ],
    hours: {
        monday: String,
        tuesday: String,
        wednesday: String,
        thursday: String,
        friday: String,
        saturday: String,
        sunday: String
    }
});

module.exports = mongoose.model("Place", placesSchema);
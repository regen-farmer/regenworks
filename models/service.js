var mongoose = require("mongoose");

// SERVICE SCHEMA SETUP
var serviceSchema = new mongoose.Schema({
    name: String,
    description: String,
    location: String,
    lat: Number,
    lng: Number,
    period: {
        start: String,
        end: String
    },
    owner: {
        id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User"
        },
        username: String
    },
    type: String,
    price: String,
    action: String
});

module.exports = mongoose.model("Service", serviceSchema);
var mongoose = require("mongoose");

// AREA SCHEMA SETUP
var areaSchema = new mongoose.Schema({
    name: String,
    description: String,
    geometry: String,
    size: Number,
    owner: {
        id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User"
        },
        username: String
    }
});

module.exports = mongoose.model("Area", areaSchema);
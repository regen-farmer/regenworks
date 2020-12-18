var mongoose = require("mongoose");

// ROTATION SCHEMA SETUP
var rotationSchema = new mongoose.Schema({
    name: String,
    description: String,
    model: [
        {
            species: {
                type: mongoose.Schema.Types.ObjectId,
                ref: "Species"
            },
            year: Number,
            month: Number
        }
    ],
    owner: {
        id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User"
        },
        username: String
    }
});

module.exports = mongoose.model("Rotation", rotationSchema);
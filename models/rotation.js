var mongoose = require("mongoose");

// ROTATION SCHEMA SETUP
var rotationSchema = new mongoose.Schema({
    name: String,
    description: String,
    model: [
        {
            speciesmix: [
                {
                    species: {
                        type: mongoose.Schema.Types.ObjectId,
                        ref: "Species"
                    },
                    amount: Number
                }
            ],
            planting: {
                year: Number,
                month: Number
            },
            harvest: {
                year: Number,
                month: Number
            }
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
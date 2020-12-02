var mongoose = require("mongoose");

// SEQUENCE SCHEMA SETUP
var sequenceSchema = new mongoose.Schema({
    name: String,
    description: String,
    model: [
        {
            species: {
                type: mongoose.Schema.Types.ObjectId,
                ref: "Species"
            },
            position: Number
        }
    ],
    owner: {
        id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User"
        },
        username: String
    },
    sequencelength: Number
});

module.exports = mongoose.model("Sequence", sequenceSchema);
import mongoose from "mongoose";

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

export default mongoose.model("Sequence", sequenceSchema);
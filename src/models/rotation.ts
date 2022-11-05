import mongoose from "mongoose";

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

export default mongoose.model("Rotation", rotationSchema);
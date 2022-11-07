import mongoose from "mongoose";

// WELL SCHEMA SETUP
var wellSchema = new mongoose.Schema({
    name: String,
    description: String,
    geometry: String,
    owner: {
        id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User"
        },
        username: String
    }
});

export default mongoose.model("Well", wellSchema);
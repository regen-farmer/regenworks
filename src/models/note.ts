import mongoose from "mongoose";

// NOTE SCHEMA SETUP
var noteSchema = new mongoose.Schema({
    name: String,
    description: String,
    owner: {
        id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User"
        },
        username: String
    }
});

export default mongoose.model("Note", noteSchema);
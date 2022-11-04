var mongoose = require("mongoose");

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

module.exports = mongoose.model("Note", noteSchema);
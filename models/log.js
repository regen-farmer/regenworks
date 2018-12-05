var mongoose = require("mongoose");

// LOG SCHEMA SETUP
var logSchema = new mongoose.Schema({
    name: String,
    message: String,
    type: String,
    owner: {
        id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User"
        },
        username: String
    }
});

module.exports = mongoose.model("Log", logSchema);
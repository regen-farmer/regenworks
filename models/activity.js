var mongoose = require("mongoose");

// ACTIVITY SCHEMA SETUP
var activitySchema = new mongoose.Schema({
    name: String,
    description: String,
    start: {
        date: String,
        time: String
    },
    end:  {
        date: String,
        time: String
    },
    time: Number,
    status: Boolean,
    automated: Boolean,
    owner: {
        id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User"
        },
        username: String
    },
    layer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Layer"
    }
});

module.exports = mongoose.model("Activity", activitySchema);
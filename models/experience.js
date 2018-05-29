var mongoose = require("mongoose");

// EXPERIENCE SCHEMA SETUP
var experienceSchema = new mongoose.Schema({
    name: String,
    description: String,
    location: String,
    start: {
        date: String,
        time: String
    },
    end:  {
        date: String,
        time: String
    },
    image: String,
    type: String,
    owner: {
        id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User"
        },
        username: String
    },
    price: String,
    action: String,
});

module.exports = mongoose.model("Experience", experienceSchema);
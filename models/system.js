var mongoose = require("mongoose");

// SYSTEM SCHEMA SETUP
var systemSchema = new mongoose.Schema({
    name: String,
    description: String,
    rows: [
        { width: Number,
          sequense: [
              {
                  type: mongoose.Schema.Types.ObjectId,
                  ref: "Species"
              }
          ]
        }

    ],
    animals: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Animal"
        }
    ],
    owner: {
        id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User"
        },
        username: String
    },
    shared: {
        type: Boolean,
        default: false
    },
    flows: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Systemflow"
        }
    ],
    occurrences: [
        {
            name: String,
            lat: Number,
            lng: Number,
            alt: Number,
            country: String,
            source: String,
            eco: Number,
            koppen: String
        }
    ]
});

module.exports = mongoose.model("System", systemSchema);
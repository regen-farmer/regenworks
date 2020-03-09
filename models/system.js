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
    ]
});

module.exports = mongoose.model("System", systemSchema);
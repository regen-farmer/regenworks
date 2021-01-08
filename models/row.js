var mongoose = require("mongoose");

// ROW SCHEMA SETUP
var rowSchema = new mongoose.Schema({
    geometry: String,
    sequence: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Sequence"
    },
    name: String,
    assets: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Asset"
        }
    ]
});

module.exports = mongoose.model("Row", rowSchema);
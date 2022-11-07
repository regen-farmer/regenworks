import mongoose from "mongoose";

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
    ],
    activities: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Activity"
        }
    ],
    farmflows: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Farmflow"
        }
    ],
    notes: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Note"
        }
    ]
});

export default mongoose.model("Row", rowSchema);
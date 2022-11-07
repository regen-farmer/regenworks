import mongoose from "mongoose";

// SYSTEM FLOW SCHEMA SETUP
var systemflowSchema = new mongoose.Schema({
    name: String,
    type: String,
    unit: String,
    timeframe: String,
    location: String,
    data: [
        {
            species: {
                type: mongoose.Schema.Types.ObjectId,
                ref: "Species"
            },
            data: [Number]
        }
    ],
    source: String,
    systemref: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "System"
    }
});

export default mongoose.model("Systemflow", systemflowSchema);
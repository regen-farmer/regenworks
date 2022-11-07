import mongoose from "mongoose";

// SAP TEST SCHEMA SETUP
var saptestSchema = new mongoose.Schema({
    name: String,
    description: String,
    lat: Number,
    lng: Number,
    sampleDate: Date,
    sugars: Number,
    pH: Number,
    EC: Number,
    potassium: Number,
    calcium: Number,
    magnesium: Number,
    sodium: Number,
    ammonium: Number,
    nitrate: Number,
    nInNitrate: Number,
    totalN: Number,
    chloride: Number,
    sulfur: Number,
    owner: {
        id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User"
        },
        username: String
    }
});

export default mongoose.model("Saptest", saptestSchema);
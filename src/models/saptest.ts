import { Document, model, Schema, Types } from 'mongoose';

interface ISaptestSchema extends Document {
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
        id: Types.ObjectId,
        username: String
    }
}

// SAP TEST SCHEMA SETUP
var saptestSchema = new Schema<ISaptestSchema>({
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
            type: Schema.Types.ObjectId,
            ref: "User"
        },
        username: String
    }
});

export default model("Saptest", saptestSchema);
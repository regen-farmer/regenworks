import { Document, model, Schema, Types } from 'mongoose';

interface IAssetSchema extends Document {
    name: String,
    description: String,
    typeAsset: String,
    amount: Number,
    species: Types.ObjectId,
    value: Number,
    creation: Number,
    determination: Number,
    lat: Number,
    lng: Number,
    owner: {
        id: Types.ObjectId,
        username: String
    }
}

// ASSET SCHEMA SETUP
var assetSchema = new Schema<IAssetSchema>({
    name: String,
    description: String,
    typeAsset: String,
    amount: Number,
    species: {
        type: Schema.Types.ObjectId,
        ref: "Species"
    },
    value: Number,
    creation: Number,
    determination: Number,
    lat: Number,
    lng: Number,
    owner: {
        id: {
            type: Schema.Types.ObjectId,
            ref: "User"
        },
        username: String
    }
});

export default model("Asset", assetSchema);
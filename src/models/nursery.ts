import { Document, model, Schema, Types } from 'mongoose';

interface INurserySchema extends Document {
    name: String,
    location: String,
    currency: String,
    description: String,
    lat: Number,
    lng: Number,
    range: Number,
    owner: {
        id: Types.ObjectId,
        username: String
    },
    products: [
        Types.ObjectId
    ]
}

// NURSERY SCHEMA SETUP
var nurserySchema = new Schema<INurserySchema>({
    name: String,
    location: String,
    currency: String,
    description: String,
    lat: Number,
    lng: Number,
    range: Number,
    owner: {
        id: {
            type: Schema.Types.ObjectId,
            ref: "User"
        },
        username: String
    },
    products: [
        {
            type: Schema.Types.ObjectId,
            ref: "Nurseryproduct"
        }
    ]
});

export default model("Nursery", nurserySchema);
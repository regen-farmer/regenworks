import { Document, model, Schema, Types } from 'mongoose';
import { INurseryProductSchema } from './nurseryproduct';
import { IUserSchema } from './user';

export interface INurserySchema extends Document {
    name: String,
    location: String,
    currency: String,
    description: String,
    lat: Number,
    lng: Number,
    range: Number,
    owner: {
        id: IUserSchema,
        username: String
    },
    products: [
        INurseryProductSchema
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
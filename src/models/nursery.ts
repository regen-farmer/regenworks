import { Document, model, Schema, Types } from 'mongoose';
import { INurseryProductSchema } from './nurseryproduct';
import { IUserSchema } from './user';

export interface INurserySchema extends Document {
    name: string,
    location: string,
    currency: string,
    description: string,
    lat: number,
    lng: number,
    range: number,
    owner: {
        id: IUserSchema,
        username: string
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
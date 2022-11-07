import { Document, model, Schema, Types } from 'mongoose';
import { ISpeciesSchema } from './species';
import { IUserSchema } from './user';

export interface INurseryProductSchema extends Document {
    name: String,
    variety: String,
    species: ISpeciesSchema,
    price: Number,
    description: String,
    stock: Number,
    class: String,
    pollination: String,
    orderlimit: Number,
    rootstock: ISpeciesSchema,
    hybrid: ISpeciesSchema,
    owner: {
        id: IUserSchema,
        username: String
    },
    availability: {type: Boolean, default: false},
    season: {
        start: String,
        end: String
    }
}

// NURSERY PRODUCT SCHEMA SETUP
var nurseryProductSchema = new Schema<INurseryProductSchema>({
    name: String,
    variety: String,
    species: {
        type: Schema.Types.ObjectId,
        ref: "Species"
    },
    price: Number,
    description: String,
    stock: Number,
    class: String,
    pollination: String,
    orderlimit: Number,
    rootstock: {
        type: Schema.Types.ObjectId,
        ref: "Species"
    },
    hybrid: {
        type: Schema.Types.ObjectId,
        ref: "Species"
    },
    owner: {
        id: {
            type: Schema.Types.ObjectId,
            ref: "User"
        },
        username: String
    },
    availability: {type: Boolean, default: false},
    season: {
        start: String,
        end: String
    }
});

export default model("Nurseryproduct", nurseryProductSchema);
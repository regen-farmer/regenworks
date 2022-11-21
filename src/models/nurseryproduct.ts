import { Document, model, Schema, Types } from 'mongoose';
import { ISpeciesSchema } from './species';
import { IUserSchema } from './user';

export interface INurseryProductSchema extends Document {
    name: string,
    variety: string,
    species: ISpeciesSchema,
    price: number,
    description: string,
    stock: number,
    class: string,
    pollination: string,
    orderlimit: number,
    rootstock: ISpeciesSchema,
    hybrid: ISpeciesSchema,
    owner: {
        id: IUserSchema
    },
    availability: boolean,
    season: {
        start: string,
        end: string
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
        }
    },
    availability: {type: Boolean, default: false},
    season: {
        start: String,
        end: String
    }
});

export default model("Nurseryproduct", nurseryProductSchema);
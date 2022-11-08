import { Document, model, Schema, Types } from 'mongoose';
import { ISpeciesSchema } from './species';
import { IUserSchema } from './user';

export interface IVarietySchema extends Document {
    name: String,
    species: ISpeciesSchema,
    price: Number,
    description: String,
    class: String,
    pollination: String,
    rootstock: {
        name: String,
        species: ISpeciesSchema
    },
    hybrid: ISpeciesSchema,
    owner: {
        id: IUserSchema,
        username: String
    },
}

// VARIETY SCHEMA SETUP
var varietySchema = new Schema<IVarietySchema>({
    name: String,
    species: {
        type: Schema.Types.ObjectId,
        ref: "Species"
    },
    price: Number,
    description: String,
    class: String,
    pollination: String,
    rootstock: {
        name: String,
        species: {
            type: Schema.Types.ObjectId,
            ref: "Species"
        }
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
});

export default model("Variety", varietySchema);
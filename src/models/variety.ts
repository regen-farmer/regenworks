import { Document, model, Schema, Types } from 'mongoose';
import { ISpeciesSchema } from './species';
import { IUserSchema } from './user';

export interface IVarietySchema extends Document {
    name: string,
    species: ISpeciesSchema,
    price: number,
    description: string,
    class: string,
    pollination: string,
    rootstock: {
        name: string,
        species: ISpeciesSchema
    },
    hybrid: ISpeciesSchema,
    owner: {
        id: IUserSchema
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
        }
    },
});

export default model("Variety", varietySchema);
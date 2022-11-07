import { Document, model, Schema, Types } from 'mongoose';

interface IVarietySchema extends Document {
    name: String,
    species: Types.ObjectId,
    price: Number,
    description: String,
    class: String,
    pollination: String,
    rootstock: {
        name: String,
        species: Types.ObjectId
    },
    hybrid: Types.ObjectId,
    owner: {
        id: Types.ObjectId,
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
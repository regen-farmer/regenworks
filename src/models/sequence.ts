import { Document, model, Schema, Types } from 'mongoose';

// @ts-ignore
interface ISequenceSchema extends Document {
    name: String,
    description: String,
    model: [
        {
            species: Types.ObjectId,
            position: Number
        }
    ],
    owner: {
        id: Types.ObjectId,
        username: String
    },
    sequencelength: Number
}

// SEQUENCE SCHEMA SETUP
var sequenceSchema = new Schema<ISequenceSchema>({
    name: String,
    description: String,
    model: [
        {
            species: {
                type: Schema.Types.ObjectId,
                ref: "Species"
            },
            position: Number
        }
    ],
    owner: {
        id: {
            type: Schema.Types.ObjectId,
            ref: "User"
        },
        username: String
    },
    sequencelength: Number
});

export default model("Sequence", sequenceSchema);
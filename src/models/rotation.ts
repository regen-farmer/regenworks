import { Document, model, Schema, Types } from 'mongoose';

// @ts-ignore
interface IRotationSchema extends Document {
    name: String,
    description: String,
    model: [
        {
            speciesmix: [
                {
                    species: Types.ObjectId,
                    amount: Number
                }
            ],
            planting: {
                year: Number,
                month: Number
            },
            harvest: {
                year: Number,
                month: Number
            }
        }
    ],
    owner: {
        id: Types.ObjectId,
        username: String
    }
}

// ROTATION SCHEMA SETUP
var rotationSchema = new Schema<IRotationSchema>({
    name: String,
    description: String,
    model: [
        {
            speciesmix: [
                {
                    species: {
                        type: Schema.Types.ObjectId,
                        ref: "Species"
                    },
                    amount: Number
                }
            ],
            planting: {
                year: Number,
                month: Number
            },
            harvest: {
                year: Number,
                month: Number
            }
        }
    ],
    owner: {
        id: {
            type: Schema.Types.ObjectId,
            ref: "User"
        },
        username: String
    }
});

export default model("Rotation", rotationSchema);
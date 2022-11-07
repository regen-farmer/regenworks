import { Document, model, Schema, Types } from 'mongoose';

interface IAreaSchema extends Document {
    name: String,
    description: String,
    geometry: String,
    size: Number,
    rotation: Types.ObjectId,
    owner: {
        id: Types.ObjectId,
        username: String
    },
    activities: Types.ObjectId[],
    farmflows: Types.ObjectId[],
    notes: Types.ObjectId[]
}

// AREA SCHEMA SETUP
var areaSchema = new Schema<IAreaSchema>({
    name: String,
    description: String,
    geometry: String,
    size: Number,
    rotation: {
        type: Schema.Types.ObjectId,
        ref: "Rotation"
    },
    owner: {
        id: {
            type: Schema.Types.ObjectId,
            ref: "User"
        },
        username: String
    },
    activities: [
        {
            type: Schema.Types.ObjectId,
            ref: "Activity"
        }
    ],
    farmflows: [
        {
            type: Schema.Types.ObjectId,
            ref: "Farmflow"
        }
    ],
    notes: [
        {
            type: Schema.Types.ObjectId,
            ref: "Note"
        }
    ]
});

export default model("Area", areaSchema);
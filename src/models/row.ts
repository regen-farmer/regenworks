import { Document, model, Schema, Types } from 'mongoose';

interface IRowSchema extends Document {
    geometry: String,
    sequence: Types.ObjectId,
    name: String,
    assets: [
        Types.ObjectId
    ],
    activities: [
        Types.ObjectId    ],
    farmflows: [
        Types.ObjectId
    ],
    notes: [
        Types.ObjectId
    ]
}

// ROW SCHEMA SETUP
var rowSchema = new Schema<IRowSchema>({
    geometry: String,
    sequence: {
        type: Schema.Types.ObjectId,
        ref: "Sequence"
    },
    name: String,
    assets: [
        {
            type: Schema.Types.ObjectId,
            ref: "Asset"
        }
    ],
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

export default model("Row", rowSchema);
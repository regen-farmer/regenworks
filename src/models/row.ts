import { Document, model, Schema, Types } from 'mongoose';
import { IActivitySchema } from './activity';
import { IAssetSchema } from './asset';
import { IFarmFlowSchema } from './farmflow';
import { INoteSchema } from './note';
import { ISequenceSchema } from './sequence';

export interface IRowSchema extends Document {
    geometry: String,
    sequence: ISequenceSchema,
    name: String,
    assets: [
        IAssetSchema
    ],
    activities: [
        IActivitySchema    ],
    farmflows: [
        IFarmFlowSchema
    ],
    notes: [
        INoteSchema
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
import { Document, model, Schema, Types } from 'mongoose';
import { IActivitySchema } from './activity';
import { IFarmFlowSchema } from './farmflow';
import { INoteSchema } from './note';
import { IRotationSchema } from './rotation';
import { IUserSchema } from './user';

export interface IAreaSchema extends Document {
    name: String,
    description: String,
    geometry: String,
    size: Number,
    rotation: IRotationSchema,
    owner: {
        id: IUserSchema,
        username: String
    },
    activities: IActivitySchema[],
    farmflows: IFarmFlowSchema[],
    notes: INoteSchema[]
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
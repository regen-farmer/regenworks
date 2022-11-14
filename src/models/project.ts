import { Document, model, Schema, Types } from 'mongoose';
import { IActivitySchema } from './activity';
import { IAreaSchema } from './area';
import { IAssetSchema } from './asset';
import { IBudgetSchema } from './budget';
import { ILayerSchema } from './layer';
import { IRowSchema } from './row';
import { ISystemSchema } from './system';
import { IUserSchema } from './user';

export interface IProjectSchema extends Document {
    name: string,
    description: string,
    location: string,
    lat: number,
    lng: number,
    assets: [
        IAssetSchema
    ],
    owner: {
        id: IUserSchema,
        username: string
    },
    layer: ILayerSchema,
    activities: IActivitySchema[],
    system: ISystemSchema,
    edgesystem:ISystemSchema,
    budgets: {
        establishment: IBudgetSchema,
        management: IBudgetSchema
    },
    financial: {
        discountRate: number,
        period: number
    },
    layout: {type: string, default: "straight"},
    alignment: {type: string, default: "north"},
    bearing: {type: number, default: 0},
    headland: {type: number, default: 0},
    bearingline: string,
    status: string,
    rows: [
        IRowSchema
    ],
    areas: [
        IAreaSchema
    ]
}

// PROJECT SCHEMA SETUP
var projectSchema = new Schema<IProjectSchema>({
    name: String,
    description: String,
    location: String,
    lat: Number,
    lng: Number,
    assets: [
        {
            type: Schema.Types.ObjectId,
            ref: "Asset"
        }
    ],
    owner: {
        id: {
            type: Schema.Types.ObjectId,
            ref: "User"
        },
        username: String
    },
    layer: {
        type: Schema.Types.ObjectId,
        ref: "Layer"
    },
    activities: [
        {
            type: Schema.Types.ObjectId,
            ref: "Activity"
        }
    ],
    system: {
        type: Schema.Types.ObjectId,
        ref: "System"
    },
    edgesystem:{
        type: Schema.Types.ObjectId,
        ref: "System"
    },
    budgets: {
        establishment: {
            type: Schema.Types.ObjectId,
            ref: "Budget"
        },
        management: {
            type: Schema.Types.ObjectId,
            ref: "Budget"
        }
    },
    financial: {
        discountRate: Number,
        period: Number
    },
    layout: {type: String, default: "straight"},
    alignment: {type: String, default: "north"},
    bearing: {type: Number, default: 0},
    headland: {type: Number, default: 0},
    bearingline: String,
    status: String,
    rows: [
        {
            type: Schema.Types.ObjectId,
            ref: "Row"
        }
    ],
    areas: [
        {
            type: Schema.Types.ObjectId,
            ref: "Area"
        }
    ]
});

export default model("Project", projectSchema);
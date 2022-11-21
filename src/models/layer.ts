import { Document, model, Schema, Types } from 'mongoose';
import { IAreaSchema } from './area';
import { IAssetSchema } from './asset';
import { IBudgetSchema } from './budget';
import { IProjectSchema } from './project';
import { IRowSchema } from './row';
import { ISaptestSchema } from './saptest';
import { ISoiltestSchema } from './soiltest';
import { ISystemSchema } from './system';
import { IUserSchema } from './user';

export interface ILayerSchema extends Document {
    name: string,
    description: string,
    type: string,
    owner: {
        id: IUserSchema
    },
    climate: {
        monthlyaveragetemp: {
            january: number,
            february: number,
            march: number,
            april: number,
            may: number,
            june: number,
            july: number,
            august: number,
            september: number,
            october: number,
            november: number,
            december: number
        },
        annualaverageprec: number,
        monthlyaverageprec: {
            january: number,
            february: number,
            march: number,
            april: number,
            may: number,
            june: number,
            july: number,
            august: number,
            september: number,
            october: number,
            november: number,
            december: number
        }
    },
    geometry: string,
    lat: number,
    lng: number,
    size: number,
    systems: {
        past: [
            ISystemSchema
        ],
        present: ISystemSchema,
        future: [
            ISystemSchema
        ]
    },
    projects: [
        IProjectSchema
    ],
    assets: [
        IAssetSchema
    ],
    alignment: string,
    layout: string,
    headland: number,
    rows: IRowSchema[],
    areas: [
        IAreaSchema
    ],
    soiltests: [
        ISoiltestSchema
    ],
    saptests: [
        ISaptestSchema
    ],
    accounts: IBudgetSchema
}

// LAYER SCHEMA SETUP
var layerSchema = new Schema<ILayerSchema>({
    name: String,
    description: String,
    type: String,
    owner: {
        id: {
            type: Schema.Types.ObjectId,
            ref: "User"
        }
    },
    climate: {
        monthlyaveragetemp: {
            january: Number,
            february: Number,
            march: Number,
            april: Number,
            may: Number,
            june: Number,
            july: Number,
            august: Number,
            september: Number,
            october: Number,
            november: Number,
            december: Number
        },
        annualaverageprec: Number,
        monthlyaverageprec: {
            january: Number,
            february: Number,
            march: Number,
            april: Number,
            may: Number,
            june: Number,
            july: Number,
            august: Number,
            september: Number,
            october: Number,
            november: Number,
            december: Number
        }
    },
    geometry: String,
    lat: Number,
    lng: Number,
    size: Number,
    systems: {
        past: [
            {
                type: Schema.Types.ObjectId,
                ref: "System"
            }
        ],
        present: {
            type: Schema.Types.ObjectId,
            ref: "System"
        },
        future: [
            {
                type: Schema.Types.ObjectId,
                ref: "System"
            }
        ]
    },
    projects: [
        {
            type: Schema.Types.ObjectId,
            ref: "Project"
        }
    ],
    assets: [
        {
            type: Schema.Types.ObjectId,
            ref: "Asset"
        }
    ],
    alignment: String,
    layout: String,
    headland: Number,
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
    ],
    soiltests: [
        {
            type: Schema.Types.ObjectId,
            ref: "Soiltest"
        }
    ],
    saptests: [
        {
            type: Schema.Types.ObjectId,
            ref: "Saptest"
        }
    ],
    accounts: {
        type: Schema.Types.ObjectId,
        ref: "Budget"
    }
});

export default model("Layer", layerSchema);
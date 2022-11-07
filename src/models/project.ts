import { Document, model, Schema, Types } from 'mongoose';

interface IProjectSchema extends Document {
    name: String,
    description: String,
    location: String,
    lat: Number,
    lng: Number,
    assets: [
        Types.ObjectId
    ],
    owner: {
        id: Types.ObjectId,
        username: String
    },
    layer: Types.ObjectId,
    activities: [
        Types.ObjectId
    ],
    system: Types.ObjectId,
    edgesystem:Types.ObjectId,
    budgets: {
        establishment: Types.ObjectId,
        management: Types.ObjectId
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
        Types.ObjectId
    ],
    areas: [
        Types.ObjectId
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
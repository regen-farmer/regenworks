import { Document, model, Schema, Types } from 'mongoose';
// var GeoJSON = require("mongoose-geojson-schema");

interface ILayerSchema extends Document {
    name: String,
    description: String,
    type: String,
    owner: {
        id: Types.ObjectId,
        username: String
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
            Types.ObjectId
        ],
        present: Types.ObjectId,
        future: [
            Types.ObjectId
        ]
    },
    projects: [
        Types.ObjectId
    ],
    assets: [
        Types.ObjectId
    ],
    alignment: String,
    layout: String,
    headland: Number,
    rows: [
        Types.ObjectId
    ],
    areas: [
        Types.ObjectId
    ],
    soiltests: [
        Types.ObjectId
    ],
    saptests: [
        Types.ObjectId
    ],
    accounts: Types.ObjectId
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
        },
        username: String
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
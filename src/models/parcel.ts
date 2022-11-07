import { Document, model, Schema, Types } from 'mongoose';
// var GeoJSON = require("mongoose-geojson-schema");

interface IParcelSchema extends Document {
    name: String,
    agType: [
        {
            type: String
        }
    ],
    description: String,
    soilType: String,
    size: Number,
    location: String,
    lat: Number,
    lng: Number,
    geometry: String,
    owner: {
        id: Types.ObjectId,
        username: String
    },
    practices: [
        Types.ObjectId
     ],
    layers: [
        Types.ObjectId
    ],
    projects: [
        Types.ObjectId
    ],
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
        },
        hardiness: {
            low: Number,
            high: Number
        }
    },
    measurement: String
}

// PARCEL SCHEMA SETUP
var parcelSchema = new Schema<IParcelSchema>({
    name: String,
    agType: [
        {
            type: String
        }
    ],
    description: String,
    soilType: String,
    size: Number,
    location: String,
    lat: Number,
    lng: Number,
    geometry: String,
    owner: {
        id: {
            type: Schema.Types.ObjectId,
            ref: "User"
        },
        username: String
    },
    practices: [
        {
            type: Schema.Types.ObjectId,
            ref: "Practice"
        }
     ],
    layers: [
        {
            type: Schema.Types.ObjectId,
            ref: "Layer"
        }
    ],
    projects: [
        {
            type: Schema.Types.ObjectId,
            ref: "Project"
        }
    ],
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
        },
        hardiness: {
            low: Number,
            high: Number
        }
    },
    measurement: String
});

export default model("Parcel", parcelSchema);
import { Document, model, Schema, Types } from 'mongoose';

interface ISoiltestSchema {
    name: String,
    description: String,
    lat: Number,
    lng: Number,
    depth: Number,
    physical: {
        clay: Number,
        silt: Number,
        sand: Number
    },
    sampleDate: Date,
    compaction: Number,
    fertility: {
        conductivity: Number,
        pH: Number,
        SOM: Number,
        nitrogen: Number,
        phosphorus: Number,
        lime: Number,
        calcium: Number,
        magnesium: Number,
        potasium: Number,
        sodium: Number
    },
    microelements: {
        boron: Number,
        iron: Number,
        magnezium: Number,
        copper: Number,
        zinc: Number
    },
    owner: {
        id: Types.ObjectId,
        username: String
    }
}

// SOIL TEST SCHEMA SETUP
var soiltestSchema = new Schema<ISoiltestSchema>({
    name: String,
    description: String,
    lat: Number,
    lng: Number,
    depth: Number,
    physical: {
        clay: Number,
        silt: Number,
        sand: Number
    },
    sampleDate: Date,
    compaction: Number,
    fertility: {
        conductivity: Number,
        pH: Number,
        SOM: Number,
        nitrogen: Number,
        phosphorus: Number,
        lime: Number,
        calcium: Number,
        magnesium: Number,
        potasium: Number,
        sodium: Number
    },
    microelements: {
        boron: Number,
        iron: Number,
        magnezium: Number,
        copper: Number,
        zinc: Number
    },
    owner: {
        id: {
            type: Schema.Types.ObjectId,
                ref: "User"
        },
        username: String
    }
});

export default model("Soiltest", soiltestSchema);
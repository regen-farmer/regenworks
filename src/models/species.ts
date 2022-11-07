import mongoose from "mongoose";

// SPECIES SCHEMA SETUP
var speciesSchema = new mongoose.Schema({
    nameCommon: String,
    genus: String,
    species: String,
    family: String,
    origin: String,
    invasive: String,
    temperature: {
        min: Number,
        max: Number
    },
    precipitation: {
        min: Number,
        max: Number
    },
    cultivation: String,
    form: String,
    management: String,
    stapleCrop: String,
    industrialCrop: String,
    fodder: String,
    classsyntropic: {
        strata: String,
        lifecycle: String
    },
    lifespan: Number,
    height: Number,
    width: Number,
    flows: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Flow"
        }
    ],
    utilities: [String],
    nutrients: {
        fat: Number,
        carb: Number,
        protein: Number
    },
    activities: [
        {
            activityType: String,
            subtype: String,
            name: String,
            time: {
                startMonth: Number,
                endMonth: Number
            },
            price: {type: Number, default: 0}
        }
    ],
    price: Number
});

export default mongoose.model("Species", speciesSchema);
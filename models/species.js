var mongoose = require("mongoose");

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
    utilities: [String]
});

module.exports = mongoose.model("Species", speciesSchema);
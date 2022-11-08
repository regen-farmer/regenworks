import { Document, model, Schema, Types } from 'mongoose';
import { IFlowSchema } from './flow';

export interface ISpeciesSchema extends Document {
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
        IFlowSchema
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
            price: {type: Number, default: Number}
        }
    ],
    price: Number
}

// SPECIES SCHEMA SETUP
var speciesSchema = new Schema<ISpeciesSchema>({
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
            type: Schema.Types.ObjectId,
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

export default model("Species", speciesSchema);
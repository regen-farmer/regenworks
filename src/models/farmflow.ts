import { Document, model, Schema, Types } from 'mongoose';
import { ISpeciesSchema } from './species';

export interface IFarmFlowSchema extends Document {
    name: String,
    description: String,
    type: String,
    unit: String,
    timeframe: String,
    source: String,
    timestamp: Date,
    amount: Number,
    species: ISpeciesSchema
}

// FLOW SCHEMA SETUP
var farmflowSchema = new Schema<IFarmFlowSchema>({
    name: String,
    description: String,
    type: String,
    unit: String,
    timeframe: String,
    source: String,
    timestamp: Date,
    amount: Number,
    species: {
        type: Schema.Types.ObjectId,
        ref: "Species"
    }
});

export default model("Farmflow", farmflowSchema);
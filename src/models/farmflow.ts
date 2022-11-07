import { Document, model, Schema, Types } from 'mongoose';

interface IFarmFlowSchema extends Document {
    name: String,
    description: String,
    type: String,
    unit: String,
    timeframe: String,
    source: String,
    timestamp: Date,
    amount: Number,
    species: Types.ObjectId
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
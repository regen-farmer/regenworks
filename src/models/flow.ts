import { Document, model, Schema } from 'mongoose';

export interface IFlowSchema extends Document {
    name: String,
    type: String,
    unit: String,
    timeframe: String,
    data: Number[],
    source: String
}

// FLOW SCHEMA SETUP
var flowSchema = new Schema<IFlowSchema>({
    name: String,
    type: String,
    unit: String,
    timeframe: String,
    data: [Number],
    source: String
});

export default model("Flow", flowSchema);
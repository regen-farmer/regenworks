import { Document, model, Schema } from 'mongoose';

export interface IFlowSchema extends Document {
    name: string,
    type: string,
    unit: string,
    timeframe: string,
    data: number[],
    source: string
}

// FLOW SCHEMA SETUP
const flowSchema = new Schema<IFlowSchema>({
  name: String,
  type: String,
  unit: String,
  timeframe: String,
  data: [Number],
  source: String,
});

export default model('Flow', flowSchema);

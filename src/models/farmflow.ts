import { Document, model, Schema } from 'mongoose';
import { ISpeciesSchema } from './species';

export interface IFarmFlowSchema extends Document {
    name: string,
    description: string,
    type: string,
    unit: string,
    timeframe: string,
    source: string,
    timestamp: Date,
    amount: number,
    species: ISpeciesSchema
}

// FLOW SCHEMA SETUP
const farmflowSchema = new Schema<IFarmFlowSchema>({
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
    ref: 'Species',
  },
});

export default model('Farmflow', farmflowSchema);

import { model, Schema, HydratedDocument } from 'mongoose';
import { ISpeciesSchema } from './species.js';

export interface IFarmFlowSchema {
    name: string,
    description: string,
    type: string,
    unit: string,
    timeframe: string,
    source: string,
    timestamp: Date,
    amount: number,
    species: HydratedDocument<ISpeciesSchema>
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

const FarmFlow = model('Farmflow', farmflowSchema);
export default FarmFlow;
export type FarmFlowDocument = ReturnType<(typeof FarmFlow)['hydrate']>;

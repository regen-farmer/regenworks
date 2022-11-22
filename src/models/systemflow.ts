import { Document, model, Schema } from 'mongoose';
import { ISpeciesSchema } from './species';
import { ISystemSchema } from './system';

export interface ISystemflowSchema extends Document {
    name: string,
    type: string,
    unit: string,
    timeframe: string,
    location: string,
    data: [
        {
            species: ISpeciesSchema,
            data: [number]
        }
    ],
    source: string,
    systemref: ISystemSchema
}

// SYSTEM FLOW SCHEMA SETUP
const systemflowSchema = new Schema<ISystemflowSchema>({
  name: String,
  type: String,
  unit: String,
  timeframe: String,
  location: String,
  data: [
    {
      species: {
        type: Schema.Types.ObjectId,
        ref: 'Species',
      },
      data: [Number],
    },
  ],
  source: String,
  systemref: {
    type: Schema.Types.ObjectId,
    ref: 'System',
  },
});

export default model('Systemflow', systemflowSchema);

import { model, Schema, HydratedDocument } from 'mongoose';
import { ISpeciesSchema } from './species';
import { ISystemSchema } from './system';

export interface ISystemflowSchema {
    name: string,
    type: string,
    unit: string,
    timeframe: string,
    location: string,
    data: [
        {
            species: HydratedDocument<ISpeciesSchema>,
            data: [number]
        }
    ],
    source: string,
    systemref: HydratedDocument<ISystemSchema>
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

const Systemflow = model('Systemflow', systemflowSchema);
export default Systemflow;
export type SystemflowDocument = ReturnType<(typeof Systemflow)['hydrate']>;

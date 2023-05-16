import { model, Schema, HydratedDocument } from 'mongoose';
import { ISpeciesSchema } from './species';

export interface ISystemDesignSchema {
  rows: {
      sequence: {
      species?: HydratedDocument<ISpeciesSchema>,
      spacingAfter?: number
    }[],
    headland?: {
      before?: number,
      after?: number
    },
    offset?: {
      before?: number,
      after?: number
    },
    groundcover?: HydratedDocument<ISpeciesSchema>,
    width: number
  }[],
  layout: string,
  alignment: string,
  bearing: number,
  headland: number,
  bearingline: string,
}

const systemdesignSchema = new Schema<ISystemDesignSchema>({

  rows: [{
    sequence: [{
      species: {
        type: Schema.Types.ObjectId,
        ref: 'Species',
      },
      spacingAfter: Number,
    }],
    headland: {
      before: Number,
      after: Number,
    },
    offset: {
      before: Number,
      after: Number,
    },
    groundcover: {
      type: Schema.Types.ObjectId,
      ref: 'Species',
    },
    width: Number,
  }],
  layout: { type: String, default: 'straight' },
  alignment: { type: String, default: 'north' },
  bearing: { type: Number, default: 0 },
  headland: { type: Number, default: 0 },
  bearingline: String,
});

const SystemDesign = model('SystemDesign', systemdesignSchema);
export default SystemDesign;
export type SystemDesignDocument = ReturnType<(typeof SystemDesign)['hydrate']>;

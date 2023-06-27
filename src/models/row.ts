import { model, Schema, HydratedDocument } from 'mongoose';
import { IActivitySchema } from './activity.js';
import { IAssetSchema } from './asset.js';
import { IFarmFlowSchema } from './farmflow.js';
import { INoteSchema } from './note.js';
import { ISequenceSchema } from './sequence.js';

export interface IRowSchema {
    geometry: string,
    sequence: HydratedDocument<ISequenceSchema>,
    name: string,
    assets: [
        HydratedDocument<IAssetSchema>
    ],
    activities: [
      HydratedDocument<IActivitySchema> ],
    farmflows: [
        HydratedDocument<IFarmFlowSchema>
    ],
    notes: [
        HydratedDocument<INoteSchema>
    ],
    rowlength: number
}

// ROW SCHEMA SETUP
const rowSchema = new Schema<IRowSchema>({
  geometry: String,
  sequence: {
    type: Schema.Types.ObjectId,
    ref: 'Sequence',
  },
  name: String,
  assets: [
    {
      type: Schema.Types.ObjectId,
      ref: 'Asset',
    },
  ],
  activities: [
    {
      type: Schema.Types.ObjectId,
      ref: 'Activity',
    },
  ],
  farmflows: [
    {
      type: Schema.Types.ObjectId,
      ref: 'Farmflow',
    },
  ],
  notes: [
    {
      type: Schema.Types.ObjectId,
      ref: 'Note',
    },
  ],
  rowlength: Number,
});

const Row = model('Row', rowSchema);
export default Row;
export type RowDocument = ReturnType<(typeof Row)['hydrate']>;

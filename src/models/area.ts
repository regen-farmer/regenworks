import { model, Schema, HydratedDocument } from 'mongoose';
import { IActivitySchema } from './activity.js';
import { IFarmFlowSchema } from './farmflow.js';
import { INoteSchema } from './note.js';
import { IRotationSchema } from './rotation.js';
import { IUserSchema } from './user.js';

export interface IAreaSchema {
    name: string,
    description: string,
    geometry: string,
    size: number,
    rotation: HydratedDocument<IRotationSchema>,
    owner: {
        id: HydratedDocument<IUserSchema>
    },
    activities: HydratedDocument<IActivitySchema>[],
    farmflows: HydratedDocument<IFarmFlowSchema>[],
    notes: HydratedDocument<INoteSchema>[]
}

// AREA SCHEMA SETUP
const areaSchema = new Schema<IAreaSchema>({
  name: String,
  description: String,
  geometry: String,
  size: Number,
  rotation: {
    type: Schema.Types.ObjectId,
    ref: 'Rotation',
  },
  owner: {
    id: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
  },
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
});

const Area = model('Area', areaSchema);

export default Area;

export type AreaDocument = ReturnType<(typeof Area)['hydrate']>;

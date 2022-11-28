import { Document, model, Schema } from 'mongoose';
import { IActivitySchema } from './activity';
import { IFarmFlowSchema } from './farmflow';
import { INoteSchema } from './note';
import { IRotationSchema } from './rotation';
import { IUserSchema } from './user';

export interface IAreaSchema extends Document {
    name: string,
    description: string,
    geometry: string,
    size: number,
    rotation: IRotationSchema,
    owner: {
        id: IUserSchema
    },
    activities: IActivitySchema[],
    farmflows: IFarmFlowSchema[],
    notes: INoteSchema[]
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

export default model('Area', areaSchema);

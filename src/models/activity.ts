import {
  model, Schema, HydratedDocument,
} from 'mongoose';
import { ILayerSchema } from './layer';
import { ISpeciesSchema } from './species';
import { IUserSchema } from './user';

export interface IActivitySchema {
    _id: string;
    name: string,
    description: string,
    start: {
        date: string,
        time: string
    },
    end: {
        date: string,
        time: string
    },
    time: number,
    status: boolean,
    activityType: string,
    subtype: string,
    automated: boolean,
    owner: {
        id: HydratedDocument<IUserSchema>
    },
    layer: HydratedDocument<ILayerSchema>
    species: HydratedDocument<ISpeciesSchema>
}

// ACTIVITY SCHEMA SETUP
const activitySchema = new Schema<IActivitySchema>({
  name: String,
  description: String,
  start: {
    date: String,
    time: String,
  },
  end: {
    date: String,
    time: String,
  },
  time: Number,
  status: Boolean,
  activityType: String,
  subtype: String,
  automated: Boolean,
  owner: {
    id: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  layer: {
    type: Schema.Types.ObjectId,
    ref: 'Layer',
  },
  species: {
    type: Schema.Types.ObjectId,
    ref: 'Species',
  },
});

const Activity = model('Activity', activitySchema);

export default Activity;

export type ActivityDocument = ReturnType<(typeof Activity)['hydrate']>;

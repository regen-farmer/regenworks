import { model, Schema, HydratedDocument } from 'mongoose';
import { IActivitySchema } from './activity';
import { IAreaSchema } from './area';
import { IAssetSchema } from './asset';
import { IBudgetSchema } from './budget';
import { ILayerSchema } from './layer';
import { IRowSchema } from './row';
import { ISystemSchema } from './system';
import { ISystemDesignSchema } from './systemdesign';
import { IUserSchema } from './user';

export interface IProjectSchema {
    name: string,
    description: string,
    location: string,
    lat: number,
    lng: number,
    assets: [
        HydratedDocument<IAssetSchema>
    ],
    owner: {
        id: HydratedDocument<IUserSchema>|string
    },
    layer: HydratedDocument<ILayerSchema>,
    activities: HydratedDocument<IActivitySchema>[],
    system: HydratedDocument<ISystemSchema>,
    systemdesign: HydratedDocument<ISystemDesignSchema>,
    edgesystem:HydratedDocument<ISystemSchema>,
    budgets: {
        establishment: HydratedDocument<IBudgetSchema>,
        management: HydratedDocument<IBudgetSchema>
    },
    financial: {
        discountRate: number,
        period: number
    },
    layout: string,
    alignment: string,
    bearing: number,
    headland: number,
    bearingline: string,
    status: string,
    rows: HydratedDocument<IRowSchema>[],
    areas: HydratedDocument<IAreaSchema>[]
}

// PROJECT SCHEMA SETUP
const projectSchema = new Schema<IProjectSchema>({
  name: String,
  description: String,
  location: String,
  lat: Number,
  lng: Number,
  assets: [
    {
      type: Schema.Types.ObjectId,
      ref: 'Asset',
    },
  ],
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
  activities: [
    {
      type: Schema.Types.ObjectId,
      ref: 'Activity',
    },
  ],
  system: {
    type: Schema.Types.ObjectId,
    ref: 'System',
  },
  systemdesign: {
    type: Schema.Types.ObjectId,
    ref: 'SystemDesign',
  },
  edgesystem: {
    type: Schema.Types.ObjectId,
    ref: 'System',
  },
  budgets: {
    establishment: {
      type: Schema.Types.ObjectId,
      ref: 'Budget',
    },
    management: {
      type: Schema.Types.ObjectId,
      ref: 'Budget',
    },
  },
  financial: {
    discountRate: Number,
    period: Number,
  },
  layout: { type: String, default: 'straight' },
  alignment: { type: String, default: 'north' },
  bearing: { type: Number, default: 0 },
  headland: { type: Number, default: 0 },
  bearingline: String,
  status: String,
  rows: [
    {
      type: Schema.Types.ObjectId,
      ref: 'Row',
    },
  ],
  areas: [
    {
      type: Schema.Types.ObjectId,
      ref: 'Area',
    },
  ],
});

const Project = model('Project', projectSchema);
export default Project;
export type ProjectDocument = ReturnType<(typeof Project)['hydrate']>;

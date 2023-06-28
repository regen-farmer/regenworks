import { model, Schema, HydratedDocument } from 'mongoose';
import { ISpeciesSchema } from './species.js';
import { IUserSchema } from './user.js';

export interface IAssetSchema {
    name: string,
    description: string,
    typeAsset: string,
    amount: number,
    species: HydratedDocument<ISpeciesSchema>,
    value: number,
    creation: number,
    determination: number,
    lat: number,
    lng: number,
    owner: {
        id: HydratedDocument<IUserSchema>|string
    }
}

// ASSET SCHEMA SETUP
const assetSchema = new Schema<IAssetSchema>({
  name: String,
  description: String,
  typeAsset: String,
  amount: Number,
  species: {
    type: Schema.Types.ObjectId,
    ref: 'Species',
  },
  value: Number,
  creation: Number,
  determination: Number,
  lat: Number,
  lng: Number,
  owner: {
    id: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
  },
});

const Asset = model('Asset', assetSchema);

export default Asset;

export type AssetDocument = ReturnType<(typeof Asset)['hydrate']>;

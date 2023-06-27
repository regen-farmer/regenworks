import { model, Schema, HydratedDocument } from 'mongoose';
import { INurseryProductSchema } from './nurseryproduct.js';
import { IUserSchema } from './user.js';

export interface INurserySchema {
    name: string,
    location: string,
    currency: string,
    description: string,
    lat: number,
    lng: number,
    range: number,
    owner: {
        id: HydratedDocument<IUserSchema> | string
    },
    products: [
        HydratedDocument<INurseryProductSchema>
    ]
}

// NURSERY SCHEMA SETUP
const nurserySchema = new Schema<INurserySchema>({
  name: String,
  location: String,
  currency: String,
  description: String,
  lat: Number,
  lng: Number,
  range: Number,
  owner: {
    id: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  products: [
    {
      type: Schema.Types.ObjectId,
      ref: 'Nurseryproduct',
    },
  ],
});

const Nursery = model('Nursery', nurserySchema);
export default Nursery;
export type NurseryDocument = ReturnType<(typeof Nursery)['hydrate']>;

import { model, Schema, HydratedDocument } from 'mongoose';
import { ISpeciesSchema } from './species.js';
import { IUserSchema } from './user.js';

export interface INurseryProductSchema {
    name: string,
    variety: string,
    species: HydratedDocument<ISpeciesSchema>,
    price: number,
    description: string,
    stock: number,
    class: string,
    pollination: string,
    orderlimit: number,
    rootstock: HydratedDocument<ISpeciesSchema>,
    hybrid: HydratedDocument<ISpeciesSchema>,
    owner: {
        id: HydratedDocument<IUserSchema>|string
    },
    availability: boolean,
    season: {
        start: string,
        end: string
    }
}

// NURSERY PRODUCT SCHEMA SETUP
const nurseryProductSchema = new Schema<INurseryProductSchema>({
  name: String,
  variety: String,
  species: {
    type: Schema.Types.ObjectId,
    ref: 'Species',
  },
  price: Number,
  description: String,
  stock: Number,
  class: String,
  pollination: String,
  orderlimit: Number,
  rootstock: {
    type: Schema.Types.ObjectId,
    ref: 'Species',
  },
  hybrid: {
    type: Schema.Types.ObjectId,
    ref: 'Species',
  },
  owner: {
    id: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  availability: { type: Boolean, default: false },
  season: {
    start: String,
    end: String,
  },
});

const NurseryProduct = model('Nurseryproduct', nurseryProductSchema);
export default NurseryProduct;
export type NurseryProductDocument = ReturnType<(typeof NurseryProduct)['hydrate']>;

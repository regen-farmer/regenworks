import { model, Schema, HydratedDocument } from 'mongoose';
import { IUserSchema } from './user.js';

export interface IWellSchema {
    name: string,
    description: string,
    geometry: string,
    owner: {
        id: HydratedDocument<IUserSchema>
    }
}

// WELL SCHEMA SETUP
const wellSchema = new Schema<IWellSchema>({
  name: String,
  description: String,
  geometry: String,
  owner: {
    id: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
  },
});

const Well = model('Well', wellSchema);
export default Well;
export type WellDocument = ReturnType<(typeof Well)['hydrate']>;

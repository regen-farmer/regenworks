import { Document, model, Schema } from 'mongoose';
import { IUserSchema } from './user';

export interface IWellSchema extends Document {
    name: string,
    description: string,
    geometry: string,
    owner: {
        id: IUserSchema
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

export default model('Well', wellSchema);

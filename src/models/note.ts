import { Document, model, Schema } from 'mongoose';
import { IUserSchema } from './user';

export interface INoteSchema extends Document {
    name: string,
    description: string,
    owner: {
        id: IUserSchema
    }
}

// NOTE SCHEMA SETUP
const noteSchema = new Schema<INoteSchema>({
  name: String,
  description: String,
  owner: {
    id: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
  },
});

export default model('Note', noteSchema);

import { model, Schema, HydratedDocument } from 'mongoose';
import { IUserSchema } from './user';

export interface INoteSchema {
    name: string,
    description: string,
    owner: {
        id: HydratedDocument<IUserSchema>
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

const Note = model('Note', noteSchema);
export default Note;
export type NoteDocument = ReturnType<(typeof Note)['hydrate']>;

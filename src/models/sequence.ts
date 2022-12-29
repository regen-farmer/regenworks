import { Document, model, Schema } from 'mongoose';
import { ISpeciesSchema } from './species';
import { IUserSchema } from './user';

export interface ISequenceSchema extends Document {
    name: string,
    description: string,
    model: [
        {
            species: ISpeciesSchema,
            position: number
        }
    ],
    owner: {
        id: IUserSchema
    },
    sequencelength: number
}

// SEQUENCE SCHEMA SETUP
const sequenceSchema = new Schema<ISequenceSchema>({
  name: String,
  description: String,
  model: [
    {
      species: {
        type: Schema.Types.ObjectId,
        ref: 'Species',
      },
      position: Number,
    },
  ],
  owner: {
    id: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  sequencelength: Number,
});

export default model('Sequence', sequenceSchema);

import { model, Schema, HydratedDocument } from 'mongoose';
import { ISpeciesSchema } from './species';
import { IUserSchema } from './user';

export interface ISequenceSchema {
    name: string,
    description: string,
    model: [
        {
            species: HydratedDocument<ISpeciesSchema>,
            position: number
        }
    ],
    owner: {
        id: HydratedDocument<IUserSchema>|string
    },
    sequencelength: number,
    uniqueSpecies: {
      activities: [
        {
          activityType: string;
          subtype: string;
          name: string;
          time: {
            startMonth: number;
            endMonth: number;
          };
          price: number;
        },
      ],
      id: HydratedDocument<ISpeciesSchema> | string,
      name: string
    }[],
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
  uniqueSpecies: [{
    name: String,
    id: {
      type: Schema.Types.ObjectId,
      ref: 'Species',
    },
    activities: [
      {
        activityType: String,
        subtype: String,
        name: String,
        time: {
          startMonth: Number,
          endMonth: Number,
        },
        price: { type: Number, default: 0 },
      },
    ],
  }],
});

const Sequence = model('Sequence', sequenceSchema);
export default Sequence;
export type SequenceDocument = ReturnType<(typeof Sequence)['hydrate']>;

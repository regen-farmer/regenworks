import { model, Schema, HydratedDocument } from 'mongoose';
import { ISpeciesSchema } from './species';
import { IUserSchema } from './user';

export interface IRotationSchema {
    name: string,
    description: string,
    model: [
        {
            speciesmix: [
                {
                    species:HydratedDocument<ISpeciesSchema>,
                    amount: number
                }
            ],
            planting: {
                year: number,
                month: number
            },
            harvest: {
                year: number,
                month: number
            }
        }
    ],
    owner: {
        id: HydratedDocument<IUserSchema>| string
    }
}

// ROTATION SCHEMA SETUP
const rotationSchema = new Schema<IRotationSchema>({
  name: String,
  description: String,
  model: [
    {
      speciesmix: [
        {
          species: {
            type: Schema.Types.ObjectId,
            ref: 'Species',
          },
          amount: Number,
        },
      ],
      planting: {
        year: Number,
        month: Number,
      },
      harvest: {
        year: Number,
        month: Number,
      },
    },
  ],
  owner: {
    id: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
  },
});

const Rotation = model('Rotation', rotationSchema);
export default Rotation;
export type RotationDocument = ReturnType<(typeof Rotation)['hydrate']>;

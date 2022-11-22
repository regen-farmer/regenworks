import { Document, model, Schema } from 'mongoose';
import { ISpeciesSchema } from './species';
import { IUserSchema } from './user';

// @ts-ignore
export interface IRotationSchema extends Document {
    name: string,
    description: string,
    model: [
        {
            speciesmix: [
                {
                    species:ISpeciesSchema,
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
        id: IUserSchema
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

export default model('Rotation', rotationSchema);

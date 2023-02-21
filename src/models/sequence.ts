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
      id: ISpeciesSchema | string,
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
			ref: "Species",
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

export default model('Sequence', sequenceSchema);

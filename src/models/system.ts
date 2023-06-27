import { model, Schema, HydratedDocument } from 'mongoose';
import { AnimalDocument } from './animal.js';
import { ISequenceSchema } from './sequence.js';
import { ISpeciesSchema } from './species.js';
import { ISystemflowSchema } from './systemflow.js';
import { IUserSchema } from './user.js';
// import { ISystemDesignSchema } from './systemdesign';

// SYSTEM SCHEMA SETUP

export interface ISystemSchema {
  name: string
  description: string,
  // design: HydratedDocument<ISystemDesignSchema>,
  rows: [{ width: number; sequense: [HydratedDocument<ISequenceSchema>] }]
  model: [
    {
      species: HydratedDocument<ISpeciesSchema>
      position: number[]
      width: number
    }
  ]
  animals: [HydratedDocument<AnimalDocument>]
  owner: {
    id: HydratedDocument<IUserSchema>|string
  }
  shared: boolean
  flows: [HydratedDocument<ISystemflowSchema>]
  occurrences: [
    {
      name: string
      lat: number
      lng: number
      alt: number
      country: string
      source: string
      eco: number
      koppen: string
    }
  ]
  grid: number
  uniqueSpecies: {
    activities: [
      {
        activityType: string
        subtype: string
        name: string
        time: {
          startMonth: number
          endMonth: number
        }
        price: number
      }
    ]
    id: HydratedDocument<ISpeciesSchema> | string
    name: string
  }[]
  uniqueUtilities: string[]
}

const systemSchema = new Schema<ISystemSchema>({
  name: String,
  description: String,
  // design: {
  //   type: Schema.Types.ObjectId,
  //   ref: 'SystemDesign',
  // },
  rows: [
    {
      width: Number,
      sequense: [
        {
          type: Schema.Types.ObjectId,
          ref: 'Species',
        },
      ],
    },
  ],
  model: [
    {
      species: {
        type: Schema.Types.ObjectId,
        ref: 'Species',
      },
      position: [Number],
      width: Number,
    },
  ],
  animals: [
    {
      type: Schema.Types.ObjectId,
      ref: 'Animal',
    },
  ],
  owner: {
    id: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  shared: {
    type: Boolean,
    default: false,
  },
  flows: [
    {
      type: Schema.Types.ObjectId,
      ref: 'Systemflow',
    },
  ],
  occurrences: [
    {
      name: String,
      lat: Number,
      lng: Number,
      alt: Number,
      country: String,
      source: String,
      eco: Number,
      koppen: String,
    },
  ],
  grid: Number,
  uniqueSpecies: [
    {
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
    },
  ],
  uniqueUtilities: [String],
});

const System = model('System', systemSchema);
export default System;
export type SystemDocument = ReturnType<(typeof System)['hydrate']>;

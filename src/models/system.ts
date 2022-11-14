import { Document, model, Schema, Types } from 'mongoose';
import { IAnimalSchema } from './animal';
import { ISequenceSchema } from './sequence';
import { ISpeciesSchema } from './species';
import { ISystemflowSchema } from './systemflow';
import { IUserSchema } from './user';

// SYSTEM SCHEMA SETUP

// @ts-ignore
export interface ISystemSchema extends Document {
    name: string,
    description: string,
    rows: [
        { width: number,
          sequense: [
            ISequenceSchema
          ]
        }

    ],
    model: [
        {
            species: ISpeciesSchema,
            position: [number],
            width: number
        }
    ],
    animals: [
        IAnimalSchema
    ],
    owner: {
        id: IUserSchema,
        username: string
    },
    shared: {
        type: boolean,
        default: false
    },
    flows: [
        ISystemflowSchema
    ],
    occurrences: [
        {
            name: string,
            lat: number,
            lng: number,
            alt: number,
            country: string,
            source: string,
            eco: number,
            koppen: string
        }
    ]
}

  

var systemSchema = new Schema<ISystemSchema>({
    name: String,
    description: String,
    rows: [
        { width: Number,
          sequense: [
              {
                  type: Schema.Types.ObjectId,
                  ref: "Species"
              }
          ]
        }

    ],
    model: [
        {
            species: {
                type: Schema.Types.ObjectId,
                ref: "Species"
            },
            position: [Number],
            width: Number
        }
    ],
    animals: [
        {
            type: Schema.Types.ObjectId,
            ref: "Animal"
        }
    ],
    owner: {
        id: {
            type: Schema.Types.ObjectId,
            ref: "User"
        },
        username: String
    },
    shared: {
        type: Boolean,
        default: false
    },
    flows: [
        {
            type: Schema.Types.ObjectId,
            ref: "Systemflow"
        }
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
            koppen: String
        }
    ]
});

export default model("System", systemSchema);
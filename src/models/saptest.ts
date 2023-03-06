import { model, Schema, HydratedDocument } from 'mongoose';
import { IUserSchema } from './user';

export interface ISaptestSchema {
    name: string,
    description: string,
    lat: number,
    lng: number,
    sampleDate: Date,
    sugars: number,
    pH: number,
    EC: number,
    potassium: number,
    calcium: number,
    magnesium: number,
    sodium: number,
    ammonium: number,
    nitrate: number,
    nInNitrate: number,
    totalN: number,
    chloride: number,
    sulfur: number,
    owner: {
        id: HydratedDocument<IUserSchema>
    }
}

// SAP TEST SCHEMA SETUP
const saptestSchema = new Schema<ISaptestSchema>({
  name: String,
  description: String,
  lat: Number,
  lng: Number,
  sampleDate: Date,
  sugars: Number,
  pH: Number,
  EC: Number,
  potassium: Number,
  calcium: Number,
  magnesium: Number,
  sodium: Number,
  ammonium: Number,
  nitrate: Number,
  nInNitrate: Number,
  totalN: Number,
  chloride: Number,
  sulfur: Number,
  owner: {
    id: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
  },
});

const Saptest = model('Saptest', saptestSchema);
export default Saptest;
export type SaptestDocument = ReturnType<(typeof Saptest)['hydrate']>;

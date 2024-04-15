import { model, Schema, HydratedDocument } from 'mongoose';
// import passportLocalMongoose from "passport-local-mongoose"; // MAKES THE HASH AND SALT IN THE USER MODEL AUTOMATICALLY?
import { INurserySchema } from './nursery.js';
import { IParcelSchema } from './parcel.js';

export interface IUserSchema {
    externalId: string,
    stripeCustomerId: string,
    username: string,
    password: string,
    email: string,
    resetPasswordToken: string,
    resetPasswordExpires: Date,
    parcels: [
        HydratedDocument<IParcelSchema>
    ],
    currentProject: HydratedDocument<IParcelSchema>,
    countryCode: string,
    registrationDate: number,
    membership: number,
    farmLimit: number,
    haLimit: number,
    isAdmin: boolean,
    isNursery: boolean,
    isManagement: boolean,
    isProject: boolean,
    nurseries: [
        HydratedDocument<INurserySchema>
    ]
}

const UserSchema = new Schema({
  externalId: { type: String, unique: true, require: false },
  stripeCustomerId: { type: String, unique: true, require: false },
  username: { type: String, unique: false, require: false },
  password: String,
  email: { type: String, unique: true, require: false },
  resetPasswordToken: String,
  resetPasswordExpires: Date,
  parcels: [
    {
      type: Schema.Types.ObjectId,
      ref: 'Parcel',
    },
  ],
  currentProject: {
    type: Schema.Types.ObjectId,
    ref: 'Parcel',
  },
  countryCode: { type: String, default: '', require: false },
  registrationDate: Number,
  membership: Number,
  farmLimit: Number,
  haLimit: { type: Number, default: 5 },
  isAdmin: { type: Boolean, default: false },
  isNursery: { type: Boolean, default: false },
  isManagement: { type: Boolean, default: false },
  isProject: { type: Boolean, default: false },
  nurseries: [
    {
      type: Schema.Types.ObjectId,
      ref: 'Nursery',
    },
  ],
});

// UserSchema.plugin(passportLocalMongoose);

const User = model<IUserSchema>('User', UserSchema);
export default User;
export type UserDocument = ReturnType<(typeof User)['hydrate']>;

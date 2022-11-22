import { Document, model, Schema } from 'mongoose';
// import passportLocalMongoose from "passport-local-mongoose"; // MAKES THE HASH AND SALT IN THE USER MODEL AUTOMATICALLY?
import { INurserySchema } from './nursery';
import { IParcelSchema } from './parcel';

export interface IUserSchema extends Document {
    externalId: string,
    username: string,
    password: string,
    email: string,
    resetPasswordToken: string,
    resetPasswordExpires: Date,
    parcels: [
        IParcelSchema
    ],
    currentProject: IParcelSchema,
    registrationDate: number,
    membership: number,
    farmLimit: number,
    haLimit: number,
    isAdmin: boolean,
    isNursery: boolean,
    isManagement: boolean,
    isProject: boolean,
    nurseries: [
        INurserySchema
    ]
}

const UserSchema = new Schema({
  externalId: { type: String, unique: true, require: false },
  username: { type: String, unique: false, require: false },
  password: String,
  email: { type: String, unique: true, require: true },
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

export default model<IUserSchema>('User', UserSchema);

import { Document, model, Schema, Types } from 'mongoose';
import passportLocalMongoose from "passport-local-mongoose"; // MAKES THE HASH AND SALT IN THE USER MODEL AUTOMATICALLY?

interface IUserSchema extends Document {
    username: {type: String, unique: true, require: true},
    password: String,
    email: {type: String, unique: true, require: true},
    resetPasswordToken: String,
    resetPasswordExpires: Date,
    parcels: [
        Types.ObjectId
    ],
    currentProject: Types.ObjectId,
    registrationDate: Number,
    membership: Number,
    farmLimit: Number,
    haLimit: {type: Number, default: 5},
    isAdmin: {type: Boolean, default: false},
    isNursery: {type: Boolean, default: false},
    isManagement: {type: Boolean, default: false},
    isProject: {type: Boolean, default: false},
    nurseries: [
        Types.ObjectId
    ]
}

var UserSchema = new Schema({
    username: {type: String, unique: true, require: true},
    password: String,
    email: {type: String, unique: true, require: true},
    resetPasswordToken: String,
    resetPasswordExpires: Date,
    parcels: [
        {
            type: Schema.Types.ObjectId,
            ref: "Parcel"
        }
    ],
    currentProject: {
            type: Schema.Types.ObjectId,
            ref: "Parcel"
    },
    registrationDate: Number,
    membership: Number,
    farmLimit: Number,
    haLimit: {type: Number, default: 5},
    isAdmin: {type: Boolean, default: false},
    isNursery: {type: Boolean, default: false},
    isManagement: {type: Boolean, default: false},
    isProject: {type: Boolean, default: false},
    nurseries: [
            {
            type: Schema.Types.ObjectId,
            ref: "Nursery"
        }
    ]
});

UserSchema.plugin(passportLocalMongoose);

export default model<IUserSchema>("User", UserSchema);
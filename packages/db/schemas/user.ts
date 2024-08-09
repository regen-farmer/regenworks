import mongoose from "mongoose";
// import passportLocalMongoose from "passport-local-mongoose"; // MAKES THE HASH AND SALT IN THE USER MODEL AUTOMATICALLY?
import type { INurserySchema } from "./nursery.ts";
import type { IParcelSchema } from "./parcel.ts";

export interface IUserSchema {
	externalId: string;
	email: string;
	parcels: [mongoose.HydratedDocument<IParcelSchema>];
	countryCode: string;
	registrationDate: number;
	isAdmin: boolean;
	isNursery: boolean;
	isManagement: boolean;
	isProject: boolean;
	nurseries: [mongoose.HydratedDocument<INurserySchema>];
}

const UserSchema = new mongoose.Schema({
	externalId: { type: String, unique: true, require: false },
	email: { type: String, unique: true, require: true },
	parcels: [
		{
			type: mongoose.Schema.Types.ObjectId,
			ref: "Parcel",
		},
	],
	countryCode: String,
	registrationDate: Number,
	isAdmin: { type: Boolean, default: false },
	isNursery: { type: Boolean, default: false },
	isManagement: { type: Boolean, default: false },
	isProject: { type: Boolean, default: false },
	nurseries: [
		{
			type: mongoose.Schema.Types.ObjectId,
			ref: "Nursery",
		},
	],
});

// UserSchema.plugin(passportLocalMongoose);

const User =
	mongoose.models?.User || mongoose.model<IUserSchema>("User", UserSchema);
export default User;
export type UserDocument = ReturnType<(typeof User)["hydrate"]>;

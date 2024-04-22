import { model, Schema, HydratedDocument } from "mongoose";
// import passportLocalMongoose from "passport-local-mongoose"; // MAKES THE HASH AND SALT IN THE USER MODEL AUTOMATICALLY?
import { INurserySchema } from "./nursery.js";
import { IParcelSchema } from "./parcel.js";

export interface IUserSchema {
	externalId: string;
	stripeCustomerId: string;
	email: string;
	parcels: [HydratedDocument<IParcelSchema>];
	countryCode: string;
	registrationDate: number;
	isAdmin: boolean;
	isNursery: boolean;
	isManagement: boolean;
	isProject: boolean;
	nurseries: [HydratedDocument<INurserySchema>];
}

const UserSchema = new Schema({
	externalId: { type: String, unique: true, require: false },
	stripeCustomerId: { type: String, unique: true, require: false },
	email: { type: String, unique: true, require: false },
	parcels: [
		{
			type: Schema.Types.ObjectId,
			ref: "Parcel",
		},
	],
	
	countryCode: { type: String, default: "", require: false },
	registrationDate: Number,
	isAdmin: { type: Boolean, default: false },
	isNursery: { type: Boolean, default: false },
	isManagement: { type: Boolean, default: false },
	isProject: { type: Boolean, default: false },
	nurseries: [
		{
			type: Schema.Types.ObjectId,
			ref: "Nursery",
		},
	],
});

// UserSchema.plugin(passportLocalMongoose);

const User = model<IUserSchema>("User", UserSchema);
export default User;
export type UserDocument = ReturnType<(typeof User)["hydrate"]>;

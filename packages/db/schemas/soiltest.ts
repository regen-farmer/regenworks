import mongoose from "mongoose";
import type { IUserSchema } from "./user.ts";

export interface ISoiltestSchema {
	name: string;
	description: string;
	lat: number;
	lng: number;
	depth: number;
	physical: {
		clay: number;
		silt: number;
		sand: number;
	};
	sampleDate: Date;
	compaction: number;
	fertility: {
		conductivity: number;
		pH: number;
		SOM: number;
		nitrogen: number;
		phosphorus: number;
		lime: number;
		calcium: number;
		magnesium: number;
		potasium: number;
		sodium: number;
	};
	microelements: {
		boron: number;
		iron: number;
		magnezium: number;
		copper: number;
		zinc: number;
	};
	owner: {
		id: mongoose.HydratedDocument<IUserSchema>;
	};
}

// SOIL TEST SCHEMA SETUP
const soiltestSchema = new mongoose.Schema<ISoiltestSchema>({
	name: String,
	description: String,
	lat: Number,
	lng: Number,
	depth: Number,
	physical: {
		clay: Number,
		silt: Number,
		sand: Number,
	},
	sampleDate: Date,
	compaction: Number,
	fertility: {
		conductivity: Number,
		pH: Number,
		SOM: Number,
		nitrogen: Number,
		phosphorus: Number,
		lime: Number,
		calcium: Number,
		magnesium: Number,
		potasium: Number,
		sodium: Number,
	},
	microelements: {
		boron: Number,
		iron: Number,
		magnezium: Number,
		copper: Number,
		zinc: Number,
	},
	owner: {
		id: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "User",
		},
	},
});

const Soiltest =
	mongoose.models?.Soiltest || mongoose.model("Soiltest", soiltestSchema);
export default Soiltest;
export type SoiltestDocument = ReturnType<(typeof Soiltest)["hydrate"]>;

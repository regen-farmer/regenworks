import mongoose from "mongoose";
import type { IPostingSchema } from "./posting";
import type { IUserSchema } from "./user";

export interface IBudgetSchema {
	postings: mongoose.HydratedDocument<IPostingSchema>[];
	owner: {
		id: mongoose.HydratedDocument<IUserSchema>;
	};
	currency: string;
	name: string;
}

// BUDGET SCHEMA SETUP
const budgetSchema = new mongoose.Schema<IBudgetSchema>({
	postings: [
		{
			type: mongoose.Schema.Types.ObjectId,
			ref: "Posting",
		},
	],
	owner: {
		id: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "User",
		},
	},
	currency: String,
	name: String,
});

const Budget =
	mongoose.models?.Budget || mongoose.model("Budget", budgetSchema);

export default Budget;

export type BudgetDocument = ReturnType<(typeof Budget)["hydrate"]>;

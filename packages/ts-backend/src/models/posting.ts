import { model, Schema } from "mongoose";

export interface IPostingSchema {
	name: string;
	postType: string;
	amount: number;
	value: number;
	year: number;
	month: number;
	date: number;
}

// POSTING SCHEMA SETUP
const postingSchema = new Schema<IPostingSchema>({
	name: String,
	postType: String,
	amount: Number,
	value: Number,
	year: Number,
	month: Number,
	date: Number,
});

const Posting = model("Posting", postingSchema);
export default Posting;
export type PostingDocument = ReturnType<(typeof Posting)["hydrate"]>;

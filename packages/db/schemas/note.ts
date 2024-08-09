import mongoose from "mongoose";
import type { IUserSchema } from "./user.ts";

export interface INoteSchema {
	name: string;
	description: string;
	owner: {
		id: mongoose.HydratedDocument<IUserSchema>;
	};
}

// NOTE SCHEMA SETUP
const noteSchema = new mongoose.Schema<INoteSchema>({
	name: String,
	description: String,
	owner: {
		id: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "User",
		},
	},
});

const Note = mongoose.models?.Note || mongoose.model("Note", noteSchema);
export default Note;
export type NoteDocument = ReturnType<(typeof Note)["hydrate"]>;

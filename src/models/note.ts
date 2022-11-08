import { Document, model, Schema, Types } from 'mongoose';
import { IUserSchema } from './user';

export interface INoteSchema extends Document {
    name: String,
    description: String,
    owner: {
        id: IUserSchema,
        username: String
    }
}

// NOTE SCHEMA SETUP
var noteSchema = new Schema<INoteSchema>({
    name: String,
    description: String,
    owner: {
        id: {
            type: Schema.Types.ObjectId,
            ref: "User"
        },
        username: String
    }
});

export default model("Note", noteSchema);
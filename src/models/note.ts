import { Document, model, Schema, Types } from 'mongoose';

interface INoteSchema extends Document {
    name: String,
    description: String,
    owner: {
        id: Types.ObjectId,
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
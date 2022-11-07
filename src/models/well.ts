import { Document, model, Schema, Types } from 'mongoose';

interface IWellSchema extends Document {
    name: String,
    description: String,
    geometry: String,
    owner: {
        id: Types.ObjectId,
        username: String
    }
}

// WELL SCHEMA SETUP
var wellSchema = new Schema<IWellSchema>({
    name: String,
    description: String,
    geometry: String,
    owner: {
        id: {
            type: Schema.Types.ObjectId,
            ref: "User"
        },
        username: String
    }
});

export default model("Well", wellSchema);
import { Document, model, Schema, Types } from 'mongoose';
import { IUserSchema } from './user';

export interface IWellSchema extends Document {
    name: String,
    description: String,
    geometry: String,
    owner: {
        id: IUserSchema,
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
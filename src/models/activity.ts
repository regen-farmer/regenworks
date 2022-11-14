import { model, Types, Schema, Document } from 'mongoose';
import { ILayerSchema } from './layer';
import { ISpeciesSchema } from './species';
import { IUserSchema } from './user';

export interface IActivitySchema extends Document {
    name: string,
    description: string,
    start: {
        date: string,
        time: string
    },
    end:  {
        date: string,
        time: string
    },
    time: number,
    status: boolean,
    activityType: string,
    subtype: string,
    automated: boolean,
    owner: {
        id: IUserSchema
        username: string
    },
    layer: ILayerSchema
    species: ISpeciesSchema
}

// ACTIVITY SCHEMA SETUP
var activitySchema = new Schema<IActivitySchema>({
    name: String,
    description: String,
    start: {
        date: String,
        time: String
    },
    end:  {
        date: String,
        time: String
    },
    time: Number,
    status: Boolean,
    activityType: String,
    subtype: String,
    automated: Boolean,
    owner: {
        id: {
            type: Schema.Types.ObjectId,
            ref: "User"
        },
        username: String
    },
    layer: {
        type: Schema.Types.ObjectId,
        ref: "Layer"
    },
    species: {
        type: Schema.Types.ObjectId,
        ref: "Species"
    }
});

export default model("Activity", activitySchema);
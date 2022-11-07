import { model, Types, Schema, Document } from 'mongoose';

interface IActivitySchema extends Document {
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
        id: Types.ObjectId
        username: String
    },
    layer: Types.ObjectId,
    species: Types.ObjectId
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
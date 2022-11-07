import { Document, model, Schema, Types } from 'mongoose';

interface ISystemflowSchema extends Document {
    name: String,
    type: String,
    unit: String,
    timeframe: String,
    location: String,
    data: [
        {
            species: Types.ObjectId,
            data: [Number]
        }
    ],
    source: String,
    systemref: Types.ObjectId
}

// SYSTEM FLOW SCHEMA SETUP
var systemflowSchema = new Schema<ISystemflowSchema>({
    name: String,
    type: String,
    unit: String,
    timeframe: String,
    location: String,
    data: [
        {
            species: {
                type: Schema.Types.ObjectId,
                ref: "Species"
            },
            data: [Number]
        }
    ],
    source: String,
    systemref: {
        type: Schema.Types.ObjectId,
        ref: "System"
    }
});

export default model("Systemflow", systemflowSchema);
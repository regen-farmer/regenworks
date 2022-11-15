import { Document, model, Schema, Types } from 'mongoose';

export interface ILogSchema extends Document {
    message: string,
    level: string,
    timestamp: number
}

// LOG SCHEMA SETUP
var logSchema = new Schema<ILogSchema>({
    message: String,
    level: String,
    timestamp: Number
});

export default model("Log", logSchema);
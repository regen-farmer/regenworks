import { Document, model, Schema } from 'mongoose';

export interface ILogSchema extends Document {
    message: string,
    level: string,
    timestamp: number
}

// LOG SCHEMA SETUP
const logSchema = new Schema<ILogSchema>({
  message: String,
  level: String,
  timestamp: Number,
});

export default model('Log', logSchema);

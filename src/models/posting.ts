import { Document, model, Schema } from 'mongoose';

export interface IPostingSchema extends Document {
    name: string,
    postType: string,
    amount: number,
    value: number,
    year: number,
    month: number,
    date: number
}

// POSTING SCHEMA SETUP
var postingSchema = new Schema<IPostingSchema>({
    name: String,
    postType: String,
    amount: Number,
    value: Number,
    year: Number,
    month: Number,
    date: Number
});

export default model("Posting", postingSchema);
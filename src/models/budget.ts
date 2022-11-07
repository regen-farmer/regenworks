import { Document, model, Schema, Types } from 'mongoose';

interface IBudgetSchema extends Document {
    postings: Types.ObjectId[],
    owner: {
        id: Types.ObjectId[],
        username: String
    },
    currency: String,
    name: String
}

// BUDGET SCHEMA SETUP
var budgetSchema = new Schema<IBudgetSchema>({
    postings: [
        {
            type: Schema.Types.ObjectId,
            ref: "Posting"
        }
    ],
    owner: {
        id: {
            type: Schema.Types.ObjectId,
            ref: "User"
        },
        username: String
    },
    currency: String,
    name: String
});

export default model("Budget", budgetSchema);
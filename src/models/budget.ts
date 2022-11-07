import mongoose from "mongoose";

// BUDGET SCHEMA SETUP
var budgetSchema = new mongoose.Schema({
    postings: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Posting"
        }
    ],
    owner: {
        id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User"
        },
        username: String
    },
    currency: String,
    name: String
});

export default mongoose.model("Budget", budgetSchema);
var mongoose = require("mongoose");

// BUDGET SCHEMA SETUP
var budgetSchema = new mongoose.Schema({
    postings: [
        {
            name: String,
            postType: String,
            amount: Number,
            value: Number
        }
    ],
    owner: {
        id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User"
        },
        username: String
    },
    currency: String
});

module.exports = mongoose.model("Budget", budgetSchema);
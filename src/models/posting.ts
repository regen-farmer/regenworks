import mongoose from "mongoose";

// POSTING SCHEMA SETUP
var postingSchema = new mongoose.Schema({
    name: String,
    postType: String,
    amount: Number,
    value: Number,
    year: Number,
    month: Number,
    date: Number
});

export default mongoose.model("Posting", postingSchema);
import mongoose from "mongoose";

// IP RATE LIMITER SCHEMA SETUP
var rateLimiterIPSchema = new mongoose.Schema({
    createdAt: {
        type: Date,
        required: true,
        default: Date.now,
    },
    ip: {
        type: String,
        required: true,
        trim: true,
        match: /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/
    },
    hits: {
        type: Number,
        default: 1,
        required: true,
        min: 0
    }
});

export default mongoose.model("RateLimiterIP", rateLimiterIPSchema);
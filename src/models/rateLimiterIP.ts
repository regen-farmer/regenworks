import { Document, model, Schema } from 'mongoose';

export interface IRateLimiterIPSchema extends Document {
    createdAt: {
        type: Date,
        required: boolean,
        default: Date,
    },
    ip: {
        type: String,
        required: boolean,
        trim: boolean,
        match: RegExp
    },
    hits: {
        type: Number,
        default: Number,
        required: boolean,
        min: Number
    }
}

// IP RATE LIMITER SCHEMA SETUP
var rateLimiterIPSchema = new Schema<IRateLimiterIPSchema>({
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

export default model("RateLimiterIP", rateLimiterIPSchema);
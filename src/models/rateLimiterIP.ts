import { model, Schema } from 'mongoose';

export interface IRateLimiterIPSchema {
    createdAt: {
        type: Date,
        required: boolean,
        default: Date,
    },
    ip: {
        type: string,
        required: boolean,
        trim: boolean,
        match: RegExp
    },
    hits: {
        type: number,
        default: number,
        required: boolean,
        min: number
    }
}

// IP RATE LIMITER SCHEMA SETUP
const rateLimiterIPSchema = new Schema<IRateLimiterIPSchema>({
  createdAt: {
    type: Date,
    required: true,
    default: Date.now,
  },
  ip: {
    type: String,
    required: true,
    trim: true,
    match: /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/,
  },
  hits: {
    type: Number,
    default: 1,
    required: true,
    min: 0,
  },
});

const RateLimiterIP = model('RateLimiterIP', rateLimiterIPSchema);
export default RateLimiterIP;
export type RateLimiterIPDocument = ReturnType<(typeof RateLimiterIP)['hydrate']>;

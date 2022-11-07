import { Document, model, Schema } from 'mongoose';

export interface IPracticesSchema extends Document {
    name: String,
    type: String,
    description: String,
    tasks: String,
    regenScores: {
        soilScore: Number,
        bioScore: Number,
        waterScore: Number,
        climateScore: Number
    }
}

// PRACTICE SCHEMA SETUP
var practicesSchema = new Schema<IPracticesSchema>({
    name: String,
    type: String,
    description: String,
    tasks: String,
    regenScores: {
        soilScore: Number,
        bioScore: Number,
        waterScore: Number,
        climateScore: Number
    }
});

export default model("Practice", practicesSchema);
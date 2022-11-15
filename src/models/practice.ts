import { Document, model, Schema } from 'mongoose';

export interface IPracticesSchema extends Document {
    name: string,
    type: string,
    description: string,
    tasks: string,
    regenScores: {
        soilScore: number,
        bioScore: number,
        waterScore: number,
        climateScore: number
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
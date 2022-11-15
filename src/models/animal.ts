import { Document, model, Schema } from 'mongoose';


export interface IAnimalSchema extends Document {
    name: string,
    family: string,
    genus: string,
    species: string
}

// ANIMAL SCHEMA SETUP
var animalSchema = new Schema<IAnimalSchema>({
    name: String,
    family: String,
    genus: String,
    species: String
});

export default model("Animal", animalSchema);
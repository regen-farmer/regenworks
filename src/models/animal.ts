import { Document, model, Schema } from 'mongoose';


interface IAnimalSchema extends Document {
    name: String,
    family: String,
    genus: String,
    species: String
}

// ANIMAL SCHEMA SETUP
var animalSchema = new Schema<IAnimalSchema>({
    name: String,
    family: String,
    genus: String,
    species: String
});

export default model("Animal", animalSchema);
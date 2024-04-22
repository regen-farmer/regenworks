import { model, Schema } from "mongoose";

export interface IAnimalSchema {
	name: string;
	family: string;
	genus: string;
	species: string;
}

// ANIMAL SCHEMA SETUP
const animalSchema = new Schema<IAnimalSchema>({
	name: String,
	family: String,
	genus: String,
	species: String,
});

const Animal = model("Animal", animalSchema);

export default Animal;

export type AnimalDocument = ReturnType<(typeof Animal)["hydrate"]>;

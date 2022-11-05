import mongoose from "mongoose";

// NURSERY SCHEMA SETUP
var nurserySchema = new mongoose.Schema({
    name: String,
    location: String,
    currency: String,
    description: String,
    lat: Number,
    lng: Number,
    range: Number,
    owner: {
        id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User"
        },
        username: String
    },
    products: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Nurseryproduct"
        }
    ]
});

export default mongoose.model("Nursery", nurserySchema);
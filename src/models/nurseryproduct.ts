import { Document, model, Schema, Types } from 'mongoose';

interface INurseryProductSchema extends Document {
    name: String,
    variety: String,
    species: Types.ObjectId,
    price: Number,
    description: String,
    stock: Number,
    class: String,
    pollination: String,
    orderlimit: Number,
    rootstock: Types.ObjectId,
    hybrid: Types.ObjectId,
    owner: {
        id: Types.ObjectId,
        username: String
    },
    availability: {type: Boolean, default: false},
    season: {
        start: String,
        end: String
    }
}

// NURSERY PRODUCT SCHEMA SETUP
var nurseryProductSchema = new Schema<INurseryProductSchema>({
    name: String,
    variety: String,
    species: {
        type: Schema.Types.ObjectId,
        ref: "Species"
    },
    price: Number,
    description: String,
    stock: Number,
    class: String,
    pollination: String,
    orderlimit: Number,
    rootstock: {
        type: Schema.Types.ObjectId,
        ref: "Species"
    },
    hybrid: {
        type: Schema.Types.ObjectId,
        ref: "Species"
    },
    owner: {
        id: {
            type: Schema.Types.ObjectId,
            ref: "User"
        },
        username: String
    },
    availability: {type: Boolean, default: false},
    season: {
        start: String,
        end: String
    }
});

export default model("Nurseryproduct", nurseryProductSchema);
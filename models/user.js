var mongoose = require("mongoose");
var passportLocalMongoose = require("passport-local-mongoose"); // MAKES THE HASH AND SALT IN THE USER MODEL AUTOMATICALLY?

var UserSchema = new mongoose.Schema({
    username: {type: String, unique: true, require: true},
    password: String,
    email: {type: String, unique: true, require: true},
    resetPasswordToken: String,
    resetPasswordExpires: Date,
    parcels: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Parcel"
        }
    ],
    currentProject: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Parcel"
    },
    registrationDate: Number,
    membership: Number,
    farmLimit: Number
});

UserSchema.plugin(passportLocalMongoose);

module.exports = mongoose.model("User", UserSchema);
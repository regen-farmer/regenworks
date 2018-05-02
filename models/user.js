var mongoose = require("mongoose");
var passportLocalMongoose = require("passport-local-mongoose"); // MAKES THE HASH AND SALT IN THE USER MODEL AUTOMATICALLY?

var UserSchema = new mongoose.Schema({
    username: String,
    email: String,
    password: String
});

UserSchema.plugin(passportLocalMongoose);

module.exports = mongoose.model("User", UserSchema);
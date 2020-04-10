var mongoose = require("mongoose");

// BUDGET SCHEMA SETUP
var budgetSchema = new mongoose.Schema({
    costs: [],
    revenue: []
});

module.exports = mongoose.model("Budget", budgetSchema);
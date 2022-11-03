const mongoose = require('mongoose');

// POSTING SCHEMA SETUP
const postingSchema = new mongoose.Schema({
  name: String,
  postType: String,
  amount: Number,
  value: Number,
  year: Number,
  month: Number,
  date: Number,
});

module.exports = mongoose.model('Posting', postingSchema);

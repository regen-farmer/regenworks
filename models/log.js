const mongoose = require('mongoose');

// LOG SCHEMA SETUP
const logSchema = new mongoose.Schema({
  message: String,
  level: String,
  timestamp: Number,
});

module.exports = mongoose.model('Log', logSchema);

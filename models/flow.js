const mongoose = require('mongoose');

// FLOW SCHEMA SETUP
const flowSchema = new mongoose.Schema({
  name: String,
  type: String,
  unit: String,
  timeframe: String,
  data: [Number],
  source: String,
});

module.exports = mongoose.model('Flow', flowSchema);

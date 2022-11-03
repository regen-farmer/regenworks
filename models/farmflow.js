const mongoose = require('mongoose');

// FLOW SCHEMA SETUP
const farmflowSchema = new mongoose.Schema({
  name: String,
  description: String,
  type: String,
  unit: String,
  timeframe: String,
  source: String,
  timestamp: Date,
  amount: Number,
  species: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Species',
  },
});

module.exports = mongoose.model('Farmflow', farmflowSchema);

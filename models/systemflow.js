const mongoose = require('mongoose');

// SYSTEM FLOW SCHEMA SETUP
const systemflowSchema = new mongoose.Schema({
  name: String,
  type: String,
  unit: String,
  timeframe: String,
  location: String,
  data: [
    {
      species: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Species',
      },
      data: [Number],
    },
  ],
  source: String,
  systemref: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'System',
  },
});

module.exports = mongoose.model('Systemflow', systemflowSchema);

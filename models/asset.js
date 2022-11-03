const mongoose = require('mongoose');

// ASSET SCHEMA SETUP
const assetSchema = new mongoose.Schema({
  name: String,
  description: String,
  typeAsset: String,
  amount: Number,
  species: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Species',
  },
  value: Number,
  creation: Number,
  determination: Number,
  lat: Number,
  lng: Number,
  owner: {
    id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    username: String,
  },
});

module.exports = mongoose.model('Asset', assetSchema);

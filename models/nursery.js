const mongoose = require('mongoose');

// NURSERY SCHEMA SETUP
const nurserySchema = new mongoose.Schema({
  name: String,
  location: String,
  currency: String,
  description: String,
  lat: Number,
  lng: Number,
  range: Number,
  owner: {
    id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    username: String,
  },
  products: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Nurseryproduct',
    },
  ],
});

module.exports = mongoose.model('Nursery', nurserySchema);

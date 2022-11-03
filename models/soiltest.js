const mongoose = require('mongoose');

// SOIL TEST SCHEMA SETUP
const soiltestSchema = new mongoose.Schema({
  name: String,
  description: String,
  lat: Number,
  lng: Number,
  depth: Number,
  physical: {
    clay: Number,
    silt: Number,
    sand: Number,
  },
  sampleDate: Date,
  compaction: Number,
  fertility: {
    conductivity: Number,
    pH: Number,
    SOM: Number,
    nitrogen: Number,
    phosphorus: Number,
    lime: Number,
    calcium: Number,
    magnesium: Number,
    potasium: Number,
    sodium: Number,
  },
  microelements: {
    boron: Number,
    iron: Number,
    magnezium: Number,
    copper: Number,
    zinc: Number,
  },
  owner: {
    id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    username: String,
  },
});

module.exports = mongoose.model('Soiltest', soiltestSchema);

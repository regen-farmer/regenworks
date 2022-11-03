const mongoose = require('mongoose');

// BUDGET SCHEMA SETUP
const budgetSchema = new mongoose.Schema({
  postings: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Posting',
    },
  ],
  owner: {
    id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    username: String,
  },
  currency: String,
  name: String,
});

module.exports = mongoose.model('Budget', budgetSchema);

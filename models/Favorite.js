const mongoose = require('mongoose');

const FavoriteSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  tripId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Trip',
    required: true
  }
}, {
  timestamps: true
});

FavoriteSchema.index({ userId: 1, tripId: 1 }, { unique: true });

module.exports = mongoose.model('Favorite', FavoriteSchema);
const mongoose = require('mongoose');

const tableSchema = new mongoose.Schema({
  tableId: { type: String, unique: true },
  number: { type: Number, required: true, unique: true },
  seats: { type: Number, default: 4 },
  status: { type: String, enum: ['available', 'held', 'occupied'], default: 'available' },
  heldBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  holdExpiresAt: { type: Date, default: null },
  occupiedAt: { type: Date, default: null }
});

module.exports = mongoose.model('Table', tableSchema);

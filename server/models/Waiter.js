const mongoose = require('mongoose');

const waiterSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    phone: { type: String, required: true, unique: true },
    email: { type: String },
    role: { type: String, default: 'waiter' }, // fixed
    password: { type: String, required: true },
    salary: { type: Number, default: 0 },
    employmentStatus: { type: String, default: 'active' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Waiter', waiterSchema, 'waiters');

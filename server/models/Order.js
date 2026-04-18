const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema({
  userEmail: { type: String, required: true },
  phone: { type: String },
  items: [{ type: String, required: true }],
  totalCost: { type: Number, required: true },
  status: { type: String, default: "Requested" },
  etaSeconds: { type: Number, default: null },
  etaAssignedAt: { type: Date, default: null },
  tableNo: { type: String },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Order", orderSchema);

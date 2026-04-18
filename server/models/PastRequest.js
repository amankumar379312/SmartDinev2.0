// server/models/PastRequest.js
const mongoose = require("mongoose");

const pastRequestSchema = new mongoose.Schema(
  {
    type: String,           // "dish", etc.
    name: String,
    category: String,
    price: Number,
    notes: String,
    requestedBy: String,    // "cook", etc.
    status: { type: String, enum: ["approved", "rejected"], required: true },
    createdAt: Date,        // original request time
    decidedAt: { type: Date, default: Date.now }, // when approved/rejected
    decidedBy: { type: String, default: "admin" }, // optional
  },
  { collection: "past_requests", timestamps: false }
);

module.exports = mongoose.models.PastRequest || mongoose.model("PastRequest", pastRequestSchema);

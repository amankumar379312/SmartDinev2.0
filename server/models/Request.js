const mongoose = require("mongoose");

const requestSchema = new mongoose.Schema(
  {
    type: { type: String, required: true },        // e.g. "dish"
    name: { type: String, required: true },
    category: { type: String },
    price: { type: Number },
    notes: { type: String },
    requestedBy: { type: String },                 // e.g. "cook" or "waiter"
    status: { type: String, default: "pending" },  // pending | approved | rejected
  },
  { timestamps: true, collection: "requests" }     // same name as your Mongo collection
);

module.exports = mongoose.models.Request || mongoose.model("Request", requestSchema);

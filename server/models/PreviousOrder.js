// server/models/PreviousOrder.js
const mongoose = require("mongoose");

const previousOrderSchema = new mongoose.Schema(
  {
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    userEmail: {
      type: String,
      required: true,
    },
    tableNo: {
      type: String,
      required: true,
    },
    // In your MongoDB, "items" is an array of strings
    items: {
      type: [String],
      default: [],
    },
    totalCost: {
      type: Number,
      required: true,
    },
    status: {
      type: String,
      default: "paid",
    },
  },
  {
    timestamps: true,                // adds createdAt / updatedAt automatically
    collection: "previousorders",    // EXACT collection name from MongoDB
  }
);

module.exports = mongoose.model("PreviousOrder", previousOrderSchema);

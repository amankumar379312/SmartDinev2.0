const mongoose = require("mongoose");

const feedbackSchema = new mongoose.Schema(
  {
    orderId: String,
    ratings: {
      foodQuality: Number,
      serviceSpeed: Number,
      ambience: Number,
      value: Number,
      overall: Number,
    },
    comment: String,
  },
  { timestamps: true }
);

module.exports = mongoose.model("Feedback", feedbackSchema);

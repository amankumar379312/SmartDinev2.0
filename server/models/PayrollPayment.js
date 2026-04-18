const mongoose = require("mongoose");

const payrollPaymentSchema = new mongoose.Schema(
  {
    staffId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    staffRole: {
      type: String,
      enum: ["waiter", "cook"],
      required: true,
    },
    staffName: {
      type: String,
      required: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    month: {
      type: String,
      required: true,
    },
    method: {
      type: String,
      default: "Cash",
    },
    note: {
      type: String,
      default: "",
    },
    paidBy: {
      type: String,
      default: "admin",
    },
  },
  { timestamps: true, collection: "payrollpayments" }
);

module.exports =
  mongoose.models.PayrollPayment ||
  mongoose.model("PayrollPayment", payrollPaymentSchema);

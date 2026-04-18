const mongoose = require("mongoose");

const workflowSessionSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true, unique: true },
    userEmail: { type: String, default: null },
    role: { type: String, default: "user" },
    roleScope: { type: String, default: "user" },
    pathname: { type: String, default: null },
    search: { type: String, default: "" },
    hash: { type: String, default: "" },
    routeState: { type: mongoose.Schema.Types.Mixed, default: null },
    tableId: { type: String, default: null },
    activeOrderIds: { type: [String], default: [] },
    currentStep: { type: String, default: null },
    paymentPending: { type: Boolean, default: false },
    status: { type: String, default: "active" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("WorkflowSession", workflowSessionSchema);

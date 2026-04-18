const mongoose = require("mongoose");

const adminSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    phone: { type: String, required: true, unique: true },
    email: { type: String, default: null },
    password: { type: String, required: true },
    role: { type: String, default: "admin" }, // fixed role
  },
  { timestamps: true }
);

module.exports = mongoose.model("Admin", adminSchema);

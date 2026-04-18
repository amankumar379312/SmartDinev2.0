const mongoose = require("mongoose");

const menuItemSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    category: { type: String, required: true },
    price: { type: Number, required: true },
    description: { type: String, default: "" },
  },
  { timestamps: true, collection: "menuitems" }
);

module.exports = mongoose.models.MenuItem || mongoose.model("MenuItem", menuItemSchema);

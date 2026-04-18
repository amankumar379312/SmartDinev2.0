const express = require("express");
const router = express.Router();
const MenuItem = require("../models/MenuItem");

// GET /api/menu/items  → already used by your frontend to fetch menu
router.get("/items", async (req, res) => {
  try {
    const items = await MenuItem.find({}, null, { sort: { category: 1, name: 1 } });
    res.json(items);
  } catch (err) {
    console.error("Failed to fetch menu items:", err);
    res.status(500).json({ message: "Failed to fetch menu items" });
  }
});

// POST /api/menu/items  → create a new dish
router.post("/items", async (req, res) => {
  try {
    let { name, category, price, description } = req.body;

    if (!name || !category || price == null) {
      return res.status(400).json({ message: "name, category, price are required" });
    }

    // normalize category (your seed used lowercase: starters/maincourse/desserts)
    const normalized = String(category).trim().toLowerCase();
    const map = {
      "starter": "starters",
      "starters": "starters",
      "main": "maincourse",
      "main course": "maincourse",
      "maincourse": "maincourse",
      "dessert": "desserts",
      "desserts": "desserts",
      "beverage": "beverages",
      "beverages": "beverages",
      "snack": "snacks",
      "snacks": "snacks",
    };
    category = map[normalized] || normalized;

    // prevent duplicates by (case-insensitive) name
    const existing = await MenuItem.findOne({
      name: { $regex: `^${name}$`, $options: "i" },
      category,
    });
    if (existing) {
      return res.status(409).json({ message: "Dish with this name already exists in this category" });
    }

    const item = await MenuItem.create({
      name: name.trim(),
      category,
      price: Number(price),
      description: String(description || "").trim(),
    });

    res.status(201).json(item);
  } catch (err) {
    console.error("Failed to add menu item:", err);
    res.status(500).json({ message: "Failed to add menu item" });
  }
});

module.exports = router;

const mongoose = require("mongoose");
require("dotenv").config();

const MenuItem = require("../models/MenuItem"); // you’ll create this model below

const menu = {
  starters: [
    { name: "Veg Spring Rolls", price: 149 },
    { name: "Paneer Tikka", price: 199 },
    { name: "Chicken 65", price: 229 },
    { name: "Crispy Corn", price: 159 },
    { name: "Tomato Soup", price: 129 },
  ],
  maincourse: [
    { name: "Paneer Butter Masala", price: 299 },
    { name: "Dal Tadka", price: 189 },
    { name: "Chicken Biryani", price: 349 },
    { name: "Veg Fried Rice", price: 199 },
    { name: "Butter Naan", price: 35 },
    { name: "Tandoori Roti", price: 25 },
    { name: "Pasta Alfredo", price: 259 },
    { name: "Fish Curry", price: 379 },
  ],
  desserts: [
    { name: "Gulab Jamun", price: 99 },
    { name: "Chocolate Brownie", price: 149 },
    { name: "Ice Cream Sundae", price: 169 },
    { name: "Fruit Salad", price: 129 },
    { name: "Cheesecake Slice", price: 199 },
  ],
};

async function seedMenu() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ Connected to MongoDB");

    // Clear old items (optional)
    await MenuItem.deleteMany({});
    console.log("🗑️ Cleared old menu");

    const allItems = [];

    // Flatten the menu categories into individual items
    for (const [category, items] of Object.entries(menu)) {
      for (const i of items) {
        allItems.push({ name: i.name, price: i.price, category });
      }
    }

    await MenuItem.insertMany(allItems);
    console.log(`🍽️ Inserted ${allItems.length} menu items successfully!`);
    process.exit(0);
  } catch (err) {
    console.error("❌ Error seeding menu:", err);
    process.exit(1);
  }
}

seedMenu();

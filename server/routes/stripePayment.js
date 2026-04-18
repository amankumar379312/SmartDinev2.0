const express = require("express");
const Stripe = require("stripe");
const router = express.Router();
const Order = require("../models/Order");
const MenuItem = require("../models/MenuItem");
const auth = require("../middleware/auth");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Create checkout session
router.post("/create-checkout-session", auth, async (req, res) => {
  try {
    const orderIds = Array.isArray(req.body.orderIds)
      ? req.body.orderIds.filter(Boolean)
      : req.body.orderId ? [req.body.orderId] : [];

    const orders = await Order.find({ _id: { $in: orderIds } }).sort({ createdAt: 1 });
    if (!orders.length) return res.status(404).json({ message: "Order not found" });

    const itemNames = orders.flatMap((order) =>
      Array.isArray(order.items)
        ? order.items.map((item) => (typeof item === "string" ? item : item?.name)).filter(Boolean)
        : []
    );

    const menuItems = await MenuItem.find({}).lean();
    const menuPriceMap = new Map(
      menuItems.map((item) => [String(item.name || "").trim().toLowerCase(), Number(item.price) || 0])
    );

    const groupedItems = itemNames.reduce((acc, name) => {
      const existing = acc.get(name);
      if (existing) {
        existing.quantity += 1;
        return acc;
      }

      acc.set(name, {
        name,
        quantity: 1,
        unitAmount: (menuPriceMap.get(String(name).trim().toLowerCase()) || 0) * 100,
      });
      return acc;
    }, new Map());

    if ([...groupedItems.values()].some((item) => item.unitAmount <= 0)) {
      return res.status(400).json({ message: "Some ordered items do not have valid menu pricing" });
    }

    const line_items = [...groupedItems.values()].map((item) => ({
      price_data: {
        currency: "inr",
        product_data: { name: item.name },
        unit_amount: item.unitAmount,
      },
      quantity: item.quantity,
    }));

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items,
      mode: "payment",
      success_url: "http://localhost:3000/thank-you",
      cancel_url: "http://localhost:3000/bill?canceled=true",
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error("Stripe error:", err);
    res.status(500).json({ message: "Payment session creation failed" });
  }
});

module.exports = router;

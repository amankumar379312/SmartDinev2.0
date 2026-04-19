// routes/orders.js
const express = require("express");
const router = express.Router();
const Order = require("../models/Order");
const PreviousOrder = require("../models/PreviousOrder");
const MenuItem = require("../models/MenuItem");
const auth = require("../middleware/auth");
const requireRole = require("../middleware/requireRole");

function normalizeStatus(status) {
  const s = String(status || "").toLowerCase();
  if (s === "requested" || s === "waiting" || s === "pending") return "waiting";
  if (s === "accepted") return "accepted";
  if (s === "preparing") return "preparing";
  if (s === "ready" || s === "cooked") return "cooked";
  if (s === "served" || s === "completed") return "served";
  if (s === "paid") return "paid";
  return "waiting";
}

function getRemainingEtaSeconds(orderLike) {
  const etaSeconds = Number(orderLike?.etaSeconds);
  const etaAssignedAt = orderLike?.etaAssignedAt ? new Date(orderLike.etaAssignedAt) : null;

  if (!Number.isFinite(etaSeconds) || etaSeconds < 0 || !etaAssignedAt || Number.isNaN(etaAssignedAt.getTime())) {
    return null;
  }

  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - etaAssignedAt.getTime()) / 1000));
  return Math.max(0, etaSeconds - elapsedSeconds);
}

function serializeOrder(orderDoc) {
  if (!orderDoc) return orderDoc;
  const order = typeof orderDoc.toObject === "function" ? orderDoc.toObject() : { ...orderDoc };
  return {
    ...order,
    etaSeconds: getRemainingEtaSeconds(orderDoc),
  };
}

async function buildOrderSummary(orderDocs) {
  const itemNames = orderDocs.flatMap((order) =>
    Array.isArray(order.items)
      ? order.items.map((item) => (typeof item === "string" ? item : item?.name)).filter(Boolean)
      : []
  );

  const menuItems = await MenuItem.find({}).lean();
  const menuPriceMap = new Map(
    menuItems.map((item) => [String(item.name || "").trim().toLowerCase(), Number(item.price) || 0])
  );

  const items = itemNames.reduce((acc, name) => {
    const existing = acc.find((item) => item.name === name);
    if (existing) {
      existing.qty += 1;
      existing.lineTotal = existing.qty * existing.unitPrice;
      return acc;
    }

    const unitPrice = menuPriceMap.get(String(name).trim().toLowerCase()) || 0;
    acc.push({ name, qty: 1, unitPrice, lineTotal: unitPrice });
    return acc;
  }, []);

  const total = items.reduce((sum, item) => sum + item.lineTotal, 0);

  return {
    orderIds: orderDocs.map((order) => order._id.toString()),
    items,
    total,
    tableNo: orderDocs[0]?.tableNo || null,
    userEmail: orderDocs[0]?.userEmail || null,
    statuses: orderDocs.map((order) => ({
      orderId: order._id.toString(),
      status: order.status,
      createdAt: order.createdAt,
    })),
    placedAt: orderDocs[0]?.createdAt || null,
  };
}

async function calculateOrderTotal(order) {
  const itemNames = Array.isArray(order.items)
    ? order.items.map((item) => (typeof item === "string" ? item : item?.name)).filter(Boolean)
    : [];
  const menuItems = await MenuItem.find({}).lean();
  const menuPriceMap = new Map(
    menuItems.map((item) => [String(item.name || "").trim().toLowerCase(), Number(item.price) || 0])
  );
  return itemNames.reduce((sum, name) => sum + (menuPriceMap.get(String(name).trim().toLowerCase()) || 0), 0);
}

async function getOrdersFromRequest(body) {
  const orderIds = Array.isArray(body.orderIds) ? body.orderIds.filter(Boolean) : [];

  if (orderIds.length > 0) {
    const orders = await Order.find({ _id: { $in: orderIds } }).sort({ createdAt: 1 });
    return orders;
  }

  if (body.orderId) {
    const order = await Order.findById(body.orderId);
    return order ? [order] : [];
  }

  return [];
}

// CREATE order
router.post("/create", auth, async (req, res) => {
  try {
    const { email, phone, items, totalCost, tableNo } = req.body;
    const newOrder = await Order.create({
      userEmail: email,
      phone,
      items,
      totalCost,
      tableNo,
      status: "requested",
    });

    const io = req.app.get("io");
    if (io) {
      io.to(`order_${newOrder._id}`).emit("order:update", {
        orderId: newOrder._id.toString(),
        status: normalizeStatus(newOrder.status),
        etaSeconds: getRemainingEtaSeconds(newOrder),
      });
    }

    res
      .status(201)
      .json({ message: "Order stored successfully", order: newOrder });
  } catch (err) {
    console.error("Error creating order:", err);
    res.status(500).json({ message: "Failed to store order" });
  }
});

router.post("/summary", auth, async (req, res) => {
  try {
    const orders = await getOrdersFromRequest(req.body);
    if (!orders.length) {
      return res.status(404).json({ message: "Order not found" });
    }

    const summary = await buildOrderSummary(orders);
    return res.json({ summary });
  } catch (err) {
    console.error("Error building order summary:", err);
    return res.status(500).json({ message: "Failed to build order summary" });
  }
});

// GET all live/current orders
router.get("/", auth, requireRole("cook", "waiter", "admin"), async (req, res) => {
  try {
    const orders = await Order.find().sort({ createdAt: -1 });
    res.json({ orders: orders.map(serializeOrder) });
  } catch (err) {
    console.error("Error fetching orders:", err);
    res.status(500).json({ message: "Failed to fetch orders" });
  }
});

// 🔥 SALES ENDPOINT – this MUST be BEFORE "/:id"
router.get("/sales", auth, requireRole("admin"), async (req, res) => {
  try {
    const previousOrders = await PreviousOrder.find()
      .sort({ createdAt: 1 })
      .lean();

    return res.json(previousOrders);
  } catch (err) {
    console.error("Error fetching sales:", err);
    return res
      .status(500)
      .json({ message: "Failed to fetch sales data", error: String(err) });
  }
});

// GET one (full order)
router.get("/:id", auth, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found" });
    res.json(serializeOrder(order));
  } catch (err) {
    console.error("Error fetching order:", err);
    res.status(500).json({ message: "Failed to fetch order" });
  }
});

// UPDATE status
router.patch("/:id/status", auth, requireRole("cook", "waiter", "admin"), async (req, res) => {
  try {
    const { status, etaSeconds } = req.body;
    const nextStatus = String(status || "").trim().toLowerCase();
    const update = { status };

    if (nextStatus === "accepted") {
      const parsedEta = Number(etaSeconds);
      if (!Number.isFinite(parsedEta) || parsedEta <= 0) {
        return res.status(400).json({ message: "A valid ETA is required when accepting an order" });
      }
      update.etaSeconds = Math.round(parsedEta);
      update.etaAssignedAt = new Date();
    } else if (nextStatus === "served") {
      update.etaSeconds = null;
      update.etaAssignedAt = null;
    } else if (nextStatus === "ready" || nextStatus === "cooked") {
      update.etaSeconds = 0;
    }

    const order = await Order.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!order) return res.status(404).json({ message: "Order not found" });

    const io = req.app.get("io");
    if (io) {
      io.to(`order_${order._id}`).emit("order:update", {
        orderId: order._id.toString(),
        status: normalizeStatus(order.status),
        etaSeconds: getRemainingEtaSeconds(order),
      });
    }

    res.json({ message: "Order status updated", order: serializeOrder(order) });
  } catch (err) {
    console.error("Error updating status:", err);
    res.status(500).json({ message: "Failed to update status" });
  }
});

// MARK served
router.patch("/:id/serve", auth, requireRole("waiter", "admin"), async (req, res) => {
  try {
    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { status: "served", etaSeconds: null, etaAssignedAt: null },
      { new: true }
    );
    if (!order) return res.status(404).json({ message: "Order not found" });

    const io = req.app.get("io");
    if (io) {
      io.to(`order_${order._id}`).emit("order:update", {
        orderId: order._id.toString(),
        status: "served",
        etaSeconds: null,
      });
    }

    res.json({ message: "Order served successfully", order: serializeOrder(order) });
  } catch (err) {
    console.error("Error marking served:", err);
    res.status(500).json({ message: "Failed to mark served" });
  }
});

// MOVE order to previousorders when bill is paid
router.post("/:id/markPaid", auth, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found" });
    const totalCost = await calculateOrderTotal(order);

    const prevOrder = await PreviousOrder.create({
      orderId: order._id,
      userEmail: order.userEmail,
      tableNo: order.tableNo,
      items: order.items,        // array of strings
      totalCost,
      status: "paid",
      createdAt: order.createdAt,
    });

    res
      .status(201)
      .json({ message: "Order moved to previous orders", prevOrder });
  } catch (err) {
    console.error("Error moving to previousorders:", err);
    res.status(500).json({ message: "Failed to store in previous orders" });
  }
});

router.post("/markPaid/bulk", auth, async (req, res) => {
  try {
    const orders = await getOrdersFromRequest(req.body);
    if (!orders.length) {
      return res.status(404).json({ message: "Order not found" });
    }

    const summary = await buildOrderSummary(orders);
    const created = await Promise.all(
      orders.map(async (order) =>
        PreviousOrder.findOneAndUpdate(
          { orderId: order._id },
          {
            orderId: order._id,
            userEmail: order.userEmail,
            tableNo: order.tableNo,
            items: order.items,
            totalCost: await calculateOrderTotal(order),
            status: "paid",
            createdAt: order.createdAt,
          },
          { new: true, upsert: true, setDefaultsOnInsert: true }
        )
      )
    );

    await Order.updateMany(
      { _id: { $in: orders.map((order) => order._id) } },
      { $set: { status: "paid", etaSeconds: null, etaAssignedAt: null } }
    );

    return res.status(201).json({ message: "Orders marked as paid", orders: created, summary });
  } catch (err) {
    console.error("Error marking orders paid in bulk:", err);
    return res.status(500).json({ message: "Failed to mark orders as paid" });
  }
});

module.exports = router;

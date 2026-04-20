// routes/orders.js
const express = require("express");
const router = express.Router();
const Order = require("../models/Order");
const PreviousOrder = require("../models/PreviousOrder");
const MenuItem = require("../models/MenuItem");
const WorkflowSession = require("../models/WorkflowSession");
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

function canCancelOrder(status) {
  const normalized = normalizeStatus(status);
  return normalized === "waiting" || normalized === "accepted";
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

async function findActiveWorkflowForTable(tableId) {
  if (!tableId) return null;
  return WorkflowSession.findOne({
    tableId,
    status: "active",
    roleScope: "user",
  }).sort({ updatedAt: -1 });
}

async function markOrdersPaidAndNotify({ req, orders, paymentMethod = "online" }) {
  if (!orders.length) {
    return { summary: null, created: [] };
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

  const io = req.app.get("io");
  if (io) {
    orders.forEach((order) => {
      io.to(`order_${order._id}`).emit("order:update", {
        orderId: order._id.toString(),
        status: "paid",
        etaSeconds: null,
      });
    });

    if (summary?.tableNo) {
      io.to(`table_${summary.tableNo}`).emit("table:payment-complete", {
        tableId: summary.tableNo,
        orderIds: summary.orderIds,
        paymentMethod,
      });

      io.to("waiters").emit("table:clean", {
        tableId: summary.tableNo,
        orderId: summary.orderIds[summary.orderIds.length - 1] || null,
        total: summary.total,
      });
    }
  }

  if (summary?.tableNo) {
    await WorkflowSession.findOneAndUpdate(
      {
        tableId: summary.tableNo,
        status: "active",
        roleScope: "user",
      },
      {
        pathname: "/thank-you",
        search: `?cash=1&tableId=${encodeURIComponent(summary.tableNo)}&orderIds=${encodeURIComponent(summary.orderIds.join(","))}`,
        hash: "",
        routeState: {
          orderIds: summary.orderIds,
          tableId: summary.tableNo,
          cash: true,
          paymentMethod,
        },
        currentStep: "feedback",
        paymentPending: false,
        activeOrderIds: summary.orderIds,
      },
      { new: true }
    );
  }

  return { summary, created };
}

// CREATE order
router.post("/create", auth, async (req, res) => {
  try {
    const { email, phone, items, totalCost, tableNo } = req.body;
    const requesterRole = String(req.user?.role || "").toLowerCase();
    const normalizedTableNo = String(tableNo || "").trim();
    const activeWorkflow = (requesterRole === "waiter" || requesterRole === "admin") && normalizedTableNo
      ? await findActiveWorkflowForTable(normalizedTableNo)
      : null;
    const effectiveEmail = activeWorkflow?.userEmail || email || req.user?.email || "";

    if (!effectiveEmail) {
      return res.status(400).json({ message: "No active customer is linked to that table." });
    }

    const newOrder = await Order.create({
      userEmail: effectiveEmail,
      phone,
      items,
      totalCost,
      tableNo: normalizedTableNo,
      status: "requested",
    });

    if (activeWorkflow) {
      await WorkflowSession.findByIdAndUpdate(activeWorkflow._id, {
        $addToSet: { activeOrderIds: newOrder._id.toString() },
      });
    }

    const io = req.app.get("io");
    if (io) {
      io.to(`order_${newOrder._id}`).emit("order:update", {
        orderId: newOrder._id.toString(),
        status: normalizeStatus(newOrder.status),
        etaSeconds: getRemainingEtaSeconds(newOrder),
      });
      if (normalizedTableNo) {
        io.to(`table_${normalizedTableNo}`).emit("table:order-created", {
          tableId: normalizedTableNo,
          orderId: newOrder._id.toString(),
        });
      }
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

router.delete("/:id", auth, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found" });

    if (!canCancelOrder(order.status)) {
      return res.status(400).json({
        message: "This order can no longer be cancelled because kitchen preparation has already started.",
      });
    }

    await Order.deleteOne({ _id: order._id });

    if (order.tableNo) {
      const workflow = await findActiveWorkflowForTable(order.tableNo);
      if (workflow) {
        const nextActiveOrderIds = (workflow.activeOrderIds || []).filter(
          (orderId) => String(orderId) !== String(order._id)
        );
        const nextRouteState = workflow.routeState && typeof workflow.routeState === "object"
          ? {
              ...workflow.routeState,
              existingOrderIds: Array.isArray(workflow.routeState.existingOrderIds)
                ? workflow.routeState.existingOrderIds.filter((orderId) => String(orderId) !== String(order._id))
                : nextActiveOrderIds,
            }
          : workflow.routeState;

        await WorkflowSession.findByIdAndUpdate(workflow._id, {
          activeOrderIds: nextActiveOrderIds,
          routeState: nextRouteState,
        });
      }
    }

    const io = req.app.get("io");
    if (io) {
      io.to(`order_${order._id}`).emit("order:cancelled", {
        orderId: order._id.toString(),
        tableId: order.tableNo || null,
      });

      if (order.tableNo) {
        io.to(`table_${order.tableNo}`).emit("table:order-cancelled", {
          tableId: order.tableNo,
          orderId: order._id.toString(),
        });
      }
    }

    return res.json({
      message: "Order cancelled successfully",
      orderId: order._id.toString(),
      tableId: order.tableNo || null,
    });
  } catch (err) {
    console.error("Error cancelling order:", err);
    return res.status(500).json({ message: "Failed to cancel order" });
  }
});

router.post("/markPaid/bulk", auth, async (req, res) => {
  try {
    const orders = await getOrdersFromRequest(req.body);
    if (!orders.length) {
      return res.status(404).json({ message: "Order not found" });
    }

    const { summary, created } = await markOrdersPaidAndNotify({
      req,
      orders,
      paymentMethod: "online",
    });

    return res.status(201).json({ message: "Orders marked as paid", orders: created, summary });
  } catch (err) {
    console.error("Error marking orders paid in bulk:", err);
    return res.status(500).json({ message: "Failed to mark orders as paid" });
  }
});

router.post("/markPaid/cash", auth, requireRole("waiter", "admin"), async (req, res) => {
  try {
    const orders = await getOrdersFromRequest(req.body);
    if (!orders.length) {
      return res.status(404).json({ message: "Order not found" });
    }

    const tableNo = orders[0]?.tableNo || null;
    const relatedActiveOrders = tableNo
      ? await Order.find({ tableNo }).sort({ createdAt: 1 })
      : orders;
    const unpaidOrders = relatedActiveOrders.filter((order) => normalizeStatus(order.status) !== "paid");
    const blockingOrders = unpaidOrders.filter((order) => normalizeStatus(order.status) !== "served");

    if (blockingOrders.length) {
      return res.status(400).json({
        message: "Cash can only be accepted after all orders for this table have been served.",
        blockingOrders: blockingOrders.map((order) => ({
          orderId: order._id.toString(),
          status: normalizeStatus(order.status),
        })),
      });
    }

    const unpaidServedOrders = orders.filter((order) => normalizeStatus(order.status) === "served");
    if (!unpaidServedOrders.length) {
      return res.status(400).json({ message: "No served unpaid orders were found for cash collection." });
    }

    const { summary, created } = await markOrdersPaidAndNotify({
      req,
      orders: unpaidServedOrders,
      paymentMethod: "cash",
    });

    return res.status(201).json({
      message: "Cash payment recorded successfully",
      orders: created,
      summary,
    });
  } catch (err) {
    console.error("Error marking orders paid by cash:", err);
    return res.status(500).json({ message: "Failed to record cash payment" });
  }
});

module.exports = router;

const express = require('express');
const router = express.Router();
const Table = require('../models/Table');
const Order = require('../models/Order');
const auth = require('../middleware/auth');

function hasBlockingOrders(orders = []) {
  return orders.some((order) => {
    const status = String(order.status || '').trim().toLowerCase();
    return status !== 'paid' && status !== 'completed';
  });
}

function getBlockingOrders(orders = []) {
  return orders.filter((order) => {
    const status = String(order.status || '').trim().toLowerCase();
    return status !== 'paid' && status !== 'completed';
  });
}

async function ensureTableCanBeCleared(table) {
  if (!table) {
    return { ok: false, status: 404, body: { msg: 'Table not found' } };
  }

  const occupiedAt = table.occupiedAt ? new Date(table.occupiedAt) : null;
  const query = { tableNo: table.tableId };

  if (occupiedAt && !Number.isNaN(occupiedAt.getTime())) {
    query.createdAt = { $gte: occupiedAt };
  }

  const relatedOrders = await Order.find(query).lean();
  const blockingOrders = getBlockingOrders(relatedOrders);
  if (hasBlockingOrders(relatedOrders)) {
    return {
      ok: false,
      status: 400,
      body: {
        msg: `This table still has active orders and cannot be cleared yet. Pending statuses: ${blockingOrders
          .map((order) => String(order.status || '').toLowerCase())
          .join(', ')}.`,
      },
    };
  }

  return { ok: true };
}

// get all tables
router.get('/', async (req, res) => {
  const tables = await Table.find().sort('number');
  res.json(tables);
});

// hold/reserve a table (atomic update)
router.post('/hold/:id', auth, async (req, res) => {
  const { id } = req.params;
  const holdForMs = 2 * 60 * 1000; // 2 mins
  try {
    const now = new Date();
    const holdExpiresAt = new Date(now.getTime() + holdForMs);
    // only hold if available
    const result = await Table.findOneAndUpdate(
      { _id: id, status: 'available' },
      { status: 'held', heldBy: req.user.id, holdExpiresAt },
      { new: true }
    );
    if (!result) return res.status(400).json({ msg: 'Table not available' });
    // emit socket event (server will handle)
    req.app.get('io').emit('tableHeld', { tableId: id, heldBy: req.user.id });
    res.json(result);
  } catch (err) { res.status(500).json({ err: err.message }); }
});

// mark table occupied (customer arrived) — no auth needed, customers select before logging in
router.post('/occupy/:id', auth, async (req, res) => {
  const { id } = req.params;
  try {
    const updated = await Table.findOneAndUpdate(
      { _id: id, status: { $in: ['held', 'available'] } },
      { status: 'occupied', heldBy: null, holdExpiresAt: null, occupiedAt: new Date() },
      { new: true }
    );
    if (!updated) return res.status(400).json({ msg: 'Cannot occupy' });
    req.app.get('io').emit('tableOccupied', { tableId: id });
    res.json(updated);
  } catch (err) { res.status(500).json({ err: err.message }); }
});

// get list of occupied tables
router.get('/occupied', auth, async (req, res) => {
  try {
    const occupiedTables = await Table.find({ status: 'occupied' }).sort('number');

    res.json({
      occupiedTables: occupiedTables.map(t => ({ tableId: t.tableId, number: t.number })),
    });
  } catch (err) {
    console.error("Occupied tables error:", err);
    res.status(500).json({ message: "Failed to fetch occupied tables" });
  }
});

// one-time: migrate existing tables to add tableId
router.post('/migrate', async (req, res) => {
  try {
    const tables = await Table.find({ $or: [{ tableId: { $exists: false } }, { tableId: null }, { tableId: '' }] });
    if (tables.length === 0) {
      return res.json({ msg: 'All tables already have tableId', migrated: 0 });
    }
    for (const t of tables) {
      t.tableId = `T-${String(t.number).padStart(2, '0')}`;
      await t.save();
    }
    res.json({ msg: `Migrated ${tables.length} tables`, migrated: tables.length });
  } catch (err) {
    console.error('Table migration error:', err);
    res.status(500).json({ msg: 'Failed to migrate tables', error: err.message });
  }
});

// one-time: initialize tables 1–9 as available
router.post('/init', async (req, res) => {
  try {
    const existing = await Table.countDocuments();
    if (existing > 0) {
      return res.status(400).json({ msg: 'Tables already initialized' });
    }

    const tablesToCreate = Array.from({ length: 9 }, (_, i) => ({
      tableId: `T-${String(i + 1).padStart(2, '0')}`,
      number: i + 1,
      status: 'available',
      heldBy: null,
      holdExpiresAt: null,
      occupiedAt: null,
    }));

    const created = await Table.insertMany(tablesToCreate);
    res.json({ msg: 'Tables initialized', tables: created });
  } catch (err) {
    console.error('Table init error:', err);
    res.status(500).json({ msg: 'Failed to init tables', error: err.message });
  }
});

// clear a table by mongo _id (waiter dashboard "Clear Table" button)
router.patch('/clear/:id', auth, async (req, res) => {
  try {
    const existingTable = await Table.findById(req.params.id);
    const validation = await ensureTableCanBeCleared(existingTable);
    if (!validation.ok) return res.status(validation.status).json(validation.body);

    const updated = await Table.findByIdAndUpdate(
      existingTable._id,
      { status: 'available', heldBy: null, holdExpiresAt: null, occupiedAt: null },
      { new: true }
    );
    if (!updated) return res.status(404).json({ msg: 'Table not found' });
    req.app.get('io').emit('tableCleared', { tableId: updated.tableId });
    res.json(updated);
  } catch (err) { res.status(500).json({ err: err.message }); }
});

// clear a table by tableId string (Bill.js after payment)
router.patch('/clear-by-tableid/:tableId', auth, async (req, res) => {
  try {
    const existingTable = await Table.findOne({ tableId: req.params.tableId });
    const validation = await ensureTableCanBeCleared(existingTable);
    if (!validation.ok) return res.status(validation.status).json(validation.body);

    const updated = await Table.findOneAndUpdate(
      { tableId: existingTable.tableId },
      { status: 'available', heldBy: null, holdExpiresAt: null, occupiedAt: null },
      { new: true }
    );
    if (!updated) return res.status(404).json({ msg: 'Table not found' });
    req.app.get('io').emit('tableCleared', { tableId: updated.tableId });
    res.json(updated);
  } catch (err) { res.status(500).json({ err: err.message }); }
});

module.exports = router;

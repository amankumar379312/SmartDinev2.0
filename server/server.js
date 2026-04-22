require('dotenv').config();
const express = require('express');
const http = require('http');
const connectDB = require('./config/db');
const cors = require('cors');
const app = express();
const server = http.createServer(app);
const { Server } = require('socket.io');
const User = require('./models/User');
const Table = require('./models/Table');
const Order = require('./models/Order');
const stripeRoutes = require("./routes/stripePayment");

const requestRoutes = require("./routes/requestRoutes");
const staffDirectoryRoutes = require("./routes/staffDirectory");
const menuRoutes = require("./routes/menuRoutes");
const adminDashboardRoutes = require("./routes/adminDashboard");

const allowedOrigins = String(process.env.CLIENT_ORIGIN || "http://localhost:3000")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

function isOriginAllowed(origin) {
  if (!origin) return true;
  return allowedOrigins.includes(origin);
}

app.use(cors({
  origin(origin, callback) {
    if (isOriginAllowed(origin)) return callback(null, true);
    return callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  credentials: true
}));
app.use(express.json());

const io = new Server(server, {
  cors: {
    origin(origin, callback) {
      if (isOriginAllowed(origin)) return callback(null, true);
      return callback(new Error(`Socket CORS blocked for origin: ${origin}`));
    },
    credentials: true
  }
});
app.set('io', io);

function normalizeStatus(s) {
  const x = String(s || '').toLowerCase();
  if (x === 'requested' || x === 'waiting' || x === 'pending') return 'waiting';
  if (x === 'accepted') return 'accepted';
  if (x === 'preparing') return 'preparing';
  if (x === 'ready' || x === 'cooked') return 'cooked';
  if (x === 'served' || x === 'completed') return 'served';
  return 'waiting';
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

io.on('connection', (socket) => {
  console.log('socket connected', socket.id);


  socket.on('joinTableRoom', (tableId) => {
    socket.join(`table_${tableId}`);
    console.log(`Socket ${socket.id} joined table_${tableId}`);
  });


  socket.on('order:subscribe', async ({ orderId }) => {
    if (!orderId) return;
    const room = `order_${orderId}`;
    socket.join(room);
    try {
      const ord = await Order.findById(orderId);
      if (ord) {
        io.to(room).emit('order:update', {
          orderId: ord._id.toString(),
          status: normalizeStatus(ord.status),
          etaSeconds: getRemainingEtaSeconds(ord)
        });
      }
    } catch (e) {
      console.error('order:subscribe snapshot error', e);
    }
  });

  socket.on('order:unsubscribe', ({ orderId }) => {
    if (!orderId) return;
    socket.leave(`order_${orderId}`);
  });

  socket.on('callWaiter', ({ tableId, orderId }) => {
    console.log(`callWaiter from table ${tableId}, order ${orderId}`);
    io.to(`table_${tableId}`).emit('waiter:called', { tableId, orderId });
    io.to('waiters').emit('waiter:called', { tableId, orderId });
  });

  socket.on('waiter:accept', ({ tableId, orderId }) => {
    console.log(`Waiter accepted call for table ${tableId}`);
    io.to(`table_${tableId}`).emit('waiter:accepted', { tableId, orderId });
  });

  socket.on('table:paid', ({ tableId, orderId, total }) => {
    console.log(`Table ${tableId} paid (order ${orderId}, ₹${total}) — notifying waiters to clean`);
    io.to('waiters').emit('table:clean', { tableId, orderId, total });
  });


  socket.on('joinWaiters', () => {
    socket.join('waiters');
    console.log(`Socket ${socket.id} joined waiters room`);
  });

  socket.on('disconnect', () => {
    console.log('socket disconnected', socket.id);
  });
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api/tables', require('./routes/tables'));
app.use('/api/workflow', require('./routes/workflow'));
app.use('/api/menu', require('./routes/menu'));
app.use('/api/auth', require('./routes/staff'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/ai', require('./routes/ai'));
app.use('/api/requests', requestRoutes);
app.use('/api/admin', require('./routes/adminAuth'));
app.use('/api/admin-dashboard', adminDashboardRoutes);
app.use('/api/auth', staffDirectoryRoutes);
app.use('/api/menu', menuRoutes);
app.use("/api/payment", stripeRoutes);
app.use("/api/feedbacks", require("./routes/feedbackRoutes"));


setInterval(async () => {
  const now = new Date();
  const expired = await Table.find({ status: 'held', holdExpiresAt: { $lte: now } });
  for (const t of expired) {
    t.status = 'available';
    t.heldBy = null;
    t.holdExpiresAt = null;
    await t.save();
    io.emit('tableReleased', { tableId: t._id });
  }
}, 30 * 1000);

app.post("/signup", async (req, res) => {
  try {
    const { name, phone, email, password } = req.body;
    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ message: "User already exists" });
    const newUser = new User({ name, phone, email, password });
    await newUser.save();
    res.status(201).json({ message: "User created successfully" });
  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
});

const PORT = process.env.PORT || 5000;
connectDB(process.env.MONGO_URI).then(() => {
  server.listen(PORT, () => console.log('Server running on', PORT));
});

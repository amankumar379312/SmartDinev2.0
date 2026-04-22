const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');

function buildUserPayload(user) {
  return {
    id: user._id,
    name: user.name,
    phone: user.phone,
    email: user.email,
    role: user.role || "user"
  };
}


router.post('/register', async (req, res) => {
  const { name, phone, email, password, role } = req.body;

  try {

    const existing = await User.findOne({
      $or: [{ phone }, { email }]
    });

    if (existing) {
      return res.status(400).json({ msg: 'Phone or email already exists' });
    }


    const user = await User.create({
      name,
      phone,
      email,
      password,
      role
    });

    const payload = buildUserPayload(user);
    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: '7d',
    });

    res.json({ token, user: payload });
  } catch (err) {
    console.error('REGISTER error:', err);
    res.status(500).json({ err: err.message });
  }
});


router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    if (!email || !password) {
      return res.status(400).json({ msg: 'Email and password are required' });
    }

    const normEmail = email.toLowerCase().trim();

    const user = await User.findOne({ email: normEmail });
    if (!user) {
      return res.status(400).json({ msg: 'Invalid credentials' });
    }


    const ok = (password === user.password);
    if (!ok) {
      return res.status(400).json({ msg: 'Invalid credentials' });
    }

    const payload = buildUserPayload(user);

    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: '7d',
    });

    res.json({ token, user: payload });
  } catch (err) {
    console.error('LOGIN error:', err);
    res.status(500).json({ err: err.message });
  }
});


router.get('/all-users', async (req, res) => {
  try {
    const users = await User.find().sort({ createdAt: -1 }).lean();
    res.json(users);
  } catch (err) {
    console.error('GET /all-users error:', err);
    res.status(500).json({ message: 'Failed to fetch users' });
  }
});

module.exports = router;

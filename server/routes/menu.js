const express = require('express');
const router = express.Router();
const MenuItem = require('../models/MenuItem');

// get menu
router.get('/', async (req,res) => {
  const items = await MenuItem.find({ available: true }).sort({ popularityScore: -1 });
  res.json(items);
});

module.exports = router;

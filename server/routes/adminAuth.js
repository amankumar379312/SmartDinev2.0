const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const Admin = require("../models/Admin");

// ✅ POST /api/admin/signup — create new admin
router.post("/signup", async (req, res) => {
  try {
    const { name, phone, email, password } = req.body;

    if (!name || !phone || !password) {
      return res.status(400).json({ message: "Name, phone, and password are required" });
    }

    const existing = await Admin.findOne({ phone });
    if (existing) {
      return res.status(400).json({ message: "Admin with this phone already exists" });
    }

    const hashed = await bcrypt.hash(password, 10);
    const newAdmin = await Admin.create({
      name,
      phone,
      email,
      password: hashed,
    });

    res.status(201).json({ message: "Admin account created successfully", admin: newAdmin });
  } catch (err) {
    console.error("Admin signup error:", err);
    res.status(500).json({ message: "Server error during signup" });
  }
});

// ✅ POST /api/admin/login — authenticate admin
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res
        .status(400)
        .json({ message: "Email and password required" });
    }

    const normEmail = email.toLowerCase().trim();

    const admin = await Admin.findOne({ email: normEmail });
    if (!admin) {
      return res.status(404).json({ message: "Admin not found" });
    }

    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const token = jwt.sign(
      {
        id: admin._id,
        name: admin.name,
        email: admin.email,
        phone: admin.phone,
        role: "admin",
      },
      process.env.JWT_SECRET || "secretkey",
      { expiresIn: "7d" }
    );

    const user = {
      id: admin._id,
      name: admin.name,
      email: admin.email,
      phone: admin.phone,
      role: "admin",
    };

    res.json({
      message: "Login successful",
      token,
      user,
      admin: user,
    });
  } catch (err) {
    console.error("Admin login error:", err);
    res.status(500).json({ message: "Server error during login" });
  }
});

module.exports = router;

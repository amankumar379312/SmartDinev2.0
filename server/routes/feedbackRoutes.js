const express = require("express");
const router = express.Router();
const Feedback = require("../models/Feedback");
const auth = require("../middleware/auth");

router.post("/", auth, async (req, res) => {
  try {
    console.log("FEEDBACK POST body:", req.body); // <-- see exactly what's arriving

    const { ratings, comment } = req.body;

    // validate that ratings is present and has numbers
    if (!ratings || typeof ratings !== "object") {
      return res.status(400).json({ ok: false, message: "ratings object required" });
    }
    const { foodQuality, ambience, overall } = ratings;
    const nums = [foodQuality, ambience, overall].map((n) => Number(n));
    if (nums.some((n) => !Number.isFinite(n) || n < 1 || n > 5)) {
      return res.status(400).json({ ok: false, message: "ratings must be numbers 1–5" });
    }

    const fb = await Feedback.create({
      ratings: { foodQuality: nums[0], ambience: nums[1], overall: nums[2] },
      comment: comment || undefined,
    });

    res.status(201).json({ ok: true, feedback: fb });
  } catch (err) {
    console.error("❌ Failed to save feedback:", err);
    res.status(500).json({ ok: false, message: "Failed to save feedback" });
  }
});

module.exports = router;

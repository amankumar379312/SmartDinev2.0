const express = require("express");
const router = express.Router();
const Request = require("../models/Request");
const PastRequest = require("../models/PastRequest");

// CREATE a new request  (used by CookDashboard ➜ API.post("/requests", payload))
router.post("/", async (req, res) => {
  try {
    const { type, name, category, price, notes, requestedBy } = req.body;

    if (!name || !type) {
      return res.status(400).json({ message: "type and name are required" });
    }

    const doc = await Request.create({
      type,
      name: name.trim(),
      category: category || null,
      price: price == null ? null : Number(price),
      notes: notes || "",
      requestedBy: requestedBy || "cook",
      status: "pending",
    });

    res.status(201).json(doc);
  } catch (err) {
    console.error("create request error:", err);
    res.status(500).json({ message: "Failed to create request" });
  }
});

// LIST requests (optional filter: ?status=pending|approved|rejected)
router.get("/", async (req, res) => {
  try {
    const status = (req.query.status || "").toLowerCase();
    const q = status ? { status } : {};
    const requests = await Request.find(q).sort({ createdAt: -1 });
    res.json(requests);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error fetching requests" });
  }
});

// DECIDE a request: archive into past_requests, then remove from active
router.post("/:id/decision", async (req, res) => {
  try {
    const { decision, decidedBy } = req.body;
    const dec = String(decision || "").toLowerCase();
    if (!["approved", "rejected"].includes(dec)) {
      return res.status(400).json({ message: "decision must be approved or rejected" });
    }

    const reqDoc = await Request.findById(req.params.id);
    if (!reqDoc) return res.status(404).json({ message: "Request not found" });

    await PastRequest.create({
      type: reqDoc.type,
      name: reqDoc.name,
      category: reqDoc.category,
      price: reqDoc.price,
      notes: reqDoc.notes,
      requestedBy: reqDoc.requestedBy,
      status: dec,
      createdAt: reqDoc.createdAt,
      decidedBy: decidedBy || "admin",
      decidedAt: new Date(),
    });

    await reqDoc.deleteOne();
    res.json({ message: `Request ${dec} & archived` });
  } catch (err) {
    console.error("decision error:", err);
    res.status(500).json({ message: "Failed to record decision" });
  }
});

module.exports = router;

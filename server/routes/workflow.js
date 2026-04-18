const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const WorkflowSession = require("../models/WorkflowSession");

function normalizeRoleScope(role) {
  const value = String(role || "").toLowerCase();
  if (value === "admin") return "admin";
  if (value === "cook" || value === "waiter" || value === "staff" || value === "chef") return "staff";
  return "user";
}

function sanitizeRouteState(routeState) {
  if (routeState == null) return null;
  try {
    return JSON.parse(JSON.stringify(routeState));
  } catch {
    return null;
  }
}

function serializeWorkflow(workflow) {
  if (!workflow) return null;
  return {
    pathname: workflow.pathname || null,
    search: workflow.search || "",
    hash: workflow.hash || "",
    routeState: workflow.routeState ?? null,
    tableId: workflow.tableId || null,
    activeOrderIds: Array.isArray(workflow.activeOrderIds) ? workflow.activeOrderIds.filter(Boolean) : [],
    currentStep: workflow.currentStep || null,
    paymentPending: Boolean(workflow.paymentPending),
    roleScope: workflow.roleScope || normalizeRoleScope(workflow.role),
    role: workflow.role || "user",
    status: workflow.status || "active",
    updatedAt: workflow.updatedAt,
  };
}

router.get("/current", auth, async (req, res) => {
  try {
    const workflow = await WorkflowSession.findOne({ userId: req.user.id, status: "active" }).lean();
    return res.json({ workflow: serializeWorkflow(workflow) });
  } catch (error) {
    console.error("Workflow fetch error:", error);
    return res.status(500).json({ message: "Failed to fetch workflow" });
  }
});

router.put("/current", auth, async (req, res) => {
  try {
    const {
      pathname = null,
      search = "",
      hash = "",
      routeState = null,
      tableId = null,
      activeOrderIds = [],
      currentStep = null,
      paymentPending = false,
      roleScope,
      status = "active",
    } = req.body || {};

    const normalizedRole = String(req.user.role || "user").toLowerCase();
    const normalizedRoleScope = roleScope || normalizeRoleScope(normalizedRole);

    const workflow = await WorkflowSession.findOneAndUpdate(
      { userId: req.user.id },
      {
        userId: req.user.id,
        userEmail: req.user.email || null,
        role: normalizedRole,
        roleScope: normalizedRoleScope,
        pathname,
        search,
        hash,
        routeState: sanitizeRouteState(routeState),
        tableId: tableId || null,
        activeOrderIds: Array.isArray(activeOrderIds) ? activeOrderIds.filter(Boolean) : [],
        currentStep: currentStep || null,
        paymentPending: Boolean(paymentPending),
        status: status === "closed" ? "closed" : "active",
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    return res.json({ workflow: serializeWorkflow(workflow) });
  } catch (error) {
    console.error("Workflow save error:", error);
    return res.status(500).json({ message: "Failed to save workflow" });
  }
});

router.delete("/current", auth, async (req, res) => {
  try {
    await WorkflowSession.findOneAndUpdate(
      { userId: req.user.id },
      {
        pathname: null,
        search: "",
        hash: "",
        routeState: null,
        tableId: null,
        activeOrderIds: [],
        currentStep: null,
        paymentPending: false,
        status: "closed",
      },
      { new: true }
    );
    return res.json({ ok: true });
  } catch (error) {
    console.error("Workflow clear error:", error);
    return res.status(500).json({ message: "Failed to clear workflow" });
  }
});

module.exports = router;

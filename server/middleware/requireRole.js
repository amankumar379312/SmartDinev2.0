module.exports = function requireRole(...allowedRoles) {
  const normalized = allowedRoles.map((role) => String(role).toLowerCase());

  return function roleGuard(req, res, next) {
    const role = String(req.user?.role || "").toLowerCase();
    if (!role || !normalized.includes(role)) {
      return res.status(403).json({ msg: "Forbidden" });
    }
    next();
  };
};

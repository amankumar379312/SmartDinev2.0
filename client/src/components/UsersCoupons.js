// src/components/UsersCoupons.jsx
import React, { useEffect, useMemo, useState } from "react";
import API from "../api";
import { Card, CardContent } from "./ui/card";
import { Button } from "./ui/button";
import { sendCouponEmail } from "../email"; // adjust path if needed

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";

export default function UsersCoupons() {
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState([]);
  const [orders, setOrders] = useState([]);
  const [error, setError] = useState("");

  const [segment, setSegment] = useState("all"); // all | top | highValue | dormant | new
  const [search, setSearch] = useState("");

  const [couponModal, setCouponModal] = useState({
    open: false,
    mode: "single", // "single" | "segment"
    targetUsers: [],
  });
  const [couponForm, setCouponForm] = useState({
    title: "Special Offer Just For You",
    code: "",
    discountType: "percent", // percent | flat
    discountValue: 20,
    minOrderValue: 500,
    expiresAt: "",
    message:
      "Thank you for dining with us. Enjoy this exclusive offer at SmartDine!",
  });
  const [sendingCoupon, setSendingCoupon] = useState(false);

  // ─────────────────────────────────────────────
  // Fetch users + previous orders (sales)
  // ─────────────────────────────────────────────
 useEffect(() => {
  const load = async () => {
    try {
      setLoading(true);
      setError("");

      // Use Promise.allSettled so one failing call doesn't kill everything
      const [uRes, oRes] = await Promise.allSettled([
        API.get("/auth/all-users"),
        API.get("/orders/sales"),
      ]);

      // USERS
      if (uRes.status === "fulfilled") {
        const data = uRes.value.data;
        const usersData = Array.isArray(data) ? data : data?.users || [];
        setUsers(usersData);
      } else {
        console.error("all-users error:", uRes.reason);
        setError((prev) => prev || "Failed to load users.");
      }

      // ORDERS / SALES
      if (oRes.status === "fulfilled") {
        const data = oRes.value.data;
        const ordersData = Array.isArray(data) ? data : data?.orders || [];
        setOrders(ordersData);
      } else {
        console.error("orders/sales error:", oRes.reason);
        setError((prev) =>
          prev ? prev + " Also failed to load orders." : "Failed to load orders."
        );
      }
    } catch (err) {
      console.error("UsersCoupons load error:", err);
      // ultra-fallback
      setError("Unexpected error while loading users or orders.");
    } finally {
      setLoading(false);
    }
  };

  load();
}, []);


  // ─────────────────────────────────────────────
  // Build per-user stats from orders
  // ─────────────────────────────────────────────
  const { enrichedUsers, globalStats, topCustomerChartData } = useMemo(() => {
    const statsByEmail = {};
    const emailKey = (e) => (e || "").trim().toLowerCase();

    orders.forEach((o) => {
      const e = emailKey(o.userEmail);
      if (!e) return;
      if (!statsByEmail[e]) {
        statsByEmail[e] = {
          orderCount: 0,
          totalSpend: 0,
          lastOrderAt: null,
        };
      }
      statsByEmail[e].orderCount += 1;
      statsByEmail[e].totalSpend += Number(o.totalCost) || 0;
      const created = o.createdAt ? new Date(o.createdAt) : null;
      if (
        created &&
        (!statsByEmail[e].lastOrderAt || created > statsByEmail[e].lastOrderAt)
      ) {
        statsByEmail[e].lastOrderAt = created;
      }
    });

    const enriched = users.map((u) => {
      const e = emailKey(u.email);
      const s = statsByEmail[e] || {
        orderCount: 0,
        totalSpend: 0,
        lastOrderAt: null,
      };

      const lastOrderDisplay = s.lastOrderAt
        ? s.lastOrderAt.toLocaleDateString("en-IN", {
            day: "2-digit",
            month: "short",
            year: "2-digit",
          })
        : "—";

      return {
        ...u,
        orderCount: s.orderCount,
        totalSpend: s.totalSpend,
        lastOrderAt: s.lastOrderAt,
        lastOrderDisplay,
      };
    });

    const totalUsers = enriched.length;
    const customersWithOrders = enriched.filter((u) => u.orderCount > 0).length;
    const totalRevenue = enriched.reduce((acc, u) => acc + u.totalSpend, 0);
    const avgPerCustomer = customersWithOrders
      ? totalRevenue / customersWithOrders
      : 0;

    const topChartData = enriched
      .filter((u) => u.totalSpend > 0)
      .sort((a, b) => b.totalSpend - a.totalSpend)
      .slice(0, 7)
      .map((u) => ({
        email: u.email || "Unknown",
        revenue: Math.round(u.totalSpend),
      }));

    return {
      enrichedUsers: enriched,
      globalStats: {
        totalUsers,
        customersWithOrders,
        totalRevenue,
        avgPerCustomer,
      },
      topCustomerChartData: topChartData,
    };
  }, [users, orders]);

  // ─────────────────────────────────────────────
  // Segment + Search filter
  // ─────────────────────────────────────────────
  const filteredUsers = useMemo(() => {
    const now = new Date();
    const searchQ = search.trim().toLowerCase();

    const inSearch = (u) => {
      if (!searchQ) return true;
      return (
        (u.name || "").toLowerCase().includes(searchQ) ||
        (u.email || "").toLowerCase().includes(searchQ) ||
        (u.phone || "").toLowerCase().includes(searchQ)
      );
    };

    let base = enrichedUsers.filter(inSearch);

    const daysDiff = (d) => {
      if (!d) return Infinity;
      return (now - d) / (1000 * 60 * 60 * 24);
    };

    switch (segment) {
      case "top":
        return [...base]
          .filter((u) => u.totalSpend > 0)
          .sort((a, b) => b.totalSpend - a.totalSpend)
          .slice(0, 15);
      case "highValue":
        return base.filter((u) => u.totalSpend >= 3000);
      case "dormant":
        return base.filter(
          (u) => u.orderCount > 0 && daysDiff(u.lastOrderAt) >= 30
        );
      case "new":
        return base.filter(
          (u) => u.orderCount > 0 && daysDiff(u.lastOrderAt) <= 14
        );
      default:
        return base;
    }
  }, [enrichedUsers, segment, search]);

  const segmentLabelMap = {
    all: "All Customers",
    top: "Top Spenders",
    highValue: "High Value (₹3000+)",
    dormant: "Dormant (30+ days)",
    new: "Recently Active (≤14 days)",
  };

  // ─────────────────────────────────────────────
  // Coupon modal logic
  // ─────────────────────────────────────────────
  const openCouponForUser = (user) => {
    setCouponModal({
      open: true,
      mode: "single",
      targetUsers: [user],
    });
  };

  const openCouponForSegment = () => {
    if (!filteredUsers.length) {
      alert("No users in this segment to send coupons to.");
      return;
    }
    setCouponModal({
      open: true,
      mode: "segment",
      targetUsers: filteredUsers,
    });
  };

  const closeCouponModal = () => {
    setCouponModal({ open: false, mode: "single", targetUsers: [] });
  };

  const handleCouponChange = (field, value) => {
    setCouponForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const sendCoupons = async (e) => {
    e.preventDefault();
    if (!couponForm.code || !couponForm.discountValue) {
      alert("Please fill coupon code and discount value.");
      return;
    }

    const targets = couponModal.targetUsers || [];
    if (!targets.length) {
      alert("No users selected to send coupons.");
      return;
    }

    setSendingCoupon(true);
    try {
      // send to all users in parallel
      const emailPromises = targets
        .filter((u) => u.email)
        .map((u) => sendCouponEmail(u, couponForm));

      await Promise.all(emailPromises);

      alert(
        couponModal.mode === "single"
          ? `Coupon email sent to ${targets[0]?.email}`
          : `Coupon emails sent to ${targets.length} users in "${segmentLabelMap[segment]}" segment`
      );
      closeCouponModal();
    } catch (err) {
      console.error("Failed to send coupon emails:", err);
      alert("Failed to send coupon email(s). Check console for details.");
    } finally {
      setSendingCoupon(false);
    }
  };


  // ─────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────
  return (
    <div className="uc-panel animate-fadeIn">
      {/* HEADER */}
      <div className="uc-header">
        <div>
          <h2 className="uc-title">🎯 Users & Coupons</h2>
          <p className="uc-subtitle">
            Understand your customers and send targeted coupons to boost repeat
            orders.
          </p>
        </div>
        <div className="uc-header-actions">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, phone…"
            className="uc-search"
          />
          <select
            value={segment}
            onChange={(e) => setSegment(e.target.value)}
            className="uc-segment-select"
          >
            <option value="all">All Customers</option>
            <option value="top">Top Spenders</option>
            <option value="highValue">High Value (₹3000+)</option>
            <option value="dormant">Dormant (30+ days)</option>
            <option value="new">Recently Active (≤14 days)</option>
          </select>
          <Button
            className="uc-btn uc-btn-gradient"
            variant="outline"
            size="sm"
            onClick={openCouponForSegment}
          >
            🎁 Send coupon to segment
          </Button>
        </div>
      </div>

      {/* STATUS */}
      {loading && <p className="uc-muted">Loading users and orders…</p>}
      {error && <p className="uc-error">{error}</p>}

      {!loading && !error && (
        <>
          {/* GLOBAL METRICS */}
          <div className="uc-metrics-grid">
            <Card className="analytics-card">
              <CardContent className="uc-metric-card">
                <p className="uc-metric-label">Total Users</p>
                <p className="uc-metric-value">{globalStats.totalUsers}</p>
              </CardContent>
            </Card>

            <Card className="analytics-card">
              <CardContent className="uc-metric-card">
                <p className="uc-metric-label">Customers with Orders</p>
                <p className="uc-metric-value">
                  {globalStats.customersWithOrders}
                </p>
              </CardContent>
            </Card>

            <Card className="analytics-card">
              <CardContent className="uc-metric-card">
                <p className="uc-metric-label">Total Revenue</p>
                <p className="uc-metric-value">
                  ₹{globalStats.totalRevenue.toFixed(0)}
                </p>
              </CardContent>
            </Card>

            <Card className="analytics-card">
              <CardContent className="uc-metric-card">
                <p className="uc-metric-label">Avg Revenue / Customer</p>
                <p className="uc-metric-value">
                  ₹{globalStats.avgPerCustomer.toFixed(0)}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* CHART + SEGMENT INFO */}
          <div className="uc-grid-2">
            <Card className="analytics-card">
              <CardContent className="p-6">
                <h3 className="card-title">🏆 Top Customers by Revenue</h3>
                {topCustomerChartData.length === 0 ? (
                  <p className="uc-muted">
                    Not enough data yet to show top customers.
                  </p>
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart
                      data={topCustomerChartData}
                      layout="vertical"
                      margin={{ left: 10 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" />
                      <YAxis type="category" dataKey="email" width={180} />
                      <Tooltip />
                      <Bar dataKey="revenue" fill="#4f46e5" radius={6} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card className="analytics-card">
              <CardContent className="p-6 uc-segment-card">
                <h3 className="card-title">👥 Segment Details</h3>
                <p className="uc-segment-pill">{segmentLabelMap[segment]}</p>
                <p className="uc-muted">
                  Showing <strong>{filteredUsers.length}</strong> users in this
                  segment.
                </p>
                <ul className="uc-segment-tips">
                  <li>
                    <span>Top Spenders:</span> Highest total revenue customers.
                  </li>
                  <li>
                    <span>High Value:</span> Lifetime spend above ₹3000.
                  </li>
                  <li>
                    <span>Dormant:</span> Ordered before but inactive for 30+
                    days.
                  </li>
                  <li>
                    <span>Recently Active:</span> Ordered in last 14 days.
                  </li>
                </ul>
                <p className="uc-muted-small">
                  Tip: choose a segment, tweak the coupon details, and send a
                  targeted campaign in one click.
                </p>
              </CardContent>
            </Card>
          </div>

          {/* USERS TABLE */}
          <Card className="analytics-card uc-users-card">
            <CardContent className="p-0">
              <div className="uc-users-header">
                <h3 className="card-title">
                  👤 Customers ({segmentLabelMap[segment]})
                </h3>
              </div>
              {filteredUsers.length === 0 ? (
                <p className="uc-muted uc-users-empty">
                  No users found for this search / segment.
                </p>
              ) : (
                <div className="uc-users-table-wrapper">
                  <table className="uc-users-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Email</th>
                        <th>Phone</th>
                        <th>Orders</th>
                        <th>Total Spend</th>
                        <th>Last Order</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredUsers.map((u) => (
                        <tr key={u._id}>
                          <td>{u.name || "—"}</td>
                          <td>{u.email || "—"}</td>
                          <td>{u.phone || "—"}</td>
                          <td>{u.orderCount}</td>
                          <td>₹{u.totalSpend.toFixed(0)}</td>
                          <td>{u.lastOrderDisplay}</td>
                          <td>
                            {u.email && (
                              <button
                                className="uc-chip-btn"
                                onClick={() => openCouponForUser(u)}
                              >
                                🎁 Send coupon
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* COUPON MODAL */}
      {couponModal.open && (
        <div className="uc-modal-backdrop">
          <div className="uc-modal">
            <div className="uc-modal-header">
              <h3>
                {couponModal.mode === "single"
                  ? `Send Coupon to ${couponModal.targetUsers[0]?.name ||
                      couponModal.targetUsers[0]?.email ||
                      "User"}`
                  : `Send Coupon to ${couponModal.targetUsers.length} Users`}
              </h3>
              <button
                className="uc-modal-close"
                type="button"
                onClick={closeCouponModal}
              >
                ✕
              </button>
            </div>

            <form onSubmit={sendCoupons} className="uc-modal-body">
              <div className="uc-field">
                <label>Coupon Title</label>
                <input
                  type="text"
                  value={couponForm.title}
                  onChange={(e) =>
                    handleCouponChange("title", e.target.value)
                  }
                />
              </div>

              <div className="uc-field">
                <label>Coupon Code</label>
                <input
                  type="text"
                  value={couponForm.code}
                  onChange={(e) =>
                    handleCouponChange("code", e.target.value.toUpperCase())
                  }
                  placeholder="SMART20"
                />
              </div>

              <div className="uc-two-col">
                <div className="uc-field">
                  <label>Discount Type</label>
                  <select
                    value={couponForm.discountType}
                    onChange={(e) =>
                      handleCouponChange("discountType", e.target.value)
                    }
                  >
                    <option value="percent">Percent (%)</option>
                    <option value="flat">Flat (₹)</option>
                  </select>
                </div>

                <div className="uc-field">
                  <label>Discount Value</label>
                  <input
                    type="number"
                    min="1"
                    value={couponForm.discountValue}
                    onChange={(e) =>
                      handleCouponChange(
                        "discountValue",
                        Number(e.target.value || 0)
                      )
                    }
                  />
                </div>
              </div>

              <div className="uc-two-col">
                <div className="uc-field">
                  <label>Minimum Order Value (₹)</label>
                  <input
                    type="number"
                    min="0"
                    value={couponForm.minOrderValue}
                    onChange={(e) =>
                      handleCouponChange(
                        "minOrderValue",
                        Number(e.target.value || 0)
                      )
                    }
                  />
                </div>
                <div className="uc-field">
                  <label>Expires On</label>
                  <input
                    type="date"
                    value={couponForm.expiresAt}
                    onChange={(e) =>
                      handleCouponChange("expiresAt", e.target.value)
                    }
                  />
                </div>
              </div>

              <div className="uc-field">
                <label>Message</label>
                <textarea
                  rows={3}
                  value={couponForm.message}
                  onChange={(e) =>
                    handleCouponChange("message", e.target.value)
                  }
                />
              </div>

              <div className="uc-modal-footer">
                <button
                  type="button"
                  className="uc-btn uc-btn-ghost"
                  onClick={closeCouponModal}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="uc-btn uc-btn-gradient"
                  disabled={sendingCoupon}
                >
                  {sendingCoupon
                    ? "Sending…"
                    : couponModal.mode === "single"
                    ? "Send Coupon"
                    : `Send to ${couponModal.targetUsers.length} users`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

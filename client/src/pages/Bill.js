import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import API from "../api";
import "../styles/Bill.css";
import {
  buildWorkflowPayload,
  readStoredOrderIds,
} from "../utils/workflowSession";
import {
  UtensilsCrossed,
  Receipt,
  CreditCard,
  User,
  Hash,
  ShoppingBag,
  Calendar,
  ChevronRight,
  Sparkles,
} from "lucide-react";

export default function Bill() {
  const location = useLocation();
  const { state } = location;
  const tableId = localStorage.getItem("tableId") || "T-01";
  const requestedOrderIds = useMemo(
    () => (
      Array.isArray(state?.orderIds)
        ? state.orderIds.filter(Boolean)
        : state?.orderId ? [state.orderId] : readStoredOrderIds(tableId)
    ),
    [state, tableId]
  );

  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const redirectedRef = useRef(false);

  useEffect(() => {
    if (requestedOrderIds.length === 0) {
      setLoading(false);
      setSummary(null);
      return;
    }

    (async () => {
      try {
        const res = await API.post("/orders/summary", { orderIds: requestedOrderIds });
        setSummary(res.data?.summary || null);
      } catch (err) {
        console.error("Fetch order summary failed:", err);
        setSummary(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [requestedOrderIds]);

  useEffect(() => {
    if (requestedOrderIds.length === 0) return;

    let cancelled = false;

    (async () => {
      try {
        await API.put("/workflow/current", buildWorkflowPayload({
          pathname: location.pathname,
          search: location.search,
          hash: location.hash,
          routeState: state ?? null,
          roleScope: "user",
          currentStep: "bill",
          tableId,
          activeOrderIds: requestedOrderIds,
          paymentPending: true,
        }));
      } catch (error) {
        if (!cancelled) {
          console.error("Failed to sync bill workflow", error);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [location.hash, location.pathname, location.search, requestedOrderIds, state, tableId]);

  const totalItems = useMemo(
    () => (summary?.items || []).reduce((sum, item) => sum + item.qty, 0),
    [summary]
  );

  if (requestedOrderIds.length === 0) return (
    <div className="bill-page-shell">
      <div className="bill-ambient-blob bill-blob-1" />
      <div className="bill-ambient-blob bill-blob-2" />
      <div className="bill-state-card">
        <Receipt className="bill-state-icon" size={40} />
        <p className="bill-state-text">No order selected.</p>
      </div>
    </div>
  );

  if (loading) return (
    <div className="bill-page-shell">
      <div className="bill-ambient-blob bill-blob-1" />
      <div className="bill-ambient-blob bill-blob-2" />
      <div className="bill-loading-ring" />
    </div>
  );

  if (!summary) return (
    <div className="bill-page-shell">
      <div className="bill-ambient-blob bill-blob-1" />
      <div className="bill-ambient-blob bill-blob-2" />
      <div className="bill-state-card">
        <Receipt className="bill-state-icon" size={40} />
        <p className="bill-state-text">Bill not found.</p>
      </div>
    </div>
  );

  const handlePayment = async () => {
    try {
      const paymentRes = await API.post("/payment/create-checkout-session", { orderIds: summary.orderIds });
      const url = paymentRes.data?.url;

      if (redirectedRef.current) return;
      redirectedRef.current = true;

      if (url) {
        window.location.href = url;
        return;
      }

      redirectedRef.current = false;
      alert("Payment link not received.");
    } catch (err) {
      redirectedRef.current = false;
      console.error(err);
      alert("Failed to initiate payment");
    }
  };

  return (
    <div className="bill-page-shell">
      {/* Ambient blobs */}
      <div className="bill-ambient-blob bill-blob-1" />
      <div className="bill-ambient-blob bill-blob-2" />

      <div className="bill-card-outer">

        {/* ── Brand Header ── */}
        <header className="bill-brand-header">
          <div className="bill-brand-logo">
            <div className="bill-logo-icon-wrap">
              <UtensilsCrossed size={22} className="bill-logo-icon" />
            </div>
            <span className="bill-logo-text">SmartDine</span>
          </div>
          <span className="bill-badge-pill">
            <Sparkles size={12} />
            Invoice
          </span>
        </header>

        {/* ── Main Card ── */}
        <div className="bill-main-card">

          {/* Title block */}
          <div className="bill-title-block">
            <div className="bill-receipt-icon-wrap">
              <Receipt size={28} className="bill-receipt-icon" />
            </div>
            <h1 className="bill-title">Your Bill</h1>
            <p className="bill-subtitle">Please review your order details below</p>
          </div>

          {/* Meta grid */}
          <div className="bill-meta-grid">
            <div className="bill-meta-item">
              <div className="bill-meta-label-row">
                <User size={12} className="bill-meta-label-icon" />
                <span className="bill-meta-label">Email</span>
              </div>
              <p className="bill-meta-value bill-meta-value--sm">{summary.userEmail || "—"}</p>
            </div>
            <div className="bill-meta-item">
              <div className="bill-meta-label-row">
                <Hash size={12} className="bill-meta-label-icon" />
                <span className="bill-meta-label">Table</span>
              </div>
              <p className="bill-meta-value bill-meta-value--accent">{summary.tableNo || tableId || "—"}</p>
            </div>
            <div className="bill-meta-item">
              <div className="bill-meta-label-row">
                <ShoppingBag size={12} className="bill-meta-label-icon" />
                <span className="bill-meta-label">Total Items</span>
              </div>
              <p className="bill-meta-value">{totalItems}</p>
            </div>
            <div className="bill-meta-item">
              <div className="bill-meta-label-row">
                <Calendar size={12} className="bill-meta-label-icon" />
                <span className="bill-meta-label">Date &amp; Time</span>
              </div>
              <p className="bill-meta-value bill-meta-value--sm">
                {summary.placedAt ? new Date(summary.placedAt).toLocaleString() : "—"}
              </p>
            </div>
          </div>

          {/* Divider */}
          <div className="bill-divider" />

          {/* Order Summary */}
          <div className="bill-order-section">
            <h2 className="bill-section-title">Order Summary</h2>
            <div className="bill-item-list">
              {(summary.items || []).map((item, idx) => (
                <div key={idx} className="bill-item-row">
                  <div className="bill-item-left">
                    <div className="bill-item-qty">{item.qty}×</div>
                    <span className="bill-item-name">{item.name}</span>
                  </div>
                  <div className="bill-item-price">₹ {item.lineTotal}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Total banner */}
          <div className="bill-total-banner">
            <div>
              <p className="bill-total-label">Grand Total</p>
              <p className="bill-total-amount">₹ {summary.total}</p>
            </div>
            <div className="bill-total-badge">
              <Receipt size={18} />
            </div>
          </div>

          {/* Pay button */}
          <button
            onClick={handlePayment}
            className="bill-pay-btn"
            id="bill-pay-btn"
          >
            <CreditCard size={20} />
            Proceed to Pay
            <ChevronRight size={20} className="bill-btn-arrow" />
          </button>

          {/* Footer */}
          <p className="bill-footer-note">
            Secured payment powered by SmartDine
          </p>
        </div>
      </div>
    </div>
  );
}

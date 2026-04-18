import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { io } from "socket.io-client";
import API from "../api";
import { resolveSocketBaseUrl } from "../utils/runtimeConfig";
import "../styles/Bill.css";
import {
  buildWorkflowPayload,
  getAfterOrderStorageKey,
  readStoredOrderIds,
} from "../utils/workflowSession";

const SOCKET_URL = resolveSocketBaseUrl();

const socket = io(SOCKET_URL, { transports: ["websocket"] });

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
    <div className="min-h-screen bg-[#020617] flex items-center justify-center p-4">
      <div className="text-center text-slate-400 font-medium">No order selected.</div>
    </div>
  );
  if (loading) return (
    <div className="min-h-screen bg-[#020617] flex items-center justify-center p-4">
      <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
  if (!summary) return (
    <div className="min-h-screen bg-[#020617] flex items-center justify-center p-4">
      <div className="text-center text-slate-400 font-medium">Bill not found.</div>
    </div>
  );

  const handlePayment = async () => {
    try {
      const paymentRes = await API.post("/payment/create-checkout-session", { orderIds: summary.orderIds });
      const url = paymentRes.data?.url;

      await API.post("/orders/markPaid/bulk", { orderIds: summary.orderIds });

      if (tableId) {
        try {
          await API.patch(`/tables/clear-by-tableid/${tableId}`);
        } catch (clearErr) {
          console.warn("Could not clear table after payment:", clearErr);
        }
      }

      localStorage.removeItem(getAfterOrderStorageKey(tableId));
      await API.delete("/workflow/current");

      const doRedirect = () => {
        if (redirectedRef.current) return;
        redirectedRef.current = true;
        if (url) window.location.href = url;
        else alert("Payment link not received.");
      };

      socket.emit("table:paid", {
        tableId: tableId || summary.tableNo || "—",
        orderId: summary.orderIds[summary.orderIds.length - 1] || null,
        total: summary.total,
      });

      setTimeout(doRedirect, 600);
    } catch (err) {
      console.error(err);
      alert("Failed to initiate payment");
    }
  };

  return (
    <div className="min-h-screen bg-[#020617] flex items-center justify-center p-4 sm:p-8 font-sans selection:bg-orange-500 selection:text-white relative">
      {/* BACKGROUND */}
      <div className="fixed inset-0 z-0">
        <div className="absolute inset-0 bg-gradient-to-b from-[#020617] via-[#020617] to-[#020617]" />
      </div>

      <div className="relative z-10 w-full max-w-xl bg-slate-900/80 backdrop-blur-xl border border-white/10 rounded-3xl shadow-2xl overflow-hidden p-6 sm:p-10">
        <div className="text-center mb-8">
          <div className="mx-auto w-16 h-16 bg-orange-500/10 rounded-full flex items-center justify-center mb-4 border border-orange-500/20 shadow-[0_0_30px_rgba(249,115,22,0.15)]">
            <span className="text-3xl">🧾</span>
          </div>
          <h1 className="text-3xl font-black text-white tracking-tight">Your Bill</h1>
          <p className="text-sm font-medium text-slate-400 mt-2">Please review your order details</p>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-8 bg-black/30 p-5 rounded-2xl border border-white/5">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-slate-500 mb-1 font-bold">Email</p>
            <p className="text-sm text-slate-300 font-medium truncate">{summary.userEmail || "—"}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-slate-500 mb-1 font-bold">Table No</p>
            <p className="text-sm text-white font-bold">{summary.tableNo || tableId || "—"}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-slate-500 mb-1 font-bold">Total Items</p>
            <p className="text-sm text-white font-bold">{totalItems}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-slate-500 mb-1 font-bold">Date & Time</p>
            <p className="text-sm text-slate-300 font-medium">{summary.placedAt ? new Date(summary.placedAt).toLocaleString() : "—"}</p>
          </div>
        </div>

        <div className="mb-8">
          <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-4 px-1">Order Summary</h2>
          <div className="space-y-3 font-medium">
            {(summary.items || []).map((item, idx) => (
              <div key={idx} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-xs font-bold text-slate-300">
                    {item.qty}x
                  </div>
                  <span className="text-sm text-slate-200">{item.name}</span>
                </div>
                <div className="text-sm font-bold text-white">
                  ₹{item.lineTotal}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-end justify-between p-5 bg-gradient-to-r from-orange-500/10 to-transparent border-l-4 border-orange-500 rounded-xl mb-8">
          <div>
             <p className="text-xs font-bold text-orange-400 uppercase tracking-widest mb-1">Total Amount</p>
             <p className="text-3xl font-black text-white leading-none">₹{summary.total}</p>
          </div>
        </div>

        <button 
          onClick={handlePayment}
          className="w-full flex items-center justify-center gap-2 py-4 rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 text-white font-bold text-lg shadow-lg shadow-orange-500/30 transition-all hover:-translate-y-1"
        >
          Proceed to Pay
        </button>
      </div>
    </div>
  );
}

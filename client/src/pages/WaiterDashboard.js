import React, { useState, useEffect, useCallback, useMemo } from "react";
import { io } from "socket.io-client";
import API from "../api";
import { resolveSocketBaseUrl } from "../utils/runtimeConfig";
import { menu } from "../data/menu";
import LogoutButton from "../components/LogoutButton";
import { RefreshCw, Plus, Check, Clock, User, LayoutGrid, BellRing, X, Trash2, Sparkles, Armchair, UsersRound, Ban, UtensilsCrossed, Receipt } from "lucide-react";

// ── SOCKET ────────────────────────────────────────────────────────────────────
const SOCKET_URL = resolveSocketBaseUrl();

const socket = io(SOCKET_URL, { transports: ["websocket"] });

const ICON_SIZE = 26;
const commonImg = "w-9 h-9 sm:w-10 sm:h-10 object-contain";
const getTableIcon = (seats, isOccupied) => {
  if (isOccupied) return <Ban size={ICON_SIZE} className="text-white" />;
  switch (seats) {
    case 1: return <Armchair size={ICON_SIZE} className="text-white" />;
    case 2: return <img src="/two-seater.png" alt="2 seater" className={commonImg} />;
    case 4: return <img src="/four-seater.png" alt="4 seater" className={commonImg} />;
    case 6: return <img src="/six-seater.png" alt="6 seater" className={commonImg} />;
    default: return <UsersRound size={ICON_SIZE} className="text-white" />;
  }
};

export default function WaiterDashboard() {
  const [readyOrders, setReadyOrders] = useState([]);
  const [billReadyTables, setBillReadyTables] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isPosOpen, setIsPosOpen] = useState(false);
  const [cart, setCart] = useState([]);
  const [email, setEmail] = useState("");
  const [tableNo, setTableNo] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [occupiedTables, setOccupiedTables] = useState([]);
  const [activeTab, setActiveTab] = useState("orders");
  const [allTables, setAllTables] = useState([]);
  const [tablesLoading, setTablesLoading] = useState(false);

  // Waiter call notifications: { id, tableId, orderId, accepted }
  const [waiterCalls, setWaiterCalls] = useState([]);

  // Clean table notifications: { id, tableId, orderId, total, done }
  const [cleanRequests, setCleanRequests] = useState([]);

  // Custom Confirm Modal State
  const [confirmCleanOpen, setConfirmCleanOpen] = useState(null);
  const [confirmServeOpen, setConfirmServeOpen] = useState(null);
  const [confirmCashOpen, setConfirmCashOpen] = useState(null);
  const [infoPopup, setInfoPopup] = useState(null);

  const normalize = (s) => String(s || "").toLowerCase();

  // ── FETCH ORDERS ──────────────────────────────────────────────────────────
  const fetchOrders = useCallback(async () => {
    try {
      setLoading(true);
      const res = await API.get("/orders");
      const list = Array.isArray(res.data?.orders)
        ? res.data.orders
        : Array.isArray(res.data) ? res.data : [];
      const ready = list
        .filter(o => normalize(o.status) === "ready")
        .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
      const servedUnpaid = list
        .filter(o => normalize(o.status) === "served")
        .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
      const groupedBillReady = Object.values(servedUnpaid.reduce((acc, order) => {
        const tableKey = order.tableNo || "Walk-in";
        if (!acc[tableKey]) {
          acc[tableKey] = {
            tableNo: tableKey,
            orderIds: [],
            userEmail: order.userEmail || "",
            totalCost: 0,
            itemCount: 0,
            ordersCount: 0,
            latestCreatedAt: order.createdAt || null,
          };
        }
        acc[tableKey].orderIds.push(order._id);
        acc[tableKey].totalCost += Number(order.totalCost) || 0;
        acc[tableKey].itemCount += Array.isArray(order.items) ? order.items.length : 0;
        acc[tableKey].ordersCount += 1;
        if (!acc[tableKey].userEmail && order.userEmail) acc[tableKey].userEmail = order.userEmail;
        if (new Date(order.createdAt || 0) > new Date(acc[tableKey].latestCreatedAt || 0)) {
          acc[tableKey].latestCreatedAt = order.createdAt || null;
        }
        return acc;
      }, {}));
      setReadyOrders(ready);
      setBillReadyTables(groupedBillReady);
    } catch (e) {
      console.error("Failed to fetch orders:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrders();
    const id = setInterval(fetchOrders, 15000);
    return () => clearInterval(id);
  }, [fetchOrders]);

  // ── FETCH TABLES FOR POS ──────────────────────────────────────────────────
  useEffect(() => {
    if (!isPosOpen) return;
    (async () => {
      try {
        const res = await API.get("/tables");
        const tables = Array.isArray(res.data) ? res.data : [];
        setOccupiedTables(tables.filter(t => t.status === "occupied"));
      } catch (e) { console.error("Failed to fetch tables:", e); }
    })();
  }, [isPosOpen]);

  // ── FETCH ALL TABLES ──────────────────────────────────────────────────────
  const fetchAllTables = useCallback(async () => {
    setTablesLoading(true);
    try {
      const res = await API.get("/tables");
      setAllTables(Array.isArray(res.data) ? res.data : []);
    } catch (e) {
      console.error("Failed to fetch tables:", e);
    } finally {
      setTablesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "tables") fetchAllTables();
  }, [activeTab, fetchAllTables]);

  // ── SOCKET: waiter room ───────────────────────────────────────────────────
  useEffect(() => {
    const joinWaiters = () => {
      console.log("Joining waiters room...");
      socket.emit("joinWaiters");
    };
    joinWaiters();
    socket.on("connect", joinWaiters);

    const handleWaiterCalled = ({ tableId, orderId }) => {
      setWaiterCalls(prev => {
        if (prev.some(c => c.tableId === tableId && !c.accepted)) return prev;
        return [...prev, { id: Date.now(), tableId, orderId, accepted: false }];
      });
    };

    const handleTableClean = ({ tableId, orderId, total }) => {
      console.log("table:clean received", { tableId, orderId, total });
      setCleanRequests(prev => {
        if (prev.some(c => c.tableId === tableId && !c.done)) return prev;
        return [...prev, { id: Date.now(), tableId, orderId, total, done: false }];
      });
    };

    const handleTableCleared = ({ tableId }) => {
      setCleanRequests(prev => prev.filter(c => c.tableId !== tableId));
      setWaiterCalls(prev => prev.filter(c => c.tableId !== tableId));
      setAllTables(prev => prev.map((table) => (
        table.tableId === tableId
          ? { ...table, status: "available", heldBy: null, holdExpiresAt: null, occupiedAt: null }
          : table
      )));
    };

    socket.on("waiter:called", handleWaiterCalled);
    socket.on("table:clean", handleTableClean);
    socket.on("tableCleared", handleTableCleared);

    return () => {
      socket.off("connect", joinWaiters);
      socket.off("waiter:called", handleWaiterCalled);
      socket.off("table:clean", handleTableClean);
      socket.off("tableCleared", handleTableCleared);
    };
  }, []);

  // ── ACCEPT WAITER CALL ────────────────────────────────────────────────────
  const acceptWaiterCall = (call) => {
    setWaiterCalls(prev => prev.map(c => c.id === call.id ? { ...c, accepted: true } : c));
    socket.emit("waiter:accept", { tableId: call.tableId, orderId: call.orderId });
    setTimeout(() => setWaiterCalls(prev => prev.filter(c => c.id !== call.id)), 2500);
  };

  const dismissWaiterCall = (id) =>
    setWaiterCalls(prev => prev.filter(c => c.id !== id));

  // ── ACCEPT CLEAN REQUEST ──────────────────────────────────────────────────
  const acceptCleanRequest = (req) => {
    setCleanRequests(prev => prev.map(c => c.id === req.id ? { ...c, done: true } : c));
    setTimeout(() => setCleanRequests(prev => prev.filter(c => c.id !== req.id)), 2500);
  };

  const dismissCleanRequest = (id) =>
    setCleanRequests(prev => prev.filter(c => c.id !== id));

  // ── TABLE CLEAR ───────────────────────────────────────────────────────────
  const handleCleanClick = (table) => {
    setConfirmCleanOpen(table);
  };

  const confirmCleanTable = async () => {
    if (!confirmCleanOpen) return;
    try {
      await API.patch(`/tables/clear/${confirmCleanOpen._id}`);
      setCleanRequests(prev => prev.filter(c => c.tableId !== confirmCleanOpen.tableId));
      setWaiterCalls(prev => prev.filter(c => c.tableId !== confirmCleanOpen.tableId));
      fetchAllTables();
    } catch (e) {
      console.error("Failed to clear table:", e);
      setInfoPopup({
        title: "Table Cannot Be Cleared",
        message: e?.response?.data?.msg || "Could not clear table.",
      });
    } finally {
      setConfirmCleanOpen(null);
    }
  };

  const markServed = (orderId) => {
    setConfirmServeOpen(orderId);
  };

  const confirmServeOrder = async () => {
    if (!confirmServeOpen) return;
    try {
      await API.patch(`/orders/${confirmServeOpen}/status`, { status: "served" });
      fetchOrders();
    } catch (e) {
      console.error("Failed to mark served", e);
    } finally {
      setConfirmServeOpen(null);
    }
  };

  // ── CASH RECEIVED (Table Status tab only) ────────────────────────────────
  // billGroup includes _tableId so we can auto-clear the table after payment
  const markCashReceived = (billGroup) => {
    setConfirmCashOpen(billGroup);
  };

  const confirmCashReceived = async () => {
    if (!confirmCashOpen?.orderIds?.length) return;
    try {
      // 1. Mark orders as paid — backend also updates WorkflowSession to redirect customer to /thank-you
      await API.post("/orders/markPaid/cash", { orderIds: confirmCashOpen.orderIds });
      setBillReadyTables((prev) => prev.filter((entry) => entry.tableNo !== confirmCashOpen.tableNo));

      // 2. Auto-clear the table so it becomes available immediately
      if (confirmCashOpen._tableId) {
        try {
          await API.patch(`/tables/clear/${confirmCashOpen._tableId}`);
        } catch (clearErr) {
          console.warn("Could not auto-clear table:", clearErr);
        }
      }

      fetchOrders();
      fetchAllTables();
    } catch (e) {
      console.error("Failed to mark cash received", e);
      setInfoPopup({
        title: "Cash Payment Failed",
        message: e?.response?.data?.message || "Could not record cash payment.",
      });
    } finally {
      setConfirmCashOpen(null);
    }
  };

  // ── MENU ──────────────────────────────────────────────────────────────────
  const normalizedMenu = useMemo(() => {
    const toRow = i => ({ name: i.name, price: Number(i.price) || 0, description: i.description || "" });
    return {
      starters: (menu.starters || []).map(toRow),
      maincourse: (menu.maincourse || []).map(toRow),
      desserts: (menu.desserts || []).map(toRow),
    };
  }, []);

  // ── CART ──────────────────────────────────────────────────────────────────
  const addToCart = (name, price) => {
    setCart(prev => {
      const idx = prev.findIndex(it => it.name === name);
      if (idx >= 0) { const next = [...prev]; next[idx] = { ...next[idx], qty: next[idx].qty + 1 }; return next; }
      return [...prev, { name, price: Number(price) || 0, qty: 1 }];
    });
  };
  const updateQty = (name, delta) => setCart(prev => prev.map(it => it.name === name ? { ...it, qty: it.qty + delta } : it).filter(it => it.qty > 0));
  const removeItem = (name) => setCart(prev => prev.filter(it => it.name !== name));
  const totalCost = cart.reduce((s, it) => s + it.price * it.qty, 0);

  const placeManualOrder = async (e) => {
    e.preventDefault();
    if (!tableNo || cart.length === 0) { alert("Please select a table and add items."); return; }
    try {
      setSubmitting(true);
      const items = cart.flatMap(it => Array.from({ length: it.qty }).map(() => it.name));
      await API.post("/orders/create", { email: email.trim() || undefined, tableNo, items, totalCost });
      alert("✅ Order placed successfully!");
      setCart([]); setEmail(""); setTableNo(""); setIsPosOpen(false);
      fetchOrders();
    } catch (e) {
      console.error("Error placing order:", e);
      alert("Failed to place order.");
    } finally {
      setSubmitting(false);
    }
  };

  const pendingCallsCount = waiterCalls.filter(c => !c.accepted).length;
  const pendingCleanCount = cleanRequests.filter(c => !c.done).length;

  // ── RENDER ────────────────────────────────────────────────────────────────
  return (
    <div
      className="relative min-h-screen overflow-x-hidden text-white"
      style={{ background: "linear-gradient(135deg, #0b0f1a 0%, #111827 50%, #1a0a00 100%)" }}
    >
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        <div
          style={{
            position: "absolute",
            top: "-10%",
            left: "-5%",
            width: 600,
            height: 600,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(234,88,12,0.18) 0%, transparent 70%)",
            filter: "blur(60px)",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: "-10%",
            right: "-5%",
            width: 500,
            height: 500,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(59,130,246,0.10) 0%, transparent 70%)",
            filter: "blur(80px)",
          }}
        />
      </div>

      {/* ── NOTIFICATION STACK (bottom-right) ── */}
      <div className="fixed bottom-6 right-6 sm:bottom-10 sm:right-10 z-50 flex flex-col gap-4 max-w-sm w-[90%] sm:w-full">
        {/* WAITER CALL NOTIFICATIONS */}
        {waiterCalls.map(call => (
          <div
            key={call.id}
            className={`
              flex items-start gap-4 px-5 py-4 bg-slate-900/95 backdrop-blur-xl rounded-2xl shadow-2xl transition-all duration-300 border
              ${call.accepted
                ? "border-emerald-500/40 shadow-emerald-500/20"
                : "border-orange-500/40 shadow-orange-500/20"}
            `}
          >
            <div className={`w-12 h-12 rounded-full shadow-inner flex items-center justify-center flex-shrink-0 ${call.accepted ? "bg-emerald-500/10 border border-emerald-500/30" : "bg-orange-500/10 border border-orange-500/30 animate-pulse"}`}>
              {call.accepted ? <Check className="w-6 h-6 text-emerald-400" /> : <BellRing className="w-6 h-6 text-orange-400" />}
            </div>
            <div className="flex-1 min-w-0 pt-0.5">
              {call.accepted ? (
                <>
                  <p className="font-bold text-white text-sm tracking-wide">On my way!</p>
                  <p className="text-slate-400 text-xs mt-1 font-medium">Heading to Table <span className="font-bold text-emerald-400">{call.tableId}</span></p>
                </>
              ) : (
                <>
                  <p className="font-bold text-white text-sm tracking-wide">Waiter Requested</p>
                  <p className="text-slate-400 text-xs mt-1 font-medium">
                    Table <span className="font-bold text-orange-400 text-sm">{call.tableId}</span> needs assistance.
                  </p>
                  {call.orderId && <p className="text-orange-500/80 text-[10px] font-mono truncate mt-1 border border-orange-500/20 bg-orange-500/10 inline-block px-1.5 py-0.5 rounded">Order: {call.orderId}</p>}
                </>
              )}
            </div>
            {!call.accepted ? (
              <div className="flex flex-col gap-2 flex-shrink-0">
                <button onClick={() => acceptWaiterCall(call)} className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-green-500/20 hover:bg-green-500/30 border border-green-500/30 text-green-400 text-xs font-bold rounded-xl transition-all active:scale-95 shadow-lg outline-none">
                  <Check className="w-3.5 h-3.5" /> Accept
                </button>
                <button onClick={() => dismissWaiterCall(call.id)} className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-slate-800/80 hover:bg-slate-700/80 border border-slate-600/50 text-slate-400 hover:text-slate-200 text-xs font-semibold rounded-xl transition-all active:scale-95 outline-none">
                  <X className="w-3.5 h-3.5" /> Dismiss
                </button>
              </div>
            ) : <div className="w-5 h-5 flex-shrink-0" />}
          </div>
        ))}

        {/* ── CLEAN TABLE NOTIFICATIONS ── */}
        {cleanRequests.map(req => (
          <div
            key={req.id}
            className={`
              flex items-start gap-4 px-5 py-4 bg-slate-900/95 backdrop-blur-xl rounded-2xl shadow-2xl transition-all duration-300 border
              ${req.done
                ? "border-emerald-500/40 shadow-emerald-500/20"
                : "border-blue-500/40 shadow-blue-500/20"}
            `}
          >
            <div className={`w-12 h-12 rounded-full shadow-inner flex items-center justify-center flex-shrink-0 ${req.done ? "bg-emerald-500/10 border border-emerald-500/30" : "bg-blue-500/10 border border-blue-500/30 animate-pulse"}`}>
              {req.done
                ? <Check className="w-6 h-6 text-emerald-400" />
                : <Sparkles className="w-6 h-6 text-blue-400" />}
            </div>

            <div className="flex-1 min-w-0 pt-0.5">
              {req.done ? (
                <>
                  <p className="font-bold text-white text-sm tracking-wide">Noted — cleaning up!</p>
                  <p className="text-slate-400 text-[11px] mt-1 font-medium leading-snug">Table <span className="font-bold text-emerald-400">{req.tableId}</span> available from Table Status once done.</p>
                </>
              ) : (
                <>
                  <p className="font-bold text-white text-sm tracking-wide">Please clean table</p>
                  <p className="text-slate-400 text-xs mt-1 font-medium">
                    Table <span className="font-bold text-blue-400 text-sm">{req.tableId}</span> — guests paid.
                  </p>
                  {req.total > 0 && <p className="text-blue-500/80 text-[10px] font-mono truncate mt-1 border border-blue-500/20 bg-blue-500/10 inline-block px-1.5 py-0.5 rounded">Settled: ₹{req.total}</p>}
                </>
              )}
            </div>

            {!req.done ? (
              <div className="flex flex-col gap-2 flex-shrink-0">
                <button
                  onClick={() => acceptCleanRequest(req)}
                  className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-green-500/20 hover:bg-green-500/30 border border-green-500/30 text-green-400 text-xs font-bold rounded-xl transition-all active:scale-95 shadow-lg outline-none"
                >
                  <Check className="w-3.5 h-3.5" /> Got it
                </button>
                <button
                  onClick={() => dismissCleanRequest(req.id)}
                  className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-slate-800/80 hover:bg-slate-700/80 border border-slate-600/50 text-slate-400 hover:text-slate-200 text-xs font-semibold rounded-xl transition-all active:scale-95 outline-none"
                >
                  <X className="w-3.5 h-3.5" /> Later
                </button>
              </div>
            ) : <div className="w-5 h-5 flex-shrink-0" />}
          </div>
        ))}
      </div>

      {/* Background */}
      <div className="absolute top-20 right-10 w-40 h-40 bg-orange-500/10 rounded-full blur-3xl animate-pulse" />
      <div className="absolute bottom-40 left-10 w-60 h-60 bg-blue-500/5 rounded-full blur-3xl animate-pulse" style={{ animationDelay: "1s" }} />

      <div className="relative z-10 p-6 max-w-7xl mx-auto">

        {/* HEADER */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-6">
          <div className="flex items-center gap-3">
            <div className="w-[36px] h-[36px] bg-[#f97316] rounded-full flex items-center justify-center text-white shrink-0 shadow-[0_0_15px_rgba(249,115,22,0.4)]">
              <UtensilsCrossed size={18} />
            </div>
            <div>
              <div className="text-[1.15rem] font-bold tracking-[-0.025em] text-white">
                Smart<span className="text-[#f97316]">Dine</span>
              </div>
              <p className="text-xs text-slate-400 uppercase tracking-widest font-semibold mt-0.5">Waiter Portal</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            {pendingCallsCount > 0 && (
              <div className="flex items-center gap-2 px-4 py-2 bg-red-900/60 border border-red-500/50 rounded-xl animate-pulse">
                <BellRing className="w-4 h-4 text-red-300" />
                <span className="text-red-200 font-bold text-sm">
                  {pendingCallsCount} Call{pendingCallsCount > 1 ? "s" : ""} Pending
                </span>
              </div>
            )}

            {pendingCleanCount > 0 && (
              <div className="flex items-center gap-2 px-4 py-2 bg-violet-900/60 border border-violet-500/50 rounded-xl animate-pulse">
                <Sparkles className="w-4 h-4 text-violet-300" />
                <span className="text-violet-200 font-bold text-sm">
                  {pendingCleanCount} Table{pendingCleanCount > 1 ? "s" : ""} to Clean
                </span>
              </div>
            )}

            {/* Tabs */}
            <div className="flex bg-slate-800/70 border border-slate-700 rounded-xl p-1 gap-1">
              {["orders", "tables"].map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 ${activeTab === tab ? "bg-orange-500 text-white shadow-lg shadow-orange-500/30" : "text-slate-400 hover:text-white"}`}
                >
                  {tab === "orders" ? <Clock className="w-4 h-4" /> : <LayoutGrid className="w-4 h-4" />}
                  {tab === "orders" ? "Orders" : "Table Status"}
                </button>
              ))}
            </div>

            <button
              onClick={activeTab === "orders" ? fetchOrders : fetchAllTables}
              disabled={loading || tablesLoading}
              className="px-5 py-2.5 bg-slate-800/70 hover:bg-slate-700 border border-slate-600 text-white font-semibold rounded-xl transition-all disabled:opacity-50 flex items-center gap-2 hover:-translate-y-0.5 active:scale-95"
            >
              <RefreshCw className={`w-4 h-4 ${loading || tablesLoading ? "animate-spin" : ""}`} />
              Refresh
            </button>

            <button
              onClick={() => setIsPosOpen(true)}
              className="px-6 py-2.5 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white font-bold rounded-xl shadow-lg shadow-orange-500/40 transition-all flex items-center gap-2 hover:scale-105 active:scale-95"
            >
              <Plus className="w-5 h-5" />
              New Order
            </button>

            <LogoutButton
              className="inline-flex items-center gap-2 rounded-xl border border-slate-600 bg-white px-5 py-2.5 text-sm font-semibold text-slate-800 transition-all hover:border-red-300 hover:bg-red-50 hover:text-red-700"
            />
          </div>
        </div>

        {/* ── ORDERS TAB ── */}
        {activeTab === "orders" && (
          <>
            <div className="mb-6 flex justify-between items-center">
              <div className="inline-flex items-center gap-3 px-5 py-2.5 bg-slate-900/80 backdrop-blur-md border border-orange-500/40 rounded-xl shadow-lg">
                <div className="w-2.5 h-2.5 bg-orange-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(249,115,22,0.8)]" />
                <span className="text-white font-bold tracking-wider text-sm">{readyOrders.length} ORDERS READY</span>
              </div>
              {loading && readyOrders.length > 0 && <RefreshCw className="w-5 h-5 text-slate-500 animate-spin" />}
            </div>

            {loading && readyOrders.length === 0 && (
              <div className="flex justify-center items-center py-20">
                <RefreshCw className="w-12 h-12 text-orange-400 animate-spin" />
              </div>
            )}

            {!loading && readyOrders.length === 0 && (
              <div className="text-center py-20 bg-black/40 rounded-2xl border border-slate-700/70">
                <Clock className="w-16 h-16 text-slate-500 mx-auto mb-4" />
                <p className="text-slate-200 text-lg">No orders ready to serve</p>
                <p className="text-slate-400 text-sm mt-2">New orders will appear here when ready</p>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
              {readyOrders.map((o, idx) => (
                <div
                  key={o._id}
                  className="group relative bg-[#0f172a]/90 backdrop-blur-xl rounded-[24px] border border-slate-700/50 hover:border-orange-500/50 p-6 sm:p-8 flex flex-col shadow-xl hover:shadow-[0_10px_40px_rgba(249,115,22,0.15)] transition-all duration-300 hover:-translate-y-1 overflow-hidden"
                  style={{ animationDelay: `${idx * 100}ms` }}
                >
                  <div className="absolute -top-12 -right-12 w-40 h-40 bg-orange-500/5 rounded-full blur-3xl group-hover:bg-orange-500/10 transition-all duration-500 pointer-events-none" />

                  <div className="relative z-10 flex flex-col h-full">
                    {/* Header */}
                    <div className="flex justify-between items-center mb-6">
                      <div>
                        <span className="text-[10px] uppercase font-bold tracking-[0.2em] text-slate-400 mb-1 block">Order ID</span>
                        <div className="font-black text-2xl text-white group-hover:text-orange-400 transition-colors">
                          #{o._id.slice(-6).toUpperCase()}
                        </div>
                      </div>
                      <div className="px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-black uppercase tracking-[0.1em] rounded-lg flex items-center gap-1.5 shadow-[0_0_15px_rgba(16,185,129,0.15)]">
                        <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse shadow-[0_0_5px_rgba(16,185,129,0.8)]" />
                        READY
                      </div>
                    </div>

                    {/* Meta Grid */}
                    <div className="grid grid-cols-2 gap-4 mb-5">
                      <div className="flex flex-col">
                        <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 mb-1.5">Table</span>
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-slate-800/80 border border-slate-700 flex items-center justify-center">
                            <span className="text-base leading-none">🪑</span>
                          </div>
                          <span className="font-bold text-white text-lg">{o.tableNo || "N/A"}</span>
                        </div>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 mb-1.5">Time</span>
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-slate-800/80 border border-slate-700 flex items-center justify-center">
                            <Clock className="w-4 h-4 text-slate-400" />
                          </div>
                          <span className="font-semibold text-slate-200">{o.createdAt ? new Date(o.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}</span>
                        </div>
                      </div>
                    </div>

                    {o.userEmail && (
                      <div className="flex flex-col mb-6">
                        <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 mb-1.5">Customer</span>
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-slate-800/80 border border-slate-700 flex items-center justify-center">
                            <User className="w-4 h-4 text-slate-400" />
                          </div>
                          <span className="font-medium text-slate-200 text-sm truncate">{o.userEmail}</span>
                        </div>
                      </div>
                    )}

                    {/* Items List */}
                    <div className="flex-1 min-h-[0]">
                      <div className="bg-slate-900/60 border border-slate-700/50 rounded-2xl p-4 sm:p-5 mb-6 group-hover:border-orange-500/30 transition-colors">
                        <div className="flex justify-between items-center mb-4 pb-3 border-b border-slate-700/50">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Order Items</span>
                          <span className="px-2 py-0.5 bg-slate-800 border border-slate-700 text-orange-400 text-xs font-bold rounded-md">{(o.items || []).length}</span>
                        </div>
                        <ul className="space-y-3">
                          {Object.entries(
                            (o.items || []).reduce((acc, it) => {
                              const name = typeof it === "string" ? it : it.name || JSON.stringify(it);
                              acc[name] = (acc[name] || 0) + 1;
                              return acc;
                            }, {})
                          ).map(([name, qty], i2) => (
                            <li key={i2} className="flex items-center justify-between text-slate-200 text-sm">
                              <div className="flex items-start gap-3">
                                <div className="w-1.5 h-1.5 bg-orange-500 rounded-full mt-1.5 flex-shrink-0" />
                                <span className="font-medium leading-snug">{name}</span>
                              </div>
                              {qty > 1 && <span className="text-orange-400 font-bold bg-orange-400/10 border border-orange-500/20 px-2 py-0.5 rounded ml-2 flex-shrink-0">x{qty}</span>}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    {/* Footer / Total */}
                    {typeof o.totalCost === "number" && (
                      <div className="flex justify-between items-end mb-6 mt-auto border-t border-slate-700/50 pt-6">
                        <span className="text-[10px] uppercase font-bold tracking-widest text-slate-500 mb-1">Total Amount</span>
                        <span className="text-3xl font-black text-white tracking-tight">₹{o.totalCost}</span>
                      </div>
                    )}

                    <button
                      onClick={() => markServed(o._id)}
                      className="w-full relative overflow-hidden group/btn py-4 sm:py-4.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black tracking-widest uppercase text-xs sm:text-sm rounded-xl transition-all flex justify-center items-center gap-2 hover:-translate-y-0.5 active:translate-y-0 shadow-[0_4px_20px_rgba(16,185,129,0.3)] hover:shadow-[0_4px_25px_rgba(16,185,129,0.5)]"
                    >
                      <div className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-white/30 to-transparent -translate-x-[150%] group-hover/btn:animate-[shimmer_1.5s_infinite]" />
                      <Check className="w-5 h-5 stroke-[2.5]" />
                      Mark as Served
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ── TABLE STATUS TAB ── */}
        {activeTab === "tables" && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <LayoutGrid className="w-5 h-5 text-orange-400" />All Tables
              </h2>
              <div className="flex gap-3 text-xs font-semibold">
                <span className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-900/40 border border-emerald-600/40 rounded-lg text-emerald-300"><span className="w-2 h-2 bg-emerald-400 rounded-full" />Available</span>
                <span className="flex items-center gap-1.5 px-3 py-1.5 bg-yellow-900/40 border border-yellow-600/40 rounded-lg text-yellow-300"><span className="w-2 h-2 bg-yellow-400 rounded-full" />Held</span>
                <span className="flex items-center gap-1.5 px-3 py-1.5 bg-red-900/40 border border-red-600/40 rounded-lg text-red-300"><span className="w-2 h-2 bg-red-400 rounded-full" />Occupied</span>
              </div>
            </div>

            {tablesLoading ? (
              <div className="flex justify-center items-center py-20"><RefreshCw className="w-10 h-10 text-orange-400 animate-spin" /></div>
            ) : allTables.length === 0 ? (
              <div className="text-center py-20 bg-black/40 rounded-2xl border border-slate-700/70">
                <LayoutGrid className="w-16 h-16 text-slate-500 mx-auto mb-4" />
                <p className="text-slate-200 text-lg">No tables found</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {allTables.sort((a, b) => a.number - b.number).map((table) => {
                  const isOccupied = table.status === "occupied";
                  const isHeld = table.status === "held";
                  const isAvailable = table.status === "available";
                  const tId = table.tableId || `T-${String(table.number).padStart(2, "0")}`;
                  const hasPending = waiterCalls.some(c => c.tableId === tId && !c.accepted);
                  const needsClean = cleanRequests.some(c => c.tableId === tId && !c.done);
                  const billReady = billReadyTables.find((entry) => entry.tableNo === tId);
                  const canAcceptCash = Boolean(billReady?.orderIds?.length);
                  // Attach the table's _id so confirmCashReceived can auto-clear it after payment
                  const billReadyWithTableId = billReady ? { ...billReady, _tableId: table._id } : null;

                  return (
                    <div
                      key={table._id}
                      className={`
                        relative px-2.5 py-3 sm:px-3 sm:py-3.5 rounded-2xl shadow-lg
                        transition-all duration-300 text-left flex flex-col justify-between
                        min-h-[110px] sm:min-h-[120px]
                        ${needsClean
                          ? "bg-violet-900/30 border border-violet-500/70 shadow-[0_0_15px_rgba(139,92,246,0.3)] animate-pulse"
                          : canAcceptCash
                            ? "bg-emerald-900/20 border border-emerald-500/70 shadow-[0_0_15px_rgba(16,185,129,0.22)]"
                          : hasPending
                            ? "bg-red-900/30 border border-red-500/70 shadow-[0_0_15px_rgba(239,68,68,0.3)] animate-pulse"
                            : isAvailable ? "bg-slate-900/80 border border-green-500/60 hover:brightness-110 hover:-translate-y-0.5"
                              : isHeld ? "bg-slate-900/80 border border-yellow-500/60"
                                : "bg-slate-900/80 border border-red-500/80"
                        }
                      `}
                    >
                      {/* Top Right Badges */}
                      {needsClean ? (
                        <div className="absolute -top-2 -right-2 w-6 h-6 bg-violet-500 rounded-full flex items-center justify-center shadow-lg z-10">
                          <Sparkles className="w-3.5 h-3.5 text-white" />
                        </div>
                      ) : canAcceptCash ? (
                        <div className="absolute -top-2 -right-2 w-6 h-6 bg-emerald-500 rounded-full flex items-center justify-center shadow-lg z-10">
                          <Receipt className="w-3.5 h-3.5 text-white" />
                        </div>
                      ) : hasPending ? (
                        <div className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center shadow-lg z-10">
                          <BellRing className="w-3.5 h-3.5 text-white" />
                        </div>
                      ) : (
                        <span
                          className={`
                            absolute top-2 right-2 w-2 h-2 rounded-full shadow-lg
                            ${isAvailable ? "bg-green-400 shadow-[0_0_6px_rgba(34,197,94,0.8)]" : isHeld ? "bg-yellow-400 shadow-[0_0_6px_rgba(250,204,21,0.8)]" : "bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.8)]"}
                          `}
                        />
                      )}

                      {/* Header */}
                      <div className="flex items-start justify-between mb-2 pr-3">
                        <div>
                          <div className="text-[10px] font-semibold tracking-[0.18em] uppercase text-slate-400">
                            Table
                          </div>
                          <div className="text-sm font-bold text-white leading-snug">
                            {tId}
                          </div>
                        </div>
                      </div>

                      {/* Icon */}
                      <div className="flex flex-col items-center gap-1.5 mb-2">
                        <div className="p-1.5 rounded-2xl bg-black/20 flex items-center justify-center h-12 w-12">
                          {getTableIcon(table.seats || 4, isOccupied || isHeld)}
                        </div>
                      </div>

                      {/* Footer Info */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-[9px] sm:text-[10px] font-semibold tracking-[0.22em] uppercase text-white/85">
                          <span>{table.seats ? `${table.seats} Seats` : "4 Seats"}</span>
                          {needsClean ? (
                            <span className="text-violet-300">To Clean</span>
                          ) : canAcceptCash ? (
                            <span className="text-emerald-300">Cash Due</span>
                          ) : hasPending ? (
                            <span className="text-red-300">Calling</span>
                          ) : isAvailable ? (
                            <span className="text-green-300">Avl.</span>
                          ) : isHeld ? (
                            <span className="text-yellow-300">Held</span>
                          ) : (
                            <span className="text-red-300">Used</span>
                          )}
                        </div>
                      </div>

                      {/* Receive Cash — only shown when order is served & unpaid */}
                      {canAcceptCash && (
                        <button
                          onClick={() => markCashReceived(billReadyWithTableId)}
                          className="w-full mt-3 py-1.5 px-3 bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/50 text-emerald-300 text-[10px] font-bold uppercase tracking-wider rounded-lg flex items-center justify-center gap-1.5 transition-all active:scale-95"
                        >
                          <Receipt className="w-3 h-3" />
                          Receive Cash
                        </button>
                      )}

                      {(isOccupied || isHeld || needsClean) && (
                        <button
                          onClick={() => handleCleanClick(table)}
                          className="w-full mt-2 py-1.5 px-3 bg-slate-800/80 hover:bg-emerald-900/50 border border-slate-600/50 hover:border-emerald-500/60 text-slate-300 hover:text-emerald-300 text-[10px] font-bold uppercase tracking-wider rounded-lg flex items-center justify-center gap-1.5 transition-all active:scale-95"
                        >
                          <Sparkles className="w-3 h-3" />
                          Clean Table
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* CONFIRM CLEAN MODAL */}
      {confirmCleanOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 w-full max-w-sm rounded-2xl shadow-2xl p-6 text-center transform transition-all">
            <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4 outline outline-8 outline-red-500/5">
              <Sparkles className="w-8 h-8 text-red-400" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Clean Table?</h3>
            <p className="text-sm text-slate-400 mb-6">
              Are you sure you want to clear {confirmCleanOpen.tableId} and mark it as available for new guests?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmCleanOpen(null)}
                className="flex-1 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-white font-medium transition-all"
              >
                Cancel
              </button>
              <button
                onClick={confirmCleanTable}
                className="flex-1 px-4 py-2.5 bg-red-500 hover:bg-red-600 text-white font-bold rounded-xl shadow-lg shadow-red-500/30 transition-all flex items-center justify-center gap-2"
              >
                <Check className="w-4 h-4" /> Yes, Clean
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRM SERVE MODAL */}
      {confirmServeOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 w-full max-w-sm rounded-2xl shadow-2xl p-6 text-center transform transition-all">
            <div className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-4 outline outline-8 outline-emerald-500/5">
              <Check className="w-8 h-8 text-emerald-400" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Mark as Served?</h3>
            <p className="text-sm text-slate-400 mb-6">
              Confirm that this order has been served to the customer.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmServeOpen(null)}
                className="flex-1 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-white font-medium transition-all"
              >
                Cancel
              </button>
              <button
                onClick={confirmServeOrder}
                className="flex-1 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold rounded-xl shadow-[0_4px_15px_rgba(16,185,129,0.3)] transition-all flex items-center justify-center gap-2"
              >
                <Check className="w-4 h-4 stroke-[3]" /> Yes, Served
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRM CASH MODAL */}
      {confirmCashOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 w-full max-w-sm rounded-2xl shadow-2xl p-6 text-center transform transition-all">
            <div className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-4 outline outline-8 outline-emerald-500/5">
              <Receipt className="w-8 h-8 text-emerald-400" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Cash Received?</h3>
            <p className="text-sm text-slate-400 mb-2">
              Confirm cash payment for <span className="font-bold text-emerald-300">{confirmCashOpen.tableNo}</span>.
            </p>
            <p className="text-sm text-slate-500 mb-6">
              This will complete the order, redirect the guest to feedback, and mark the table as available.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmCashOpen(null)}
                className="flex-1 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-white font-medium transition-all"
              >
                Cancel
              </button>
              <button
                onClick={confirmCashReceived}
                className="flex-1 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold rounded-xl shadow-[0_4px_15px_rgba(16,185,129,0.3)] transition-all flex items-center justify-center gap-2"
              >
                <Check className="w-4 h-4 stroke-[3]" /> Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {infoPopup && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 w-full max-w-sm rounded-2xl shadow-2xl p-6 text-center">
            <div className="w-16 h-16 bg-orange-500/10 rounded-full flex items-center justify-center mx-auto mb-4 outline outline-8 outline-orange-500/5">
              <BellRing className="w-8 h-8 text-orange-400" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">{infoPopup.title}</h3>
            <p className="text-sm text-slate-400 mb-6">{infoPopup.message}</p>
            <button
              onClick={() => setInfoPopup(null)}
              className="w-full px-4 py-2.5 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-xl shadow-lg shadow-orange-500/30 transition-all"
            >
              OK
            </button>
          </div>
        </div>
      )}

      {/* POS MODAL */}
      {isPosOpen && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4"
          onClick={() => !submitting && setIsPosOpen(false)}
        >
          <div
            className="bg-slate-900 w-full max-w-6xl h-[90vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden border border-slate-700"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-between items-center p-5 sm:p-6 border-b border-slate-700/50 bg-slate-800/50">
              <div>
                <h2 className="text-xl sm:text-2xl font-bold text-white">Create New Order</h2>
                <p className="text-slate-400 text-xs sm:text-sm mt-1">Select items and complete order details</p>
              </div>
              <button
                onClick={() => !submitting && setIsPosOpen(false)}
                className="w-10 h-10 bg-slate-700/50 hover:bg-slate-700 rounded-xl flex items-center justify-center text-slate-400 hover:text-white transition-all shadow-inner"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex flex-1 overflow-hidden flex-col md:flex-row">
              <div className="flex-1 overflow-y-auto p-6 bg-slate-900/50">
                <MenuSection title="🥗 Starters" items={normalizedMenu.starters} onAdd={addToCart} />
                <MenuSection title="🍝 Main Course" items={normalizedMenu.maincourse} onAdd={addToCart} />
                <MenuSection title="🍰 Desserts" items={normalizedMenu.desserts} onAdd={addToCart} />
              </div>

              <div className="w-full md:w-[380px] bg-slate-800/80 border-l border-slate-700/50 flex flex-col shadow-2xl">
                <div className="flex-1 overflow-y-auto p-6">
                  <div className="flex justify-between items-center mb-5">
                    <h3 className="font-bold text-white text-lg">Current Cart</h3>
                    <div className="px-3 py-1 bg-orange-500/20 border border-orange-500/40 text-orange-300 text-xs font-bold rounded-lg">
                      {cart.reduce((a, b) => a + b.qty, 0)} items
                    </div>
                  </div>

                  {cart.length === 0 ? (
                    <div className="text-center py-12 border-2 border-dashed border-slate-700 rounded-xl text-slate-500">
                      <div className="w-16 h-16 bg-slate-700/30 rounded-full mx-auto mb-3 flex items-center justify-center">
                        <span className="text-3xl">🛒</span>
                      </div>
                      <p className="font-medium">Cart is empty</p>
                      <p className="text-xs mt-1">Add items from menu</p>
                    </div>
                  ) : (
                    <ul className="space-y-3">
                      {cart.map(it => (
                        <li key={it.name} className="bg-slate-900/60 p-4 rounded-xl border border-slate-700/50 flex justify-between items-center hover:border-orange-500/30 transition-all group">
                          <div className="flex-1 min-w-0 mr-3">
                            <div className="font-semibold text-white text-sm group-hover:text-orange-300 transition-colors">{it.name}</div>
                            <div className="text-xs text-orange-300 font-medium mt-1">₹{(it.price * it.qty).toFixed(2)}</div>
                          </div>
                          <div className="flex items-center gap-2 bg-slate-700/50 rounded-lg px-1">
                            <button onClick={() => updateQty(it.name, -1)} className="w-7 h-7 flex items-center justify-center text-slate-300 hover:text-white hover:bg-slate-600 rounded font-bold transition-all">-</button>
                            <span className="text-sm font-bold text-white w-6 text-center">{it.qty}</span>
                            <button onClick={() => updateQty(it.name, 1)} className="w-7 h-7 flex items-center justify-center text-slate-300 hover:text-white hover:bg-slate-600 rounded font-bold transition-all">+</button>
                          </div>
                          <button onClick={() => removeItem(it.name)} className="ml-2 w-7 h-7 flex items-center justify-center text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded transition-all">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="p-6 bg-slate-800/80 border-t border-slate-700/50">
                  <div className="flex justify-between items-center mb-6 pb-5 border-b border-slate-700/50">
                    <span className="text-slate-300 font-medium text-lg">Total</span>
                    <span className="font-bold text-3xl bg-gradient-to-r from-orange-300 to-orange-400 bg-clip-text text-transparent">
                      ₹{totalCost.toFixed(2)}
                    </span>
                  </div>

                  <form onSubmit={placeManualOrder} className="space-y-3">
                    <input
                      type="email" placeholder="Customer Email (optional for occupied table)" value={email}
                      onChange={e => setEmail(e.target.value)}
                      className="w-full p-3.5 bg-slate-900/60 border border-slate-700 rounded-xl text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/50 transition-all"
                    />
                    <select
                      required value={tableNo} onChange={e => setTableNo(e.target.value)}
                      className="w-full p-3.5 bg-slate-900/60 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/50 transition-all"
                    >
                      <option value="" disabled>Select Table</option>
                      {occupiedTables.map(t => (
                        <option key={t._id} value={t.tableId}>{t.tableId} ({t.seats} seats)</option>
                      ))}
                    </select>
                    <button
                      type="submit" disabled={submitting || cart.length === 0}
                      className="w-full bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 disabled:from-slate-700 disabled:to-slate-700 disabled:cursor-not-allowed text-white font-bold py-4 rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 hover:-translate-y-0.5 active:scale-95"
                    >
                      {submitting
                        ? <><RefreshCw className="w-5 h-5 animate-spin" />Processing...</>
                        : <><Check className="w-5 h-5" />Place Order</>
                      }
                    </button>
                  </form>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MenuSection({ title, items, onAdd }) {
  if (!items?.length) return null;
  return (
    <div className="mb-10">
      <h3 className="text-xl font-bold text-white mb-5 flex items-center gap-3">
        <span>{title}</span>
        <div className="flex-1 h-px bg-gradient-to-r from-slate-700 to-transparent" />
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.map(item => (
          <div
            key={item.name}
            onClick={() => onAdd(item.name, item.price)}
            className="group cursor-pointer bg-slate-800/60 border border-slate-700/50 hover:border-orange-500/50 rounded-xl p-4 hover:shadow-xl hover:shadow-orange-500/10 transition-all flex flex-col h-full hover:-translate-y-1"
          >
            <div className="flex justify-between items-start mb-2">
              <span className="font-semibold text-white leading-tight flex-1 group-hover:text-orange-300 transition-colors">{item.name}</span>
              <span className="text-orange-300 font-bold text-sm ml-2 whitespace-nowrap">₹{item.price}</span>
            </div>
            {item.description && (
              <p className="text-xs text-slate-300/80 line-clamp-2 leading-relaxed mb-3 group-hover:text-slate-100 transition-colors">{item.description}</p>
            )}
            <div className="mt-auto pt-2 opacity-0 group-hover:opacity-100 transition-all text-xs font-bold text-orange-300 uppercase tracking-wider text-center flex items-center justify-center gap-1">
              <Plus className="w-3 h-3" />Add to Cart
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { io } from "socket.io-client";
import API from "../api";
import { resolveSocketBaseUrl } from "../utils/runtimeConfig";
import { buildWorkflowPayload, readStoredOrderIds, writeStoredOrderIds } from "../utils/workflowSession";
import LogoutButton from "../components/LogoutButton";
import {
  ChefHat,
  UtensilsCrossed,
  BellRing,
  CheckCircle2,
  Clock,
  Plus,
  ArrowRight,
  Check,
  X,
} from "lucide-react";

const SOCKET_URL = resolveSocketBaseUrl();

const socket = io(SOCKET_URL, { transports: ["websocket"] });

const STATUSES = ["waiting", "accepted", "preparing", "cooked", "served"];

const STATUS_CONFIG = {
  waiting: { label: "Waiting for Confirmation", icon: Clock, desc: "Sending your request to the kitchen..." },
  accepted: { label: "Order Accepted", icon: CheckCircle2, desc: "The chef has seen your order." },
  preparing: { label: "Preparing Your Meal", icon: ChefHat, desc: "Ingredients are being chopped and cooked." },
  cooked: { label: "Order Cooked", icon: UtensilsCrossed, desc: "Plating up your delicious meal." },
  served: { label: "Served", icon: BellRing, desc: "Enjoy your dining experience!" },
};

const TOAST_IDLE = "idle";
const TOAST_CALLING = "calling";
const TOAST_ACCEPTED = "accepted";
const TOAST_BUSY = "busy";
const WAITER_TIMEOUT_MS = 30000;

function normalizeStatus(status) {
  const value = String(status || "").toLowerCase();
  if (value === "requested" || value === "pending") return "waiting";
  if (value === "ready") return "cooked";
  return STATUSES.includes(value) ? value : "waiting";
}

function formatEta(etaSeconds) {
  if (!etaSeconds) return "—";
  return `${Math.floor(etaSeconds / 60)}m ${etaSeconds % 60}s`;
}

function buildInitialOrderIds(tableId, locationStateOrderId, locationStateOrderIds) {
  return Array.from(
    new Set([
      ...readStoredOrderIds(tableId),
      ...(Array.isArray(locationStateOrderIds) ? locationStateOrderIds : []),
      locationStateOrderId,
    ].filter(Boolean))
  );
}

function formatShortOrderId(orderId) {
  const raw = String(orderId || "").trim();
  if (!raw) return "—";
  return `#${raw.slice(-6).toUpperCase()}`;
}

function OrderItemsModal({ order, onClose }) {
  if (!order) return null;

  const groupedItems = (order.items || []).reduce((acc, item) => {
    const name = typeof item === "string" ? item : item?.name;
    if (!name) return acc;
    acc[name] = (acc[name] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center px-4" onClick={onClose}>
      <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" />
      <div
        className="relative z-10 w-full max-w-lg overflow-hidden rounded-3xl border border-slate-700 bg-slate-900/95 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-5">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-slate-500">Order Items</p>
            <p className="mt-2 text-2xl font-black tracking-tight text-orange-400">{formatShortOrderId(order._id)}</p>
          </div>
          <button
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-5">
          <ul className="space-y-3">
            {Object.entries(groupedItems).map(([name, qty]) => (
              <li
                key={name}
                className="flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-800/70 px-4 py-3"
              >
                <span className="text-slate-100">{name}</span>
                <span className="rounded-full bg-orange-500/15 px-3 py-1 text-sm font-semibold text-orange-300">
                  x{qty}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function OrderCard({ order, onViewOrder }) {
  const stepIndex = Math.max(STATUSES.indexOf(order.status), 0);
  const isServed = order.status === "served";

  return (
    <article className={`relative w-full max-w-2xl overflow-hidden rounded-3xl border transition-all duration-500 shadow-2xl backdrop-blur-xl flex flex-col ${isServed ? "border-emerald-500/40 bg-slate-900/80 shadow-emerald-500/10" : "border-slate-700/60 bg-slate-900/60 hover:border-orange-500/40 hover:shadow-orange-500/10"}`}>
      
      {/* Top Banner / Header */}
      <div className={`border-b p-6 md:p-8 flex items-start justify-between text-left ${isServed ? "border-emerald-500/20 bg-emerald-500/5" : "border-slate-700/50 bg-slate-800/30"}`}>
        <div>
          <div className="flex items-center gap-3 mb-1.5">
            <p className="text-[10px] sm:text-xs uppercase tracking-[0.2em] font-bold text-slate-400">Order ID</p>
            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${isServed ? "bg-emerald-500/20 text-emerald-300" : "bg-orange-500/20 text-orange-300 animate-pulse"}`}>
              {isServed ? "Served" : "In Progress"}
            </span>
          </div>
          <p className="text-xl font-black tracking-tight text-white">{formatShortOrderId(order._id)}</p>
        </div>
        
        <button
          onClick={() => onViewOrder(order)}
          className={`shrink-0 rounded-xl border px-4 py-2.5 text-sm font-bold transition-all hover:-translate-y-0.5 active:scale-95 ${isServed ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 hover:text-emerald-100" : "border-orange-500/40 bg-orange-500/10 text-orange-300 hover:bg-orange-500/20 hover:text-orange-100"}`}
        >
          View Items
        </button>
      </div>

      {/* ETA Section */}
      {order.status !== "served" && order.status !== "waiting" && order.etaSeconds > 0 && (
        <div className="px-6 md:px-8 pt-6 pb-2">
           <div className="flex items-center justify-between bg-slate-950/40 rounded-2xl p-4 sm:p-5 border border-slate-700/50">
             <div className="flex items-center gap-4">
               <div className="w-12 h-12 rounded-full bg-orange-500/10 border border-orange-500/20 flex items-center justify-center shadow-inner">
                 <Clock className="text-orange-400 animate-pulse" size={22} />
               </div>
               <div>
                  <p className="text-[10px] sm:text-xs font-semibold text-slate-400 uppercase tracking-wider">Estimated Time</p>
                  <p className="text-xl sm:text-2xl font-bold text-white tracking-tight">{formatEta(order.etaSeconds)}</p>
               </div>
             </div>
             <div className="text-right flex flex-col items-end">
                <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest mb-1">Status</p>
                <div className="text-xs sm:text-sm font-bold text-orange-400 uppercase tracking-wide">{STATUS_CONFIG[order.status]?.label}</div>
             </div>
           </div>
        </div>
      )}

      {order.status === "served" && (
        <div className="px-6 md:px-8 pt-6 pb-2">
           <div className="flex items-center justify-center gap-3 bg-emerald-500/10 rounded-2xl p-5 border border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.1)]">
             <BellRing className="text-emerald-400" size={24} />
             <span className="text-xl font-bold text-emerald-300 tracking-wide">Enjoy your Meal!</span>
           </div>
        </div>
      )}

      {/* Timeline Section */}
      <div className="p-6 md:p-8 flex-1">
        <div className="relative h-full py-2">
          {/* Vertical Progress Line */}
          <div className="absolute bottom-6 left-6 top-6 w-[2px] rounded-full bg-slate-800" />
          <div
            className={`absolute left-6 top-6 w-[2px] rounded-full transition-all duration-1000 ease-out ${isServed ? "bg-emerald-500" : "bg-gradient-to-b from-orange-400 to-orange-600"}`}
            style={{ height: `${Math.max(0, (stepIndex / (STATUSES.length - 1)) * 100 - 10)}%` }}
          />
          
          <div className="relative space-y-8">
            {STATUSES.map((statusKey, index) => {
              const isCompleted = index < stepIndex;
              const isCurrent = index === stepIndex;
              const { label, desc, icon: Icon } = STATUS_CONFIG[statusKey];

              let border = "border-slate-700/50 bg-slate-800/80 text-slate-500 shadow-inner";
              if (isCurrent) {
                 border = "scale-110 border-orange-500 bg-slate-900 text-orange-400 shadow-[0_0_15px_rgba(249,115,22,0.3)]";
              } else if (isCompleted) {
                 if (isServed) border = "border-emerald-500 bg-emerald-500 text-emerald-50 shadow-md shadow-emerald-500/20";
                 else border = "border-orange-500 bg-orange-500 text-orange-50 shadow-md shadow-orange-500/20";
              }

              return (
                <div key={statusKey} className={`flex items-start gap-6 ${index > stepIndex ? "grayscale opacity-40" : ""}`}>
                  <div className={`relative z-10 flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border-2 transition-all duration-500 ${border}`}>
                    <Icon size={isCurrent ? 24 : 20} strokeWidth={isCurrent ? 2.5 : 2} />
                    {isCurrent && <span className="absolute inset-0 rounded-xl bg-orange-400 opacity-20 animate-ping delay-75" />}
                  </div>
                  <div className={`pt-1.5 transition-all duration-500 ${isCurrent ? "translate-x-2" : ""}`}>
                    <h3 className={`text-base font-bold tracking-wide ${isCurrent ? "text-orange-400" : isCompleted ? "text-slate-200" : "text-slate-400"}`}>{label}</h3>
                    <p className={`text-sm mt-1 leading-relaxed ${isCurrent ? "text-slate-300 font-medium" : "text-slate-500"}`}>{desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </article>
  );
}

export default function AfterOrder() {
  const navigate = useNavigate();
  const location = useLocation();

  const tableId = localStorage.getItem("tableId") || "T-01";
  const currentOrderId = location.state?.orderId || null;

  const [orderIds, setOrderIds] = useState(() =>
    buildInitialOrderIds(tableId, currentOrderId, location.state?.existingOrderIds)
  );
  const [ordersById, setOrdersById] = useState({});
  const [waiterToast, setWaiterToast] = useState(TOAST_IDLE);
  const [waiterBusy, setWaiterBusy] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [loading, setLoading] = useState(true);

  const acceptedRef = useRef(false);
  const countdownIntervalRef = useRef(null);
  const busyTimerRef = useRef(null);
  const busyDismissRef = useRef(null);

  useEffect(() => {
    const nextIds = buildInitialOrderIds(tableId, currentOrderId, location.state?.existingOrderIds);
    setOrderIds(nextIds);
  }, [tableId, currentOrderId, location.state]);

  useEffect(() => {
    writeStoredOrderIds(tableId, orderIds);
  }, [orderIds, tableId]);

  useEffect(() => {
    if (!tableId) return;

    let cancelled = false;

    (async () => {
      try {
        await API.put("/workflow/current", buildWorkflowPayload({
          pathname: location.pathname,
          search: location.search,
          hash: location.hash,
          routeState: { ...location.state, existingOrderIds: orderIds },
          roleScope: "user",
          currentStep: "after-order",
          tableId,
          activeOrderIds: orderIds,
        }));
      } catch (error) {
        if (!cancelled) {
          console.error("Failed to sync after-order workflow", error);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [location.hash, location.pathname, location.search, location.state, orderIds, tableId]);

  useEffect(() => {
    let cancelled = false;

    async function loadOrders() {
      if (orderIds.length === 0) {
        setOrdersById({});
        if (!cancelled) setLoading(false);
        return;
      }

      if (!cancelled) setLoading(true);

      const responses = await Promise.all(
        orderIds.map(async (orderId) => {
          try {
            const { data } = await API.get(`/orders/${orderId}`);
            return [orderId, { ...data, status: normalizeStatus(data.status), etaSeconds: data.etaSeconds ?? null }];
          } catch {
            return null;
          }
        })
      );

      if (cancelled) return;

      const nextOrders = responses.reduce((acc, entry) => {
        if (!entry) return acc;
        const [orderId, order] = entry;
        acc[orderId] = order;
        return acc;
      }, {});

      setOrdersById(nextOrders);
      if (!cancelled) setLoading(false);
    }

    loadOrders();

    return () => {
      cancelled = true;
    };
  }, [orderIds]);

  useEffect(() => {
    socket.emit("joinTableRoom", tableId);
    orderIds.forEach((orderId) => socket.emit("order:subscribe", { orderId }));

    const onOrderUpdate = (data) => {
      if (!data?.orderId) return;
      setOrdersById((prev) => {
        const existing = prev[data.orderId];
        if (!existing) return prev;
        return {
          ...prev,
          [data.orderId]: {
            ...existing,
            status: data.status ? normalizeStatus(data.status) : existing.status,
            etaSeconds: typeof data.etaSeconds === "number" ? data.etaSeconds : existing.etaSeconds,
          },
        };
      });
    };

    const onServed = ({ orderId }) => {
      if (!orderId) return;
      setOrdersById((prev) => {
        const existing = prev[orderId];
        if (!existing) return prev;
        return { ...prev, [orderId]: { ...existing, status: "served" } };
      });
    };

    const onWaiterAccepted = ({ tableId: respondedTable }) => {
      if (respondedTable !== tableId) return;

      acceptedRef.current = true;
      clearInterval(countdownIntervalRef.current);
      clearTimeout(busyTimerRef.current);
      clearTimeout(busyDismissRef.current);

      setCountdown(0);
      setWaiterBusy(false);
      setWaiterToast(TOAST_ACCEPTED);

      setTimeout(() => {
        setWaiterToast(TOAST_IDLE);
        acceptedRef.current = false;
      }, 5000);
    };

    socket.on("order:update", onOrderUpdate);
    socket.on("orderServed", onServed);
    socket.on("waiter:accepted", onWaiterAccepted);

    return () => {
      orderIds.forEach((orderId) => socket.emit("order:unsubscribe", { orderId }));
      socket.off("order:update", onOrderUpdate);
      socket.off("orderServed", onServed);
      socket.off("waiter:accepted", onWaiterAccepted);
    };
  }, [orderIds, tableId]);

  useEffect(() => {
    const timers = [];

    Object.values(ordersById).forEach((order) => {
      if (!order.etaSeconds || order.etaSeconds <= 0) return;
      const timer = setInterval(() => {
        setOrdersById((prev) => {
          const existing = prev[order._id];
          if (!existing || !existing.etaSeconds || existing.etaSeconds <= 0) return prev;
          return {
            ...prev,
            [order._id]: { ...existing, etaSeconds: Math.max(0, existing.etaSeconds - 1) },
          };
        });
      }, 1000);
      timers.push(timer);
    });

    return () => timers.forEach(clearInterval);
  }, [ordersById]);

  const sortedOrders = useMemo(() => {
    return [...orderIds]
      .map((orderId) => ordersById[orderId])
      .filter(Boolean)
      .sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
  }, [orderIds, ordersById]);

  const canViewCombinedBill = sortedOrders.length > 0 && sortedOrders.every((order) => order.status === "served");
  const activeOrderId = currentOrderId || orderIds[orderIds.length - 1] || null;

  const callWaiter = () => {
    if (waiterBusy && waiterToast === TOAST_CALLING) return;

    acceptedRef.current = false;
    clearInterval(countdownIntervalRef.current);
    clearTimeout(busyTimerRef.current);
    clearTimeout(busyDismissRef.current);

    socket.emit("callWaiter", { tableId, orderId: activeOrderId });

    setWaiterToast(TOAST_CALLING);
    setWaiterBusy(true);
    setCountdown(30);

    let seconds = 30;
    countdownIntervalRef.current = setInterval(() => {
      seconds -= 1;
      setCountdown(seconds);
      if (seconds <= 0) clearInterval(countdownIntervalRef.current);
    }, 1000);

    busyTimerRef.current = setTimeout(() => {
      clearInterval(countdownIntervalRef.current);
      setCountdown(0);

      if (!acceptedRef.current) {
        setWaiterToast(TOAST_BUSY);
        busyDismissRef.current = setTimeout(() => {
          if (!acceptedRef.current) {
            setWaiterToast(TOAST_IDLE);
            setWaiterBusy(false);
          }
        }, 4000);
      }
    }, WAITER_TIMEOUT_MS);
  };

  const handleAddItems = () => {
    navigate("/assistant", { state: { existingOrderIds: orderIds } });
  };

  const handleViewBill = () => {
    navigate("/bill", { state: { orderIds } });
  };

  return (
    <div
      className="relative min-h-screen overflow-x-hidden font-sans text-slate-100"
      style={{ background: "linear-gradient(135deg, #0b0f1a 0%, #111827 50%, #1a0a00 100%)" }}
    >
      <div className="pointer-events-none absolute inset-0 overflow-hidden" style={{ zIndex: 0 }}>
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

      <OrderItemsModal order={selectedOrder} onClose={() => setSelectedOrder(null)} />

      {waiterToast !== TOAST_IDLE && (
        <div className="fixed bottom-6 right-6 sm:bottom-10 sm:right-10 z-50 flex flex-col gap-4 max-w-sm w-[90%] sm:w-full">
          {waiterToast === TOAST_CALLING && (
            <div className="flex items-start gap-4 px-5 py-4 bg-slate-900/95 backdrop-blur-xl rounded-2xl shadow-2xl transition-all duration-300 border border-orange-500/40 shadow-orange-500/20">
              <div className="relative w-12 h-12 flex-shrink-0">
                <div className="absolute inset-0 animate-ping rounded-full bg-orange-500/20" />
                <div className="relative flex h-12 w-12 items-center justify-center rounded-full bg-orange-500/10 shadow-inner border border-orange-500/30">
                  <BellRing className="h-6 w-6 text-orange-400" />
                </div>
              </div>
              <div className="min-w-0 flex-1 pt-0.5">
                <p className="font-bold text-white text-sm tracking-wide">Calling Waiter</p>
                <p className="mt-1 text-xs text-slate-400 font-medium">Please wait for acknowledgement...</p>
              </div>
              <div className="relative h-10 w-10 flex-shrink-0 bg-slate-800/80 rounded-full flex items-center justify-center">
                <svg className="absolute inset-0 h-10 w-10 -rotate-90" viewBox="0 0 36 36">
                  <circle cx="18" cy="18" r="15" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="3" />
                  <circle
                    cx="18"
                    cy="18"
                    r="15"
                    fill="none"
                    stroke="#f97316"
                    strokeWidth="3"
                    strokeDasharray={`${(countdown / 30) * 94.2} 94.2`}
                    strokeLinecap="round"
                    style={{ transition: "stroke-dasharray 1s linear" }}
                  />
                </svg>
                <span className="relative z-10 flex items-center justify-center text-[11px] font-bold text-orange-400">
                  {countdown}s
                </span>
              </div>
            </div>
          )}

          {waiterToast === TOAST_ACCEPTED && (
            <div className="flex items-start gap-4 px-5 py-4 bg-slate-900/95 backdrop-blur-xl rounded-2xl shadow-2xl transition-all duration-300 border border-emerald-500/40 shadow-emerald-500/20 animate-in slide-in-from-bottom-5">
              <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-emerald-500/10 shadow-inner border border-emerald-500/30">
                <Check className="h-6 w-6 text-emerald-400" strokeWidth={3} />
              </div>
              <div className="min-w-0 flex-1 pt-0.5">
                <p className="font-bold text-white text-sm tracking-wide">Request Accepted</p>
                <p className="mt-1 text-xs text-slate-400 font-medium">
                  Waiter is heading to <span className="font-bold text-emerald-400">Table {tableId}</span>.
                </p>
              </div>
            </div>
          )}

          {waiterToast === TOAST_BUSY && (
            <div className="flex items-start gap-4 px-5 py-4 bg-slate-900/95 backdrop-blur-xl rounded-2xl shadow-2xl transition-all duration-300 border border-red-500/40 shadow-red-500/20">
              <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-red-500/10 shadow-inner border border-red-500/30">
                <Clock className="h-6 w-6 text-red-400" />
              </div>
              <div className="min-w-0 flex-1 pt-0.5">
                <p className="font-bold text-white text-sm tracking-wide">Waiters are busy</p>
                <p className="mt-1 text-xs text-slate-400 font-medium">Please try again shortly.</p>
              </div>
            </div>
          )}
        </div>
      )}


      <nav className="relative z-20 mx-auto max-w-[1800px] px-6 py-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-orange-500">
              <UtensilsCrossed size={20} />
            </div>
            <span className="text-xl font-bold tracking-tight">SmartDine</span>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3">
            <button
              onClick={handleAddItems}
              className="flex items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800/85 px-5 py-3 font-medium text-slate-200 transition-all hover:border-slate-500 hover:bg-slate-700"
            >
              <Plus size={18} />
              Add Items
            </button>

            <button
              onClick={callWaiter}
              disabled={waiterToast === TOAST_CALLING}
              className={`
                flex items-center justify-center gap-2 rounded-xl border px-5 py-3 font-medium transition-all
                ${waiterToast === TOAST_ACCEPTED
                  ? "cursor-default border-emerald-700/50 bg-emerald-900/40 text-emerald-300 pointer-events-none"
                  : waiterToast === TOAST_CALLING
                    ? "cursor-not-allowed border-amber-700/50 bg-amber-900/30 text-amber-300"
                : "border-slate-700 bg-slate-800/85 text-slate-200 hover:border-amber-500/50 hover:bg-amber-900/40 hover:text-amber-300"
                }
              `}
            >
              <BellRing size={18} />
              {waiterToast === TOAST_CALLING ? `Calling... ${countdown}s`
                : waiterToast === TOAST_ACCEPTED ? "On the way!"
                  : waiterToast === TOAST_BUSY ? "Try Again"
                    : "Call Waiter"}
            </button>

            <LogoutButton
              className="flex items-center justify-center gap-2 rounded-xl border border-slate-700 bg-white px-5 py-3 font-medium text-slate-800 transition-all hover:border-red-300 hover:bg-red-50 hover:text-red-700"
            />

            <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 px-4 py-3 text-sm text-slate-300">
              Table: <span className="font-semibold text-orange-400">{tableId}</span>
            </div>
          </div>
        </div>
      </nav>

      <main className="relative z-10 mx-auto max-w-[1800px] px-4 pb-12 pt-4">
        {loading ? (
          <div className="mx-auto mt-20 max-w-xl rounded-3xl border border-slate-700/50 bg-slate-800/60 p-10 text-center backdrop-blur-xl shadow-2xl">
             <div className="w-16 h-16 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-6 shadow-[0_0_15px_rgba(249,115,22,0.5)]"></div>
             <h2 className="text-2xl font-bold text-white tracking-wide">Fetching Your Orders...</h2>
             <p className="mt-3 text-slate-400">Please wait while we sync with the kitchen.</p>
          </div>
        ) : sortedOrders.length === 0 ? (
          <div className="mx-auto mt-20 max-w-xl rounded-3xl border border-slate-700/50 bg-slate-800/60 p-10 text-center backdrop-blur-xl shadow-2xl">
            <h1 className="text-3xl font-bold text-white">No Active Orders</h1>
            <p className="mt-3 text-slate-400">Add items to create a new order for this table.</p>
            <button
              onClick={handleAddItems}
              className="mt-8 inline-flex items-center gap-2 rounded-xl bg-orange-500 px-6 py-3 font-bold text-white transition-all shadow-lg shadow-orange-500/20 hover:-translate-y-0.5 hover:bg-orange-400 active:scale-95"
            >
              <Plus size={18} strokeWidth={2.5} />
              Start Order
            </button>
          </div>
        ) : (
          <>
            <div className={`gap-8 ${sortedOrders.length === 1 ? "flex justify-center w-full max-w-3xl mx-auto" : sortedOrders.length === 2 ? "grid justify-center grid-cols-1 xl:grid-cols-2 max-w-6xl mx-auto" : "grid justify-center xl:grid-cols-2 2xl:grid-cols-3"}`}>
              {sortedOrders.map((order) => (
                <div key={order._id} className={sortedOrders.length === 1 ? "w-full flex justify-center" : "flex justify-center"}>
                  <OrderCard order={order} onViewOrder={setSelectedOrder} />
                </div>
              ))}
            </div>

            <div className="mt-8 flex justify-end">
              <button
                onClick={handleViewBill}
                disabled={!canViewCombinedBill}
                className={`
                  flex w-full items-center justify-center gap-2 rounded-xl px-8 py-3 font-bold transition-all shadow-lg sm:w-auto
                  ${canViewCombinedBill
                    ? "bg-gradient-to-r from-orange-500 to-orange-600 text-white shadow-orange-500/20 hover:-translate-y-0.5 hover:from-orange-400 hover:to-orange-500"
                    : "cursor-not-allowed border border-slate-700 bg-slate-800 text-slate-500"
                  }
                `}
              >
                View Full Bill
                <ArrowRight size={18} />
              </button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

import React, { useCallback, useEffect, useRef, useState } from "react";
import API from "../api";
import LogoutButton from "../components/LogoutButton";
import { UtensilsCrossed } from "lucide-react";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function pad(n) { return String(n).padStart(2, "0"); }

function elapsed(createdAt) {
  const diff = Math.max(0, Math.floor((Date.now() - new Date(createdAt)) / 1000));
  return { m: Math.floor(diff / 60), s: diff % 60, total: diff };
}

function CountUp({ createdAt }) {
  const [, setTick] = useState(0);
  useEffect(() => { const id = setInterval(() => setTick(t => t + 1), 1000); return () => clearInterval(id); }, []);
  const { m, s } = elapsed(createdAt);
  const isLong = elapsed(createdAt).total > 20 * 60;
  return <span style={{ color: isLong ? C.redMuted : C.muted, fontSize: 11 }}>{m}m {pad(s)}s ago</span>;
}

// ─── Vibrant Color Palette ────────────────────────────────────────────────────
const C = {
  bg:         "#0b0f1a",
  panel:      "#111827",
  card:       "#161d2d",
  border:     "rgba(255,255,255,0.08)",
  border2:    "rgba(255,255,255,0.14)",
  // Brand
  orange:     "#e8610a",
  orangeDim:  "rgba(232,97,10,0.15)",
  // Text
  text:       "#f1f5f9",
  muted:      "#64748b",
  mutedMid:   "#94a3b8",
  // Status colors — fully saturated
  greenMuted: "#16a34a",
  greenText:  "#22c55e",
  blueMuted:  "#2563eb",
  blueText:   "#60a5fa",
  amberMuted: "#d97706",
  amberText:  "#f59e0b",
  redMuted:   "#dc2626",
  redText:    "#f87171",
  // Column accents — vivid
  colNew:     "#ea580c",      // bright orange
  colCook:    "#3b82f6",      // bright blue
  colReady:   "#22c55e",      // bright green
  colNewText: "#fb923c",
  colCookText:"#93c5fd",
  colReadyText:"#86efac",
};

// ─── ETA Clock Picker ─────────────────────────────────────────────────────────
// A circular SVG clock face where the user picks minutes (1-60) by clicking/dragging
function EtaClockPicker({ value, onChange }) {
  const svgRef = useRef(null);
  const minutes = Number(value) || 0;
  const PRESETS = [5, 10, 15, 20, 25, 30, 45, 60];

  const angleFromMinutes = (m) => ((m / 60) * 360 - 90) * (Math.PI / 180);

  const minutesFromEvent = (e) => {
    const svg = svgRef.current;
    if (!svg) return 0;
    const rect = svg.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const angle = Math.atan2(clientY - cy, clientX - cx);
    let deg = (angle * 180) / Math.PI + 90;
    if (deg < 0) deg += 360;
    let m = Math.round((deg / 360) * 60);
    if (m === 0) m = 60;
    return Math.min(60, Math.max(1, m));
  };

  const dragging = useRef(false);
  const handleMove = (e) => { if (dragging.current) onChange(String(minutesFromEvent(e))); };
  const handleDown = (e) => { dragging.current = true; onChange(String(minutesFromEvent(e))); };
  const handleUp   = () => { dragging.current = false; };

  useEffect(() => {
    window.addEventListener("mouseup", handleUp);
    window.addEventListener("touchend", handleUp);
    return () => { window.removeEventListener("mouseup", handleUp); window.removeEventListener("touchend", handleUp); };
  }, []);

  // Hand position
  const r = 46;
  const handAngle = angleFromMinutes(minutes || 0);
  const hx = 60 + r * Math.cos(handAngle);
  const hy = 60 + r * Math.sin(handAngle);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
      {/* Clock face — enlarged */}
      <div style={{
        background: C.bg, borderRadius: "50%",
        border: `2px solid ${C.border2}`,
        padding: 6, width: 242, height: 242, boxSizing: "border-box",
        boxShadow: `0 0 32px rgba(232,97,10,0.12), 0 4px 24px rgba(0,0,0,0.5)`,
      }}>
        <svg
          ref={svgRef}
          width="226" height="226" viewBox="0 0 120 120"
          style={{ display: "block", cursor: "crosshair", userSelect: "none" }}
          onMouseDown={handleDown}
          onMouseMove={handleMove}
          onTouchStart={handleDown}
          onTouchMove={handleMove}
        >
          {/* Background circle */}
          <circle cx="60" cy="60" r="58" fill={C.panel} stroke={`${C.orange}25`} strokeWidth="1" />

          {/* Subtle inner ring */}
          <circle cx="60" cy="60" r="44" fill="none" stroke={C.border} strokeWidth="0.5" strokeDasharray="2 3" />

          {/* Tick marks */}
          {Array.from({ length: 60 }, (_, i) => {
            const a = ((i / 60) * 360 - 90) * Math.PI / 180;
            const isMajor = i % 5 === 0;
            const r1 = isMajor ? 47 : 51;
            const r2 = 55;
            return (
              <line key={i}
                x1={60 + r2 * Math.cos(a)} y1={60 + r2 * Math.sin(a)}
                x2={60 + r1 * Math.cos(a)} y2={60 + r1 * Math.sin(a)}
                stroke={isMajor ? C.mutedMid : C.border2} strokeWidth={isMajor ? 2 : 0.8}
              />
            );
          })}

          {/* Minute labels: 5,10,15...60 */}
          {Array.from({ length: 12 }, (_, i) => {
            const m = (i + 1) * 5;
            const a = ((m / 60) * 360 - 90) * Math.PI / 180;
            return (
              <text key={m}
                x={60 + 40 * Math.cos(a)} y={60 + 40 * Math.sin(a)}
                textAnchor="middle" dominantBaseline="central"
                fontSize="7.5" fill={minutes === m ? C.orange : C.mutedMid}
                fontWeight={minutes === m ? "700" : "400"}>
                {m}
              </text>
            );
          })}

          {/* Selected arc */}
          {minutes > 0 && (() => {
            const startA = -90 * Math.PI / 180;
            const endA   = angleFromMinutes(minutes);
            const large  = minutes > 30 ? 1 : 0;
            const r3 = 44;
            const sx = 60 + r3 * Math.cos(startA), sy = 60 + r3 * Math.sin(startA);
            const ex = 60 + r3 * Math.cos(endA),   ey = 60 + r3 * Math.sin(endA);
            return <path d={`M 60 60 L ${sx} ${sy} A ${r3} ${r3} 0 ${large} 1 ${ex} ${ey} Z`}
              fill={`${C.orange}28`} />;
          })()}

          {/* Hand line */}
          {minutes > 0 && (
            <line x1="60" y1="60" x2={hx} y2={hy}
              stroke={C.orange} strokeWidth="2" strokeLinecap="round" />
          )}

          {/* Hand tip glow */}
          {minutes > 0 && (
            <>
              <circle cx={hx} cy={hy} r="7" fill={`${C.orange}30`} />
              <circle cx={hx} cy={hy} r="4.5" fill={C.orange} />
            </>
          )}

          {/* Center dot */}
          <circle cx="60" cy="60" r="3.5" fill={C.orange} />

          {/* Center label */}
          <text x="60" y="57" textAnchor="middle" dominantBaseline="central"
            fontSize="14" fontWeight="800" fill={C.text}>
            {minutes > 0 ? minutes : "—"}
          </text>
          <text x="60" y="67" textAnchor="middle"
            fontSize="6.5" fill={C.muted} letterSpacing="1">MIN</text>
        </svg>
      </div>

      {/* Preset quick-picks */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 5, justifyContent: "center", maxWidth: 240 }}>
        {PRESETS.map(p => (
          <button key={p} onClick={() => onChange(String(p))} style={{
            padding: "3px 8px", borderRadius: 6, border: `1px solid ${value == p ? C.orange : C.border2}`,
            background: value == p ? C.orangeDim : "transparent",
            color: value == p ? C.orange : C.mutedMid,
            fontSize: 11, fontWeight: value == p ? 700 : 400, cursor: "pointer",
          }}>{p}m</button>
        ))}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function CookDashboard() {
  const rootRef = useRef(null);
  const [orders, setOrders]         = useState([]);
  const [loading, setLoading]       = useState(true);
  const [notification, setNotif]    = useState(null);
  const [etaByOrder, setEtaByOrder] = useState({});
  const [filter, setFilter]         = useState("all");
  const [fullscreen, setFullscreen] = useState(false);
  const [isReqOpen, setIsReqOpen]   = useState(false);
  const [dishName, setDishName]     = useState("");
  const [category, setCategory]     = useState("");
  const [price, setPrice]           = useState("");
  const [notes, setNotes]           = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [openEtaId, setOpenEtaId]   = useState(null); // which order has clock open

  const norm = v => String(v || "").toLowerCase();

  const showNotif = (message, type = "success") => {
    setNotif({ message, type });
    setTimeout(() => setNotif(p => p?.message === message ? null : p), 4000);
  };

  // Fullscreen using browser API
  const toggleFullscreen = async () => {
    if (!document.fullscreenElement) {
      try { await document.documentElement.requestFullscreen(); setFullscreen(true); }
      catch (e) { console.warn("Fullscreen not allowed", e); }
    } else {
      await document.exitFullscreen();
      setFullscreen(false);
    }
  };

  useEffect(() => {
    const handler = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  const fetchOrders = useCallback(async () => {
    try {
      const res = await API.get("/orders");
      const list = Array.isArray(res.data?.orders) ? res.data.orders
        : Array.isArray(res.data) ? res.data : [];
      const active = list.filter(o =>
        ["requested", "accepted", "preparing", "ready"].includes(norm(o.status))
      );
      active.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
      setOrders(active);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchOrders();
    const id = setInterval(fetchOrders, 15000);
    return () => clearInterval(id);
  }, [fetchOrders]);

  const setStatus = async (orderId, nextStatus, extra = {}) => {
    try {
      setOrders(prev => prev.map(o =>
        o._id === orderId
          ? { ...o, status: nextStatus, ...("etaSeconds" in extra ? { etaSeconds: extra.etaSeconds } : {}) }
          : o
      ));
      await API.patch(`/orders/${orderId}/status`, { status: nextStatus, ...extra });
      if (nextStatus === "ready")    showNotif("Order marked as ready");
      if (nextStatus === "accepted") showNotif("Order accepted — timer started");
    } catch (e) {
      console.error(e);
      showNotif("Failed to update status", "error");
      fetchOrders();
    }
  };

  const acceptOrder = async (orderId) => {
    const eta = Number(etaByOrder[orderId]);
    if (!Number.isFinite(eta) || eta <= 0) { showNotif("Set ETA before accepting", "error"); return; }
    setOpenEtaId(null);
    await setStatus(orderId, "accepted", { etaSeconds: Math.round(eta * 60) });
  };

  const submitDishRequest = async (e) => {
    e.preventDefault();
    if (!dishName.trim()) { showNotif("Please enter a dish name", "error"); return; }
    const priceNum = price === "" ? null : Number(price);
    if (price !== "" && (isNaN(priceNum) || priceNum < 0)) { showNotif("Invalid price", "error"); return; }
    try {
      setSubmitting(true);
      await API.post("/requests", { type: "dish", name: dishName.trim(), category: category.trim() || null, price: priceNum, notes: notes.trim() || null, requestedBy: "cook", createdAt: new Date().toISOString() });
      setDishName(""); setCategory(""); setPrice(""); setNotes(""); setIsReqOpen(false);
      showNotif("Dish request submitted");
    } catch { showNotif("Failed to submit", "error"); }
    finally { setSubmitting(false); }
  };

  // Categorise
  const newOrders    = orders.filter(o => norm(o.status) === "requested");
  const cookingNow   = orders.filter(o => ["accepted", "preparing"].includes(norm(o.status)));
  const readyToServe = orders.filter(o => norm(o.status) === "ready");

  const isDelayed = o => o.etaSeconds && o.acceptedAt && (Date.now() - new Date(o.acceptedAt)) / 1000 > o.etaSeconds;
  const isUrgent  = o => o.createdAt && (Date.now() - new Date(o.createdAt)) / 60000 > 15;

  const applyFilter = list => {
    if (filter === "delayed") return list.filter(isDelayed);
    if (filter === "urgent")  return list.filter(isUrgent);
    return list;
  };

  const filteredNew     = applyFilter(newOrders);
  const filteredCooking = applyFilter(cookingNow);
  const delayedCount    = cookingNow.filter(isDelayed).length;

  return (
    <div ref={rootRef} style={{ minHeight: "100vh", background: C.bg, display: "flex", flexDirection: "column", fontFamily: "system-ui,sans-serif" }}>
      {/* ── GLOBAL KEYFRAMES ── */}
      <style>{`
        @keyframes pulseGlow {
          0%, 100% { opacity: 1; box-shadow: 0 0 8px 2px currentColor; }
          50%       { opacity: 0.65; box-shadow: 0 0 18px 6px currentColor; }
        }
        @keyframes blink {
          0%, 100% { opacity: 0.55; }
          50%       { opacity: 0.1; }
        }
      `}</style>

      {/* ── NOTIFICATION ── */}
      {notification && (
        <div style={{
          position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)", zIndex: 999,
          display: "flex", alignItems: "center", gap: 8,
          padding: "8px 16px", borderRadius: 8,
          background: notification.type === "success" ? "#1a3a2a" : "#3a1a1a",
          border: `1px solid ${notification.type === "success" ? "#2e7d52" : "#7f1d1d"}`,
          color: notification.type === "success" ? "#4ade80" : "#f87171",
          fontSize: 12, fontWeight: 500,
          boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
        }}>
          <span>{notification.type === "success" ? "✓" : "✕"}</span>
          <span>{notification.message}</span>
          <button onClick={() => setNotif(null)} style={{ marginLeft: 6, background: "transparent", border: "none", color: "inherit", fontSize: 14, cursor: "pointer", opacity: 0.6 }}>×</button>
        </div>
      )}

      {/* ── HEADER ── */}
      <header style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 18px", height: 52,
        background: C.panel, borderBottom: `1px solid ${C.border}`,
        flexShrink: 0, zIndex: 50,
      }}>
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 34, height: 34, borderRadius: "50%",
            background: "linear-gradient(135deg, #e8610a, #b84d00)",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 0 14px rgba(232,97,10,0.55), 0 4px 12px rgba(0,0,0,0.4)",
          }}>
            <UtensilsCrossed size={16} color="#fff" strokeWidth={2.5} />
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: "#fff", lineHeight: 1, letterSpacing: 0.2 }}>SmartDine</div>
            <div style={{ fontSize: 9, color: C.mutedMid, letterSpacing: "0.14em", textTransform: "uppercase" }}>Kitchen Order System</div>
          </div>
        </div>

        {/* Filter tabs */}
        <div style={{ display: "flex", alignItems: "center", gap: 2, background: C.bg, borderRadius: 8, padding: 3, border: `1px solid ${C.border}` }}>
          {[
            { key: "all",     label: "All Orders" },
            { key: "delayed", label: "Delayed",  dot: C.amberText },
            { key: "urgent",  label: "Urgent",   dot: C.redText },
          ].map(({ key, label, dot }) => (
            <button key={key} onClick={() => setFilter(key)} style={{
              display: "flex", alignItems: "center", gap: 5,
              padding: "4px 12px", borderRadius: 6, border: "none",
              background: filter === key ? C.card : "transparent",
              color: filter === key ? C.text : C.muted,
              fontSize: 11.5, fontWeight: filter === key ? 600 : 400,
              cursor: "pointer", transition: "all 0.15s",
            }}>
              {dot && <span style={{ width: 5, height: 5, borderRadius: "50%", background: dot, flexShrink: 0, opacity: 0.8 }} />}
              {label}
            </button>
          ))}
        </div>

        {/* Right actions */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={toggleFullscreen} title={fullscreen ? "Exit Fullscreen" : "Fullscreen"} style={{
            display: "flex", alignItems: "center", gap: 5,
            padding: "4px 10px", borderRadius: 6,
            border: `1px solid ${C.border2}`,
            background: "transparent",
            color: C.mutedMid,
            fontSize: 11, cursor: "pointer",
          }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {fullscreen
                ? <><path d="M8 3v3a2 2 0 0 1-2 2H3"/><path d="M21 8h-3a2 2 0 0 1-2-2V3"/><path d="M3 16h3a2 2 0 0 1 2 2v3"/><path d="M16 21v-3a2 2 0 0 1 2-2h3"/></>
                : <><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></>}
            </svg>
            {fullscreen ? "Exit" : "Fullscreen"}
          </button>

          <LogoutButton className="inline-flex items-center gap-1.5 rounded border border-slate-700 bg-transparent px-3 py-1 text-xs text-slate-400 hover:border-red-800 hover:text-red-400 transition-all" />
        </div>
      </header>

      {/* ── KANBAN ── */}
      <main style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", overflow: "hidden", minHeight: 0 }}>

        {/* NEW ORDERS */}
        <KanbanCol
          title="NEW ORDERS" count={filteredNew.length}
          accent={C.colNew} accentText={C.colNewText}
          borderRight={`1px solid ${C.border}`}
          sub={filteredNew.length === 0 ? null : <span style={{ fontSize: 10, color: C.muted }}>{newOrders.length} pending</span>}
          isEmpty={filteredNew.length === 0} emptyMsg="No new orders"
        >
          {filteredNew.map(order => (
            <NewOrderCard
              key={order._id} order={order}
              etaValue={etaByOrder[order._id] ?? ""}
              onEtaChange={v => setEtaByOrder(p => ({ ...p, [order._id]: v }))}
              onAccept={() => acceptOrder(order._id)}
              clockOpen={openEtaId === order._id}
              onClockToggle={() => setOpenEtaId(id => id === order._id ? null : order._id)}
            />
          ))}
        </KanbanCol>

        {/* COOKING NOW */}
        <KanbanCol
          title="COOKING NOW" count={filteredCooking.length}
          accent={C.colCook} accentText={C.colCookText}
          borderRight={`1px solid ${C.border}`}
          sub={delayedCount > 0
            ? <span style={{ fontSize: 10, color: C.amberText, background: "rgba(245,158,11,0.12)", borderRadius: 4, padding: "1px 6px" }}>
                {delayedCount} delayed
              </span>
            : null}
          isEmpty={filteredCooking.length === 0} emptyMsg="Kitchen clear" emptySubMsg="Accepted orders appear here"
        >
          {filteredCooking.map(order => (
            <CookingCard key={order._id} order={order}
              onAction={() => setStatus(order._id, norm(order.status) === "accepted" ? "preparing" : "ready")} />
          ))}
        </KanbanCol>

        {/* READY TO SERVE */}
        <KanbanCol
          title="READY TO SERVE" count={readyToServe.length}
          accent={C.colReady} accentText={C.colReadyText}
          sub={readyToServe.length > 0
            ? <span style={{ fontSize: 10, color: C.muted }}>Completed today: {readyToServe.length}</span>
            : null}
          isEmpty={readyToServe.length === 0} emptyMsg="Nothing ready yet"
        >
          {readyToServe.map(order => <ReadyCard key={order._id} order={order} />)}
        </KanbanCol>
      </main>

      {/* ── REQUEST DISH MODAL ── */}
      {isReqOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)" }}
          onClick={() => !submitting && setIsReqOpen(false)}>
          <div style={{ width: 400, background: C.panel, border: `1px solid ${C.border2}`, borderRadius: 16, padding: 24, boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }}
            onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 4 }}>Request New Dish</h3>
            <p style={{ fontSize: 11.5, color: C.muted, marginBottom: 18 }}>Submit a proposal for the admin menu.</p>
            <form onSubmit={submitDishRequest}>
              {[{ label: "Dish Name *", val: dishName, set: setDishName, type: "text", ph: "e.g. Paneer Tikka", req: true },
                { label: "Category",   val: category,  set: setCategory,  type: "text",   ph: "e.g. Starter" },
                { label: "Price (₹)",  val: price,     set: setPrice,     type: "number", ph: "e.g. 250" }]
                .map(({ label, val, set, type, ph, req }) => (
                  <div key={label} style={{ marginBottom: 12 }}>
                    <label style={{ display: "block", fontSize: 10, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: C.muted, marginBottom: 5 }}>{label}</label>
                    <input type={type} value={val} onChange={e => set(e.target.value)} placeholder={ph} required={req}
                      style={{ width: "100%", background: C.card, border: `1px solid ${C.border2}`, borderRadius: 8, padding: "8px 12px", color: C.text, fontSize: 12.5, outline: "none", boxSizing: "border-box" }} />
                  </div>
                ))}
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: "block", fontSize: 10, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: C.muted, marginBottom: 5 }}>Notes</label>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Special instructions..." rows={2}
                  style={{ width: "100%", background: C.card, border: `1px solid ${C.border2}`, borderRadius: 8, padding: "8px 12px", color: C.text, fontSize: 12.5, outline: "none", resize: "none", boxSizing: "border-box" }} />
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" onClick={() => !submitting && setIsReqOpen(false)}
                  style={{ flex: 1, padding: "8px 0", borderRadius: 8, border: `1px solid ${C.border2}`, background: "transparent", color: C.mutedMid, fontSize: 12, cursor: "pointer" }}>
                  Cancel
                </button>
                <button type="submit" disabled={submitting}
                  style={{ flex: 1, padding: "8px 0", borderRadius: 8, border: "none", background: C.orange, color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", opacity: submitting ? 0.6 : 1 }}>
                  {submitting ? "Sending…" : "Submit"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* FAB */}
      <button onClick={() => setIsReqOpen(true)} style={{
        position: "fixed", bottom: 22, right: 22, zIndex: 100,
        display: "flex", alignItems: "center", gap: 6,
        padding: "8px 16px", borderRadius: 8,
        background: C.card, border: `1px solid ${C.border2}`,
        color: C.mutedMid, fontSize: 12, fontWeight: 500, cursor: "pointer",
        boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
      }}>
        <span style={{ fontSize: 14, lineHeight: 1 }}>+</span> Request Dish
      </button>
    </div>
  );
}

// ─── Kanban Column ────────────────────────────────────────────────────────────

function KanbanCol({ title, count, accent, accentText, sub, children, isEmpty, emptyMsg, emptySubMsg, borderRight }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", overflow: "hidden", borderRight: borderRight || "none" }}>
      {/* Column header */}
      <div style={{ padding: "12px 14px 8px", borderBottom: `1px solid ${C.border}`, flexShrink: 0, background: "rgba(255,255,255,0.008)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <span style={{
              width: 8, height: 8, borderRadius: "50%",
              background: accentText, flexShrink: 0,
              boxShadow: `0 0 8px 2px ${accentText}90, 0 0 16px 4px ${accentText}40`,
              animation: "pulseGlow 2.5s ease-in-out infinite",
            }} />
            <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.12em", color: C.mutedMid, textTransform: "uppercase" }}>{title}</span>
            <span style={{ fontSize: 10.5, fontWeight: 700, color: accentText, background: `${accent}40`, border: `1px solid ${accent}60`, borderRadius: 20, padding: "0 7px", opacity: 0.9 }}>{count}</span>
          </div>
          {sub && <div>{sub}</div>}
        </div>
      </div>

      {/* Cards scroll area */}
      <div style={{ flex: 1, overflowY: "auto", padding: "10px 10px", display: "flex", flexDirection: "column", gap: 8 }}>
        {isEmpty ? (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, padding: 40, textAlign: "center" }}>
            <span style={{ fontSize: 11.5, color: C.muted }}>{emptyMsg}</span>
            {emptySubMsg && <span style={{ fontSize: 10.5, color: C.muted, opacity: 0.6 }}>{emptySubMsg}</span>}
          </div>
        ) : children}
      </div>
    </div>
  );
}

// ─── ETA Clock Popup (portal-style overlay) ───────────────────────────────────

function EtaPopup({ orderId, etaValue, onChange, onClose, onConfirm }) {
  // Live ticking clock
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const hh = pad(now.getHours());
  const mm = pad(now.getMinutes());
  const ss = pad(now.getSeconds());

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 500,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: C.panel, border: `1px solid ${C.border2}`,
          borderRadius: 18, padding: "22px 24px 18px",
          boxShadow: `0 0 0 1px ${C.border2}, 0 24px 80px rgba(0,0,0,0.75)`,
          display: "flex", flexDirection: "column", alignItems: "center", gap: 16,
          minWidth: 290,
        }}
      >
        {/* Header: title + close */}
        <div style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.text, letterSpacing: 0.3 }}>Set Cook Time</div>
            {/* Live real-time clock */}
            <div style={{
              fontSize: 22, fontWeight: 800, color: C.orange,
              fontVariantNumeric: "tabular-nums", letterSpacing: 4,
              lineHeight: 1.2, marginTop: 2,
              textShadow: `0 0 18px ${C.orange}90`,
            }}>
              {hh}<span style={{ opacity: 0.5, animation: "blink 1s step-end infinite" }}>:</span>{mm}<span style={{ opacity: 0.5 }}>:</span>
              <span style={{ fontSize: 15, fontWeight: 600, color: C.mutedMid }}>{ss}</span>
            </div>
          </div>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: C.muted, fontSize: 18, cursor: "pointer", lineHeight: 1, padding: "4px 8px" }}>×</button>
        </div>

        <EtaClockPicker value={etaValue} onChange={onChange} />

        <div style={{ display: "flex", gap: 8, width: "100%" }}>
          <button onClick={onClose}
            style={{ flex: 1, padding: "8px 0", borderRadius: 8, border: `1px solid ${C.border2}`, background: "transparent", color: C.mutedMid, fontSize: 12, cursor: "pointer" }}>
            Cancel
          </button>
          <button onClick={onConfirm}
            style={{
              flex: 2, padding: "8px 0", borderRadius: 8, border: "none",
              background: `linear-gradient(135deg, ${C.orange}, #b84d00)`,
              color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer",
              boxShadow: `0 4px 18px ${C.orange}55`,
            }}>
            Confirm — {etaValue ? `${etaValue} min` : "Set ETA"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── New Order Card ───────────────────────────────────────────────────────────

function NewOrderCard({ order, etaValue, onEtaChange, onAccept, clockOpen, onClockToggle }) {
  const items = order.items || [];
  const itemMap = items.reduce((acc, item) => {
    const n = typeof item === "string" ? item : item.name || "?";
    acc[n] = (acc[n] || 0) + 1; return acc;
  }, {});
  const urgent = (Date.now() - new Date(order.createdAt)) / 60000 > 15;

  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 12px 10px", borderLeft: `2px solid ${C.orange}` }}>

      {/* ETA Popup Portal */}
      {clockOpen && (
        <EtaPopup
          etaValue={etaValue}
          onChange={onEtaChange}
          onClose={onClockToggle}
          onConfirm={onClockToggle}
        />
      )}

      {/* Header row */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 7 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: C.text, fontFamily: "monospace" }}>#{order._id?.slice(-6)}</span>
            <span style={{ fontSize: 9, color: C.muted, background: "rgba(255,255,255,0.05)", borderRadius: 20, padding: "1px 6px", letterSpacing: 0.5 }}>T-{pad(order.tableNo || 13)}</span>
          </div>
          <div style={{ marginTop: 2 }}><CountUp createdAt={order.createdAt} /></div>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {urgent && <span style={{ fontSize: 8.5, fontWeight: 600, color: C.redText, background: "rgba(239,68,68,0.08)", borderRadius: 4, padding: "1px 6px", border: `1px solid ${C.redMuted}` }}>URGENT</span>}
          <span style={{ fontSize: 8.5, fontWeight: 600, color: C.greenText, background: "rgba(74,222,128,0.07)", borderRadius: 4, padding: "1px 6px", border: `1px solid ${C.greenMuted}` }}>NEW</span>
        </div>
      </div>

      {/* Items */}
      <div style={{ marginBottom: 8, borderTop: `1px solid ${C.border}`, paddingTop: 7 }}>
        {Object.entries(itemMap).map(([name, qty]) => (
          <div key={name} style={{ fontSize: 12.5, color: C.text, lineHeight: 1.6 }}>
            {name}{qty > 1 && <span style={{ color: C.muted, fontSize: 10.5 }}> ×{qty}</span>}
          </div>
        ))}
      </div>

      {/* Received + time */}
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 9, fontSize: 10, color: C.muted }}>
        <span>Received {Math.floor((Date.now() - new Date(order.createdAt)) / 60000)}m ago</span>
        <span>{new Date(order.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
      </div>

      {/* ETA row — click to open popup */}
      <div
        onClick={onClockToggle}
        style={{
          marginBottom: 8, display: "flex", alignItems: "center", gap: 8,
          background: C.bg, border: `1px solid ${C.border2}`, borderRadius: 7,
          padding: "6px 10px", cursor: "pointer", transition: "border-color 0.15s",
        }}
        title="Click to set ETA"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.orange} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
        </svg>
        <span style={{ fontSize: 11, color: C.muted, fontWeight: 500 }}>Cook time</span>
        <span style={{ marginLeft: "auto", fontSize: 12, fontWeight: 700, color: etaValue ? C.text : C.muted }}>
          {etaValue ? `${etaValue} min` : "Set ETA →"}
        </span>
      </div>

      {/* Accept button */}
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button onClick={onAccept} style={{
          padding: "6px 18px", borderRadius: 7, border: "none",
          background: C.orange, color: "#fff",
          fontSize: 11.5, fontWeight: 600, cursor: "pointer", letterSpacing: 0.2,
        }}>
          Accept →
        </button>
      </div>
    </div>
  );
}

// ─── Cooking Card ─────────────────────────────────────────────────────────────

function CookingCard({ order, onAction }) {
  // tick forces re-render every second so all derived values are fresh
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const items = order.items || [];
  const itemMap = items.reduce((acc, item) => {
    const n = typeof item === "string" ? item : item.name || "?";
    acc[n] = (acc[n] || 0) + 1; return acc;
  }, {});

  const isPrep = norm_local(order.status) === "preparing";

  // Use acceptedAt if available, else fall back to createdAt
  const startTime = order.acceptedAt || order.createdAt;
  const secGone   = startTime ? Math.floor((Date.now() - new Date(startTime)) / 1000) : 0;
  const remaining = (order.etaSeconds || 0) - secGone;
  const isOverdue   = remaining <= 0;
  const isLastMin   = remaining > 0 && remaining <= 60;  // under 1 minute → urgent
  const absR = Math.abs(remaining);
  const remM = Math.floor(absR / 60), remS = absR % 60;
  const pct  = order.etaSeconds ? Math.min(100, (secGone / order.etaSeconds) * 100) : 0;

  // Dynamic accent colours based on state
  const leftBorderColor = isOverdue ? C.redMuted
    : isLastMin           ? "#f59e0b"
    : isPrep              ? C.blueMuted
    :                       C.amberMuted;

  const leftText = isOverdue ? C.redText
    : isLastMin  ? C.amberText
    : isPrep     ? C.blueText
    :              C.amberText;

  const barColor = isOverdue ? C.redMuted
    : isLastMin  ? "#f59e0b"
    : isPrep     ? C.blueMuted
    :              C.amberMuted;

  return (
    <div style={{
      background: C.card,
      border: `1px solid ${isLastMin || isOverdue ? "rgba(239,68,68,0.25)" : C.border}`,
      borderRadius: 10, padding: "12px 12px 10px",
      borderLeft: `2px solid ${leftBorderColor}`,
      boxShadow: (isOverdue || isLastMin) ? "0 0 0 1px rgba(239,68,68,0.1)" : "none",
    }}>

      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 7 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: C.text, fontFamily: "monospace" }}>#{order._id?.slice(-6)}</span>
            <span style={{ fontSize: 9, color: C.muted, background: "rgba(255,255,255,0.05)", borderRadius: 20, padding: "1px 6px", letterSpacing: 0.5 }}>T-{pad(order.tableNo || 81)}</span>
          </div>
          {startTime && (
            <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>
              Started {Math.floor((Date.now() - new Date(startTime)) / 60000)}m ago
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {isOverdue && (
            <span style={{ fontSize: 8.5, fontWeight: 700, color: C.redText, background: "rgba(239,68,68,0.15)", borderRadius: 4, padding: "1px 6px", border: `1px solid ${C.redMuted}`, letterSpacing: 0.5 }}>OVERDUE</span>
          )}
          {isLastMin && !isOverdue && (
            <span style={{ fontSize: 8.5, fontWeight: 700, color: "#f59e0b", background: "rgba(245,158,11,0.15)", borderRadius: 4, padding: "1px 6px", border: "1px solid #d97706", animation: "blink 0.8s step-end infinite" }}>⚠ &lt;1 MIN</span>
          )}
          <span style={{ fontSize: 8.5, fontWeight: 600, color: leftText, background: `${leftBorderColor}22`, borderRadius: 4, padding: "1px 6px", border: `1px solid ${leftBorderColor}` }}>
            {isPrep ? "COOKING" : "ACCEPTED"}
          </span>
        </div>
      </div>

      {/* Items */}
      <div style={{ marginBottom: 8, borderTop: `1px solid ${C.border}`, paddingTop: 7 }}>
        {Object.entries(itemMap).map(([name, qty]) => (
          <div key={name} style={{ fontSize: 12.5, color: C.text, lineHeight: 1.6 }}>
            {name}{qty > 1 && <span style={{ color: C.muted, fontSize: 10.5 }}> ×{qty}</span>}
          </div>
        ))}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 10, color: C.muted }}>
        <span>Started {Math.floor((Date.now() - new Date(order.createdAt)) / 60000)}m ago</span>
        {order.createdAt && <span>{new Date(order.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>}
      </div>

      {/* Countdown bar */}
      {order.etaSeconds > 0 && (
        <div style={{ marginBottom: 9 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
            <span style={{ fontSize: 10, color: C.muted }}>Time remaining</span>
            {isOverdue
              ? <span style={{ fontSize: 11, fontWeight: 700, color: C.redText, letterSpacing: 0.5 }}>OVERDUE +{remM}m {pad(remS)}s</span>
              : isLastMin
                ? <span style={{ fontSize: 11, fontWeight: 700, color: "#f59e0b", animation: "blink 0.8s step-end infinite" }}>{pad(remS)}s</span>
                : <span style={{ fontSize: 11, fontWeight: 700, color: C.amberText, fontVariantNumeric: "tabular-nums" }}>{remM}m {pad(remS)}s</span>
            }
          </div>
          {/* Progress bar */}
          <div style={{ height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 3, overflow: "hidden" }}>
            <div style={{
              height: "100%", width: `${pct}%`, borderRadius: 3,
              background: isOverdue ? C.redMuted
                : isLastMin  ? `linear-gradient(90deg, #f59e0b, #ef4444)`
                : isPrep     ? `linear-gradient(90deg, ${C.blueMuted}, ${C.blueText})`
                :              `linear-gradient(90deg, ${C.amberMuted}, ${C.amberText})`,
              transition: "width 1s linear",
            }} />
          </div>
        </div>
      )}

      {/* Compact action button */}
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button onClick={onAction} style={{
          padding: "6px 16px", borderRadius: 7, border: "none",
          background: isPrep ? C.greenMuted : C.amberMuted,
          color: "#fff", fontSize: 11.5, fontWeight: 600, cursor: "pointer", letterSpacing: 0.2,
        }}>
          {isPrep ? "Mark Ready" : "Start Prep →"}
        </button>
      </div>
    </div>
  );
}

function norm_local(v) { return String(v || "").toLowerCase(); }

// ─── Ready Card ───────────────────────────────────────────────────────────────

function ReadyCard({ order }) {
  const items = order.items || [];
  const itemMap = items.reduce((acc, item) => {
    const n = typeof item === "string" ? item : item.name || "?";
    acc[n] = (acc[n] || 0) + 1; return acc;
  }, {});

  return (
    <div style={{
      background: C.card, border: `1px solid ${C.border}`,
      borderRadius: 10, padding: "12px 12px 10px",
      borderLeft: `2px solid #22c55e`,
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 7 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: C.text, fontFamily: "monospace" }}>#{order._id?.slice(-6)}</span>
          <span style={{ fontSize: 9, color: C.muted, background: "rgba(255,255,255,0.05)", borderRadius: 20, padding: "1px 6px", letterSpacing: 0.5 }}>T-{pad(order.tableNo || 98)}</span>
          {Object.keys(itemMap).length > 1 && (
            <span style={{ fontSize: 9, color: C.muted }}>+{Object.keys(itemMap).length - 1}</span>
          )}
        </div>
        <span style={{
          fontSize: 8.5, fontWeight: 700, color: "#22c55e",
          background: "rgba(34,197,94,0.12)", borderRadius: 4,
          padding: "1px 8px", border: "1px solid rgba(34,197,94,0.35)",
          letterSpacing: 0.5,
        }}>READY</span>
      </div>

      {/* Items */}
      <div style={{ marginBottom: 8, borderTop: `1px solid ${C.border}`, paddingTop: 7 }}>
        {Object.entries(itemMap).map(([name, qty]) => (
          <div key={name} style={{ fontSize: 12.5, color: C.text, lineHeight: 1.6 }}>
            {name}{qty > 1 && <span style={{ color: C.muted, fontSize: 10.5 }}> ×{qty}</span>}
          </div>
        ))}
      </div>

      {/* Footer */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 6, borderTop: `1px solid ${C.border}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span style={{ fontSize: 10.5, color: "#22c55e", fontWeight: 500 }}>
            Ready at {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>
        <span style={{
          fontSize: 9.5, color: C.mutedMid,
          background: "rgba(255,255,255,0.04)",
          border: `1px solid ${C.border}`,
          borderRadius: 4, padding: "1px 8px",
        }}>Served ✓</span>
      </div>
    </div>
  );
}

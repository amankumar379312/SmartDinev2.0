import React, {
  useState, useRef, useEffect, useMemo, useContext, useCallback,
} from "react";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { useNavigate, useLocation } from "react-router-dom";
import API from "../api";
import { AuthContext } from "../context/AuthContext";

// ─── THEME CONSTANTS ─────────────────────────────────────
const C = {
  bg: "#0b0e17",
  card: "#131825",
  border: "#1c2235",
  orange: "#E8610A",
  orangeGlow: "rgba(232,97,10,0.35)",
  orangeDim: "rgba(232,97,10,0.12)",
  text: "#dce4f5",
  muted: "#5a6480",
  mutedMid: "#8392b0",
};

// ─── GLOBAL STYLES ───────────────────────────────────────
const G = `
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700&family=Syne:wght@600;700;800&display=swap');
*{font-family:'DM Sans',sans-serif;box-sizing:border-box;margin:0;padding:0;}
.syne{font-family:'Syne',sans-serif;}
.no-sb::-webkit-scrollbar{display:none;}
.no-sb{-ms-overflow-style:none;scrollbar-width:none;}

@keyframes fadeUp{from{opacity:0;transform:translateY(12px);}to{opacity:1;transform:translateY(0);}}
@keyframes scaleIn{from{opacity:0;transform:scale(0.93);}to{opacity:1;transform:scale(1);}}
@keyframes msgIn{from{opacity:0;transform:translateY(8px);}to{opacity:1;transform:translateY(0);}}
@keyframes chipIn{from{opacity:0;transform:scale(0.9) translateY(4px);}to{opacity:1;transform:scale(1) translateY(0);}}
@keyframes dot{0%,80%,100%{transform:scaleY(0.5);opacity:0.35;}40%{transform:scaleY(1);opacity:1;}}
@keyframes toastUp{from{opacity:0;transform:translateY(14px) scale(0.96);}to{opacity:1;transform:translateY(0) scale(1);}}
@keyframes pulse{0%,100%{box-shadow:0 0 0 0 rgba(232,97,10,0.5);}50%{box-shadow:0 0 0 18px rgba(232,97,10,0);}}
@keyframes ripple{0%{transform:scale(1);opacity:0.6;}100%{transform:scale(2.6);opacity:0;}}
@keyframes orbFloat{0%,100%{transform:translateY(0) scale(1);}50%{transform:translateY(-14px) scale(1.04);}}
@keyframes orbTalk{0%,100%{transform:scaleY(1);}20%{transform:scaleY(1.22) scaleX(0.9);}50%{transform:scaleY(0.85) scaleX(1.07);}75%{transform:scaleY(1.15) scaleX(0.93);}}
@keyframes orbListen{0%,100%{transform:scale(1);}50%{transform:scale(1.1);}}
@keyframes wv{0%,100%{height:3px;}50%{height:18px;}}
@keyframes pdot{0%,100%{opacity:1;transform:scale(1);}50%{opacity:0.3;transform:scale(0.6);}}
@keyframes modeFade{from{opacity:0;transform:scale(0.97);}to{opacity:1;transform:scale(1);}}
@keyframes micRing{0%{box-shadow:0 0 0 0 rgba(232,97,10,0.6);}100%{box-shadow:0 0 0 14px rgba(232,97,10,0);}}
@keyframes accentLine{from{width:0;}to{width:100%;}}
@keyframes novaGlow{0%,100%{box-shadow:0 0 0 2px rgba(232,97,10,0.2);}50%{box-shadow:0 0 0 5px rgba(232,97,10,0.45);}}
@keyframes toggleSlide{from{opacity:0;transform:scale(0.92);}to{opacity:1;transform:scale(1);}}

.blob-float{animation:orbFloat 5s ease-in-out infinite;}
.blob-talk{animation:orbTalk 0.52s ease-in-out infinite;}
.blob-listen{animation:orbListen 1s ease-in-out infinite;}
.fade-up{animation:fadeUp 0.38s cubic-bezier(0.34,1.56,0.64,1) both;}
.scale-in{animation:scaleIn 0.32s cubic-bezier(0.34,1.56,0.64,1) both;}
.msg-in{animation:msgIn 0.3s ease-out forwards;}
.chip-in{animation:chipIn 0.22s ease-out forwards;}
.mode-fade{animation:modeFade 0.38s cubic-bezier(0.34,1.56,0.64,1) forwards;}
.mic-active{animation:micRing 1s ease-out infinite;}
.dot{animation:dot 1.4s ease-in-out infinite;}
.wv{animation:wv 0.7s ease-in-out infinite;}
.pdot{animation:pdot 1.4s ease-in-out infinite;}
.nova-glow{animation:novaGlow 2.5s ease-in-out infinite;}
.toggle-slide{animation:toggleSlide 0.25s cubic-bezier(0.34,1.56,0.64,1) both;}

.tfade{-webkit-mask-image:linear-gradient(to bottom,transparent 0%,black 18%,black 72%,transparent 100%);mask-image:linear-gradient(to bottom,transparent 0%,black 18%,black 72%,transparent 100%);}

button{cursor:pointer;transition:transform 0.15s,opacity 0.15s;}
button:active{transform:scale(0.96);}
button:disabled{opacity:0.45;cursor:not-allowed;}
`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ════════════════════════════════════════════════════════
// MODE TOGGLE BUTTON
// ════════════════════════════════════════════════════════
function ModeToggle({ mode, onToggle }) {
  const isVoice = mode === "voice";
  return (
    <button
      onClick={onToggle}
      className="toggle-slide"
      title={isVoice ? "Switch to Chat" : "Switch to Voice"}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "6px 10px 6px 8px",
        borderRadius: 20,
        border: `1px solid ${isVoice ? "rgba(232,97,10,0.45)" : C.border}`,
        background: isVoice ? C.orangeDim : C.card,
        color: isVoice ? C.orange : C.mutedMid,
        fontSize: 11.5,
        fontWeight: 600,
        letterSpacing: 0.3,
        boxShadow: isVoice ? `0 2px 12px rgba(232,97,10,0.2)` : "none",
        transition: "all 0.25s",
        whiteSpace: "nowrap",
      }}
    >
      {isVoice ? (
        <>
          {/* Voice icon */}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" />
          </svg>
          Voice
        </>
      ) : (
        <>
          {/* Chat icon */}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          Chat
        </>
      )}
    </button>
  );
}

// ════════════════════════════════════════════════════════
// ROOT
// ════════════════════════════════════════════════════════
export default function Assistant() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useContext(AuthContext);
  const currentTableId = location.state?.selectedTables?.[0]
    || localStorage.getItem("tableId") || "walkin";

  // Default directly to chat mode — no landing page
  const [mode, setMode] = useState("chat");

  // ── MENU ──────────────────────────────────────
  const [menuItems, setMenuItems] = useState([]);
  const [menuLoading, setMenuLoading] = useState(true);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const menuGrouped = useMemo(() => {
    const g = { Starters: [], "Main Course": [], Desserts: [], Others: [] };
    for (const it of menuItems) {
      const c = String(it.category || "").toLowerCase();
      if (c.includes("starter")) g.Starters.push(it);
      else if (c.includes("main")) g["Main Course"].push(it);
      else if (c.includes("dessert")) g.Desserts.push(it);
      else g.Others.push(it);
    }
    return g;
  }, [menuItems]);

  const menuNames = useMemo(() => menuItems.map((i) => i.name), [menuItems]);
  const menuCatalog = useMemo(() =>
    menuItems.map((i) => `${i.name} (₹${i.price || 150}, ${i.category || "Other"})`).join(", "),
    [menuItems]);

  useEffect(() => {
    (async () => {
      try {
        let res;
        try { res = await API.get("/menu/items"); } catch { res = await API.get("/menu"); }
        const list = Array.isArray(res.data?.items) ? res.data.items
          : Array.isArray(res.data) ? res.data : [];
        setMenuItems(list);
      } catch { setMenuItems([]); }
      finally { setMenuLoading(false); }
    })();
  }, []);

  // ── CART ──────────────────────────────────────
  const [cart, setCart] = useState([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [toastItem, setToastItem] = useState(null);

  const cartCount = useMemo(() => cart.reduce((s, i) => s + i.qty, 0), [cart]);
  const cartTotal = useMemo(() => cart.reduce((s, i) => {
    const m = menuItems.find((m) => m.name === i.name);
    return s + i.qty * (m?.price || 150);
  }, 0), [cart, menuItems]);

  const addItem = useCallback((name) => {
    setCart((p) => {
      const ex = p.find((i) => i.name === name);
      return ex ? p.map((i) => i.name === name ? { ...i, qty: i.qty + 1 } : i)
        : [...p, { name, qty: 1 }];
    });
    setToastItem(name);
    setTimeout(() => setToastItem(null), 2200);
  }, []);

  const removeItem = useCallback((name) => {
    setCart((p) => {
      const ex = p.find((i) => i.name === name);
      if (!ex) return p;
      return ex.qty <= 1 ? p.filter((i) => i.name !== name)
        : p.map((i) => i.name === name ? { ...i, qty: i.qty - 1 } : i);
    });
  }, []);

  const handleOrder = useCallback(async (cartSnap) => {
    const orderCart = cartSnap || cart;
    if (orderCart.length === 0) return;
    if (!user) { navigate("/login"); return; }
    const total = orderCart.reduce((s, i) => {
      const m = menuItems.find((m) => m.name === i.name);
      return s + i.qty * (m?.price || 150);
    }, 0);
    const orderData = {
      name: user.name || "", email: user.email || "", phone: user.phone || "",
      items: orderCart.flatMap((i) => Array(i.qty).fill(i.name)),
      totalCost: total, tableNo: currentTableId,
    };
    try {
      const res = await API.post("/orders/create", orderData);
      setCart([]);
      setIsCartOpen(false);
      navigate("/after-order", { replace: true, state: { orderId: res.data?.order?._id } });
    } catch (e) { alert(e?.response?.data?.message || "Error placing order."); }
  }, [cart, menuItems, currentTableId, user, navigate]);

  // ── AI ─────────────────────────────────────────
  const MODEL_CHAIN = ["models/gemini-3.1-flash-lite-preview", "gemini-2.5-flash", "gemini-2.0-flash"];
  const modelIdxRef = useRef(0);
  const sessionRef = useRef(null);
  const genAIRef = useRef(null);

  const buildPrompt = useCallback((cartSnap) => {
    const cs = cartSnap?.length > 0
      ? cartSnap.map((c) => `${c.name} ×${c.qty}`).join(", ") : "empty";
    return `You are Nova, SmartDine's AI dining assistant — warm, knowledgeable, concise.
Guest: ${user?.name || "Guest"} | Table: ${currentTableId}
MENU: ${menuCatalog || "loading..."}
CART: [${cs}]

Respond ONLY valid JSON (no markdown, no backticks):
{"message":"1-2 warm sentences","actions":[],"suggestions":["chip1","chip2","chip3"]}

Action types:
{"type":"add_to_cart","item":"EXACT name from menu"}
{"type":"remove_from_cart","item":"EXACT name"}
{"type":"show_menu"}
{"type":"place_order"}
{"type":"open_cart"}
{"type":"ask_choice","options":["A","B","C"]}

Rules: Only real menu items. On "add X" always add_to_cart. Suggest pairings. 2-3 chips.`;
  }, [menuCatalog, user, currentTableId]);

  const initSession = useCallback((idx = 0) => {
    try {
      if (!genAIRef.current)
        genAIRef.current = new GoogleGenerativeAI(process.env.REACT_APP_GEMINI_API_KEY);
      modelIdxRef.current = idx;
      const model = genAIRef.current.getGenerativeModel({ model: MODEL_CHAIN[idx] });
      sessionRef.current = model.startChat({
        history: [],
        generationConfig: { temperature: 0.85, maxOutputTokens: 600 },
      });
    } catch (e) { console.error(e); }
  }, []);

  const askAIWithRetry = useCallback(async (text, cartSnap) => {
    const prompt = buildPrompt(cartSnap);
    for (let attempt = 0; attempt < 7; attempt++) {
      try {
        if (!sessionRef.current) initSession(modelIdxRef.current);
        const result = await sessionRef.current.sendMessage(`${prompt}\n\nUser: "${text}"`);
        const raw = result.response.text().trim().replace(/```json\s*/g, "").replace(/```/g, "");
        return JSON.parse(raw);
      } catch (e) {
        const is429 = String(e?.message).includes("429");
        const is404 = String(e?.message).includes("404");
        if (is404) {
          const next = modelIdxRef.current + 1;
          if (next < MODEL_CHAIN.length) { initSession(next); continue; }
          break;
        }
        if (is429) {
          const wait = Math.min(800 * 2 ** Math.floor(attempt / 2), 10000);
          await sleep(wait);
          if (attempt % 2 === 1) {
            const next = modelIdxRef.current + 1;
            if (next < MODEL_CHAIN.length) initSession(next);
          }
          continue;
        }
        console.error("AI error:", e);
        break;
      }
    }
    return { message: "I'm a bit busy right now! Browse the menu and add items manually.", actions: [], suggestions: ["📋 Full menu", "🛒 My cart"] };
  }, [buildPrompt, initSession]);

  // ── SHARED ─────────────────────────────────────
  const shared = {
    user, menuItems, menuNames, menuGrouped, menuLoading,
    cart, cartCount, cartTotal, addItem, removeItem, handleOrder,
    isCartOpen, setIsCartOpen,
    isMenuOpen, setIsMenuOpen,
    toastItem,
    initSession, sessionRef, askAIWithRetry, buildPrompt,
    onToggleMode: () => setMode((m) => m === "voice" ? "chat" : "voice"),
    currentTableId,
    mode,
  };

  if (mode === "voice") return <VoiceMode {...shared} />;
  return <ChatMode {...shared} />;
}

// ════════════════════════════════════════════════════════
// NOVA AVATAR
// ════════════════════════════════════════════════════════
function NovaAvatar({ size = 36 }) {
  return (
    <div className="nova-glow" style={{
      width: size, height: size, borderRadius: "50%", flexShrink: 0,
      background: `linear-gradient(135deg, ${C.orange}, #b84d00)`,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.44,
    }}>🍴</div>
  );
}

// ════════════════════════════════════════════════════════
// VOICE MODE
// ════════════════════════════════════════════════════════
function VoiceMode({
  user, menuItems, menuNames, menuGrouped,
  cart, cartCount, cartTotal, addItem, removeItem, handleOrder,
  isCartOpen, setIsCartOpen, isMenuOpen, setIsMenuOpen, toastItem,
  initSession, askAIWithRetry, onToggleMode, currentTableId, mode,
}) {
  const name = user?.name?.split(" ")[0] || "there";
  const [phase, setPhase] = useState("idle");
  const [transcript, setTranscript] = useState("");
  const [reply, setReply] = useState("");
  const recogRef = useRef(null);
  const hasSpeech = "SpeechRecognition" in window || "webkitSpeechRecognition" in window;
  const cartRef = useRef(cart);
  useEffect(() => { cartRef.current = cart; }, [cart]);

  useEffect(() => {
    initSession(0);
    const hour = new Date().getHours();
    const g = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
    const msg = `${g} ${name}! I'm Nova, your SmartDine AI waiter. Tap the orb and tell me what you'd like to eat!`;
    setReply(msg);
    speak(msg, () => setPhase("idle"));
    setPhase("speaking");
  }, []);

  const speak = (text, onEnd) => {
    if (!window.speechSynthesis) { onEnd?.(); return; }
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.92; u.pitch = 1.05;
    const voices = window.speechSynthesis.getVoices();
    const v = voices.find((v) => v.name.includes("Google") && v.lang.startsWith("en"))
      || voices.find((v) => v.lang.startsWith("en"));
    if (v) u.voice = v;
    u.onstart = () => setPhase("speaking");
    u.onend = () => { setPhase("idle"); onEnd?.(); };
    window.speechSynthesis.speak(u);
  };

  const startListening = () => {
    if (!hasSpeech) return;
    window.speechSynthesis.cancel();
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const r = new SR();
    r.continuous = false; r.interimResults = true; r.lang = "en-US";
    recogRef.current = r;
    r.onresult = (e) => {
      let fin = "", int = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) fin += e.results[i][0].transcript;
        else int += e.results[i][0].transcript;
      }
      setTranscript(fin || int);
      if (fin) { r.stop(); processVoice(fin); }
    };
    r.onerror = () => { setPhase("idle"); setTranscript(""); };
    r.onend = () => { if (phase === "listening") setPhase("idle"); };
    r.start();
    setPhase("listening");
    setTranscript("");
  };

  const stopListening = () => { recogRef.current?.stop(); setPhase("idle"); };

  const processVoice = async (text) => {
    setPhase("thinking");
    const parsed = await askAIWithRetry(text, cartRef.current);
    const { message, actions = [] } = parsed;
    let shouldOrder = false;
    for (const a of actions) {
      if (a.type === "add_to_cart" && a.item) {
        const m = menuNames.find((n) => n.toLowerCase() === a.item.toLowerCase());
        if (m) addItem(m);
      } else if (a.type === "remove_from_cart" && a.item) removeItem(a.item);
      else if (a.type === "show_menu") setIsMenuOpen(true);
      else if (a.type === "open_cart") setIsCartOpen(true);
      else if (a.type === "place_order") shouldOrder = true;
    }
    setReply(message);
    speak(message, () => { if (shouldOrder) setTimeout(() => handleOrder(cartRef.current), 600); });
  };

  const blobClass = phase === "speaking" ? "blob-talk" : phase === "listening" ? "blob-listen" : "blob-float";

  const phaseColor = {
    idle: C.orange,
    listening: "#ef4444",
    thinking: "#f59e0b",
    speaking: "#22c55e",
  }[phase];

  const phaseLabel = { idle: "Ready", listening: "Listening", thinking: "Thinking", speaking: "Speaking" }[phase];

  return (
    <div className="mode-fade" style={{
      minHeight: "100vh", background: C.bg,
      display: "flex", flexDirection: "column",
      position: "relative", overflow: "hidden",
    }}>
      <style>{G}</style>

      {/* Ambient */}
      <div style={{ position: "absolute", top: "-8%", right: "-5%", width: 400, height: 400, borderRadius: "50%", background: `radial-gradient(circle, ${C.orangeDim} 0%, transparent 65%)`, pointerEvents: "none" }} />
      <div style={{ position: "absolute", bottom: "10%", left: "-8%", width: 280, height: 280, borderRadius: "50%", background: "radial-gradient(circle, rgba(232,97,10,0.04) 0%, transparent 70%)", pointerEvents: "none" }} />

      {/* TOP BAR */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "48px 20px 16px", position: "relative", zIndex: 10,
      }}>
        {/* Phase pill — left */}
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "7px 14px", borderRadius: 20,
          background: C.card, border: `1px solid ${C.border}`,
        }}>
          <div className="pdot" style={{ width: 7, height: 7, borderRadius: "50%", background: phaseColor, boxShadow: `0 0 6px ${phaseColor}` }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: C.mutedMid }}>{phaseLabel}</span>
        </div>

        {/* Right controls */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {/* Mode toggle */}
          <ModeToggle mode={mode} onToggle={onToggleMode} />

          {/* Cart */}
          <button onClick={() => setIsCartOpen(true)} style={{
            width: 38, height: 38, borderRadius: 12, border: `1px solid ${C.border}`,
            background: C.card, display: "flex", alignItems: "center", justifyContent: "center",
            position: "relative",
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.mutedMid} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" />
              <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
            </svg>
            {cartCount > 0 && (
              <span style={{
                position: "absolute", top: -3, right: -3, width: 16, height: 16,
                borderRadius: "50%", background: C.orange, border: `2px solid ${C.bg}`,
                fontSize: 9, fontWeight: 700, color: "#fff",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>{cartCount}</span>
            )}
          </button>
        </div>
      </div>

      {/* MAIN AREA */}
      <div style={{
        flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", padding: "0 24px", gap: 36, position: "relative", zIndex: 1,
      }}>
        {/* Nova Identity */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
          <NovaAvatar size={48} />
          <div style={{ textAlign: "center" }}>
            <span className="syne" style={{ color: "#fff", fontSize: 18, fontWeight: 800 }}>Nova</span>
            <span style={{
              marginLeft: 8, fontSize: 10, background: C.orangeDim,
              color: C.orange, border: `1px solid rgba(232,97,10,0.3)`,
              borderRadius: 20, padding: "2px 8px", fontWeight: 600, letterSpacing: 0.5,
            }}>AI WAITER</span>
          </div>
        </div>

        {/* Three pill blobs */}
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "center", gap: 16, height: 180 }}>
          {[
            { w: 52, hI: 88, hL: 108, hT: 118, delay: "0.18s", op: 0.8 },
            { w: 66, hI: 148, hL: 168, hT: 158, delay: "0s", op: 1 },
            { w: 52, hI: 78, hL: 98, hT: 108, delay: "0.28s", op: 0.8 },
          ].map((b, i) => {
            const h = phase === "listening" ? b.hL : phase === "speaking" ? b.hT : b.hI;
            return (
              <div key={i} className={blobClass} style={{
                width: b.w, height: h, borderRadius: b.w / 2,
                background: `linear-gradient(180deg, rgba(232,97,10,${b.op * 0.7}) 0%, rgba(184,77,0,${b.op}) 100%)`,
                boxShadow: i === 1
                  ? (phase === "listening"
                    ? `0 0 60px rgba(239,68,68,0.7), 0 0 120px rgba(239,68,68,0.25)`
                    : phase === "speaking"
                      ? `0 0 60px rgba(34,197,94,0.5), 0 0 100px rgba(34,197,94,0.2)`
                      : `0 0 50px ${C.orangeGlow}, 0 0 90px rgba(232,97,10,0.15)`)
                  : `0 8px 24px rgba(184,77,0,0.3)`,
                animationDelay: b.delay,
                transition: "height 0.45s cubic-bezier(0.34,1.56,0.64,1)",
                filter: i !== 1 ? "blur(0.5px)" : "none",
              }} />
            );
          })}
        </div>

        {/* Text display */}
        <div className="tfade" style={{ width: "100%", maxWidth: 320, textAlign: "center", minHeight: 80, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {phase === "listening" && (
            <p style={{ color: C.mutedMid, fontSize: 18, fontWeight: 300, lineHeight: 1.6 }}>
              {transcript || "Listening..."}
            </p>
          )}
          {phase === "thinking" && (
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {[0, 160, 320].map((d, i) => (
                <div key={i} className="dot" style={{ width: 10, height: 10, borderRadius: "50%", background: C.orange, animationDelay: `${d}ms` }} />
              ))}
            </div>
          )}
          {(phase === "speaking" || phase === "idle") && reply && (
            <p style={{ color: C.text, fontSize: 15.5, fontWeight: 400, lineHeight: 1.7 }}>{reply}</p>
          )}
        </div>

        {/* Cart pill */}
        {cartCount > 0 && (
          <button onClick={() => setIsCartOpen(true)} className="scale-in" style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "10px 18px", borderRadius: 20,
            background: C.card, border: `1px solid rgba(232,97,10,0.3)`,
            boxShadow: `0 4px 20px rgba(232,97,10,0.15)`,
          }}>
            <span style={{
              width: 20, height: 20, borderRadius: "50%", background: C.orange,
              fontSize: 10, fontWeight: 700, color: "#fff",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>{cartCount}</span>
            <span style={{ fontSize: 13.5, fontWeight: 600, color: C.text }}>
              {cartCount} item{cartCount > 1 ? "s" : ""} · ₹{cartTotal}
            </span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        )}
      </div>

      {/* BOTTOM BAR */}
      <div style={{ padding: "16px 24px 44px", position: "relative", zIndex: 10 }}>
        {/* Waveform */}
        {phase === "listening" && (
          <div style={{ display: "flex", justifyContent: "center", alignItems: "flex-end", gap: 2.5, marginBottom: 20, height: 24 }}>
            {Array.from({ length: 28 }).map((_, i) => (
              <div key={i} className="wv" style={{
                width: 2.5, borderRadius: 2, background: C.orange, opacity: 0.7,
                animationDelay: `${i * 32}ms`, animationDuration: `${0.45 + (i % 5) * 0.09}s`,
              }} />
            ))}
          </div>
        )}

        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 32 }}>
          {/* Left: Cancel / Menu */}
          {phase === "listening" ? (
            <button onClick={stopListening} style={{
              width: 48, height: 48, borderRadius: "50%",
              background: C.card, border: `1px solid ${C.border}`,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.mutedMid} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          ) : (
            <button onClick={() => setIsMenuOpen(true)} style={{
              width: 48, height: 48, borderRadius: "50%",
              background: C.card, border: `1px solid ${C.border}`,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.mutedMid} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
          )}

          {/* MAIN ORB MIC */}
          <button
            onClick={phase === "listening" ? stopListening : startListening}
            disabled={phase === "thinking" || phase === "speaking"}
            style={{
              width: 84, height: 84, borderRadius: "50%",
              background: phase === "listening"
                ? "linear-gradient(135deg, #ef4444, #b91c1c)"
                : `linear-gradient(135deg, ${C.orange}, #b84d00)`,
              boxShadow: phase === "listening"
                ? "0 0 0 0 rgba(239,68,68,0.5), 0 12px 40px rgba(239,68,68,0.5)"
                : `0 12px 40px ${C.orangeGlow}`,
              border: "none",
              display: "flex", alignItems: "center", justifyContent: "center",
              animation: phase === "listening" ? "pulse 1.3s ease-in-out infinite" : "none",
            }}>
            {phase === "thinking" ? (
              <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                {[0, 120, 240].map((d, i) => (
                  <div key={i} className="dot" style={{ width: 5, height: 16, borderRadius: 3, background: "#fff", animationDelay: `${d}ms` }} />
                ))}
              </div>
            ) : phase === "listening" ? (
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" />
              </svg>
            ) : (
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" />
              </svg>
            )}
          </button>

          {/* Right: Confirm */}
          {cartCount > 0 ? (
            <button onClick={() => handleOrder(cart)} style={{
              width: 48, height: 48, borderRadius: "50%",
              background: `linear-gradient(135deg, ${C.orange}, #b84d00)`,
              boxShadow: `0 6px 20px ${C.orangeGlow}`,
              border: "none",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </button>
          ) : <div style={{ width: 48 }} />}
        </div>

        <p style={{ textAlign: "center", fontSize: 12, color: C.muted, marginTop: 18 }}>
          {phase === "idle" ? "Tap the orb to speak your order"
            : phase === "listening" ? "Listening — speak clearly..."
              : phase === "thinking" ? "Processing your order..."
                : "Nova is responding..."}
        </p>
      </div>

      <CartModal cart={cart} cartCount={cartCount} cartTotal={cartTotal} menuItems={menuItems}
        addItem={addItem} removeItem={removeItem} handleOrder={() => handleOrder(cart)}
        isOpen={isCartOpen} onClose={() => setIsCartOpen(false)} />
      <MenuModal menuGrouped={menuGrouped} menuItems={menuItems}
        cart={cart} cartCount={cartCount} cartTotal={cartTotal}
        addItem={addItem} removeItem={removeItem} isOpen={isMenuOpen}
        onClose={() => setIsMenuOpen(false)} setIsCartOpen={setIsCartOpen} />
      <Toast item={toastItem} />
    </div>
  );
}

// ════════════════════════════════════════════════════════
// CHAT MODE
// ════════════════════════════════════════════════════════
function ChatMode({
  user, menuItems, menuNames, menuGrouped,
  cart, cartCount, cartTotal, addItem, removeItem, handleOrder,
  isCartOpen, setIsCartOpen, isMenuOpen, setIsMenuOpen, toastItem,
  initSession, askAIWithRetry, onToggleMode, currentTableId, mode,
}) {
  const name = user?.name?.split(" ")[0] || "there";
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [interim, setInterim] = useState("");
  const chatEndRef = useRef(null);
  const recogRef = useRef(null);
  const hasSpeech = "SpeechRecognition" in window || "webkitSpeechRecognition" in window;
  const cartRef = useRef(cart);
  useEffect(() => { cartRef.current = cart; }, [cart]);

  useEffect(() => {
    initSession(0);
    const hour = new Date().getHours();
    const g = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
    setMessages([
      { from: "bot", text: `${g}, ${name}! Welcome to SmartDine 🍽️` },
      { from: "bot", text: "I'm Nova, your AI dining companion. What are you in the mood for today?", suggestions: ["🔥 Something spicy", "🥗 Light & healthy", "🍽️ Chef's pick", "📋 Full menu"] },
    ]);
  }, []);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);

  const sendMsg = async (text) => {
    if (!text.trim()) return;
    setMessages((p) => [...p, { from: "user", text: text.trim() }]);
    setLoading(true);
    setInput("");
    const parsed = await askAIWithRetry(text.trim(), cartRef.current);
    const { message, actions = [], suggestions = [] } = parsed;
    let choices = [];
    for (const a of actions) {
      if (a.type === "add_to_cart" && a.item) {
        const m = menuNames.find((n) => n.toLowerCase() === a.item.toLowerCase());
        if (m) addItem(m);
      } else if (a.type === "remove_from_cart" && a.item) removeItem(a.item);
      else if (a.type === "show_menu") setIsMenuOpen(true);
      else if (a.type === "place_order") handleOrder(cartRef.current);
      else if (a.type === "open_cart") setIsCartOpen(true);
      else if (a.type === "ask_choice" && Array.isArray(a.options)) choices = a.options;
    }
    setMessages((p) => [...p, {
      from: "bot", text: message,
      suggestions: suggestions.length ? suggestions : null,
      choices: choices.length ? choices : null,
    }]);
    setLoading(false);
  };

  const handleChip = (chip) => {
    const l = chip.toLowerCase();
    if (l.includes("full menu") || l.includes("show menu")) {
      setMessages((p) => [...p, { from: "user", text: chip }]);
      setIsMenuOpen(true);
      setMessages((p) => [...p, { from: "bot", text: "Here's everything on our menu! Add what you like 👨‍🍳", suggestions: ["🛒 My cart", "🍽️ Suggest pairing"] }]);
      return;
    }
    if (l.includes("my cart") || l.includes("view cart")) { setIsCartOpen(true); return; }
    const isItem = menuNames.some((n) => n.toLowerCase() === chip.toLowerCase());
    if (isItem) { addItem(chip); sendMsg(`I'll have the ${chip}`); return; }
    sendMsg(chip);
  };

  const toggleMic = () => {
    if (!hasSpeech) return;
    if (isListening) { recogRef.current?.stop(); setIsListening(false); return; }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const r = new SR();
    r.continuous = false; r.interimResults = true; r.lang = "en-US";
    recogRef.current = r;
    r.onresult = (e) => {
      let fin = "", int = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) fin += e.results[i][0].transcript;
        else int += e.results[i][0].transcript;
      }
      if (fin) { setInterim(""); setIsListening(false); sendMsg(fin); }
      else setInterim(int);
    };
    r.onerror = r.onend = () => { setIsListening(false); setInterim(""); };
    r.start(); setIsListening(true); setInterim("");
  };

  return (
    <div className="mode-fade" style={{
      height: "100vh", background: C.bg,
      display: "flex", flexDirection: "column",
      position: "relative", overflow: "hidden",
    }}>
      <style>{G}</style>

      {/* Ambient */}
      <div style={{ position: "absolute", top: "-10%", right: "-8%", width: 350, height: 350, borderRadius: "50%", background: `radial-gradient(circle, ${C.orangeDim} 0%, transparent 65%)`, pointerEvents: "none", zIndex: 0 }} />

      {/* HEADER */}
      <header style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "48px 20px 14px",
        background: `rgba(11,14,23,0.9)`,
        backdropFilter: "blur(20px)",
        borderBottom: `1px solid ${C.border}`,
        position: "sticky", top: 0, zIndex: 20,
      }}>
        {/* Left: Nova identity */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <NovaAvatar size={34} />
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span className="syne" style={{ color: "#fff", fontSize: 14, fontWeight: 800, lineHeight: 1 }}>Nova</span>
              <span style={{
                fontSize: 9, background: C.orangeDim, color: C.orange,
                border: `1px solid rgba(232,97,10,0.3)`,
                borderRadius: 20, padding: "1px 7px", fontWeight: 600, letterSpacing: 0.5,
              }}>AI</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 2 }}>
              <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#22c55e", boxShadow: "0 0 5px rgba(34,197,94,0.7)" }} />
              <span style={{ fontSize: 10.5, color: C.muted }}>Table {currentTableId}</span>
            </div>
          </div>
        </div>

        {/* Right controls */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {/* Mode toggle */}
          <ModeToggle mode={mode} onToggle={onToggleMode} />

          {/* Menu */}
          <button onClick={() => setIsMenuOpen(true)} style={{
            width: 36, height: 36, borderRadius: 10, border: `1px solid ${C.border}`,
            background: C.card, display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={C.mutedMid} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>

          {/* Cart */}
          <button onClick={() => setIsCartOpen(true)} style={{
            width: 36, height: 36, borderRadius: 10, border: `1px solid ${C.border}`,
            background: C.card, display: "flex", alignItems: "center", justifyContent: "center",
            position: "relative",
          }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={C.mutedMid} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" />
              <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
            </svg>
            {cartCount > 0 && (
              <span style={{
                position: "absolute", top: -3, right: -3, width: 15, height: 15,
                borderRadius: "50%", background: C.orange, border: `2px solid ${C.bg}`,
                fontSize: 8, fontWeight: 700, color: "#fff",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>{cartCount}</span>
            )}
          </button>
        </div>
      </header>

      {/* MESSAGES */}
      <main className="no-sb" style={{
        flex: 1, overflowY: "auto",
        padding: "20px 16px 120px",
        display: "flex", flexDirection: "column", gap: 16,
        position: "relative", zIndex: 1,
      }}>
        {/* Date divider */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "4px 0 8px" }}>
          <div style={{ flex: 1, height: 1, background: C.border }} />
          <span style={{ fontSize: 10.5, color: C.muted, whiteSpace: "nowrap" }}>Today · Table {currentTableId}</span>
          <div style={{ flex: 1, height: 1, background: C.border }} />
        </div>

        {messages.map((msg, i) => (
          <div key={i} className="msg-in" style={{
            display: "flex", gap: 10,
            flexDirection: msg.from === "user" ? "row-reverse" : "row",
            alignItems: "flex-start",
          }}>
            {msg.from === "bot" && <NovaAvatar size={32} />}
            <div style={{ maxWidth: "75%", display: "flex", flexDirection: "column", alignItems: msg.from === "user" ? "flex-end" : "flex-start", gap: 8 }}>
              {/* Bubble */}
              <div style={{
                padding: "11px 15px", fontSize: 14, lineHeight: 1.65,
                borderRadius: msg.from === "user" ? "16px 4px 16px 16px" : "4px 16px 16px 16px",
                background: msg.from === "user"
                  ? `linear-gradient(135deg, ${C.orange}, #b84d00)`
                  : C.card,
                border: msg.from === "user" ? "none" : `1px solid ${C.border}`,
                color: msg.from === "user" ? "#fff" : C.text,
                boxShadow: msg.from === "user" ? `0 4px 20px ${C.orangeGlow}` : "none",
              }}>{msg.text}</div>

              {/* Suggestion chips */}
              {msg.suggestions && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                  {msg.suggestions.map((c, idx) => (
                    <button key={idx} onClick={() => handleChip(c)} className="chip-in"
                      style={{
                        animationDelay: `${idx * 55}ms`, opacity: 0,
                        padding: "6px 13px", borderRadius: 20, fontSize: 12.5, fontWeight: 500,
                        background: "transparent", border: `1px solid ${C.border}`, color: C.mutedMid,
                        transition: "all 0.2s",
                      }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(232,97,10,0.5)"; e.currentTarget.style.color = C.orange; e.currentTarget.style.background = C.orangeDim; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.mutedMid; e.currentTarget.style.background = "transparent"; }}
                    >{c}</button>
                  ))}
                </div>
              )}

              {/* Choice cards */}
              {msg.choices && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%" }}>
                  {msg.choices.map((c, idx) => (
                    <button key={idx} onClick={() => handleChip(c)} className="chip-in"
                      style={{
                        animationDelay: `${idx * 75}ms`, opacity: 0,
                        padding: "12px 14px", borderRadius: 14,
                        background: C.card, border: `1px solid ${C.border}`,
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        transition: "all 0.2s",
                      }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(232,97,10,0.4)"; e.currentTarget.style.background = C.orangeDim; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.background = C.card; }}
                    >
                      <span style={{ fontSize: 13.5, fontWeight: 500, color: C.text }}>{c}</span>
                      <div style={{
                        width: 22, height: 22, borderRadius: 8, flexShrink: 0,
                        background: C.orangeDim,
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={C.orange} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                        </svg>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Loading dots */}
        {loading && (
          <div className="msg-in" style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <NovaAvatar size={32} />
            <div style={{
              padding: "14px 18px", borderRadius: "4px 16px 16px 16px",
              background: C.card, border: `1px solid ${C.border}`,
              display: "flex", alignItems: "flex-end", gap: 5,
            }}>
              {[0, 180, 360].map((d, i) => (
                <div key={i} className="dot" style={{ width: 4, height: 16, borderRadius: 3, background: C.orange, opacity: 0.8, animationDelay: `${d}ms` }} />
              ))}
            </div>
          </div>
        )}

        {/* Mic interim */}
        {isListening && (
          <div className="msg-in" style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <div style={{
              width: 32, height: 32, borderRadius: "50%", background: "#ef4444",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              </svg>
            </div>
            <div style={{
              padding: "10px 14px", borderRadius: "4px 16px 16px 16px",
              background: C.card, border: "1px solid rgba(239,68,68,0.3)",
              display: "flex", alignItems: "center", gap: 10,
            }}>
              <span style={{ fontSize: 13.5, color: C.text }}>{interim || "Listening..."}</span>
              <div style={{ display: "flex", gap: 2.5, alignItems: "flex-end", height: 16 }}>
                {[12, 16, 10, 14].map((h, i) => (
                  <div key={i} className="wv" style={{ width: 2.5, height: h, borderRadius: 2, background: "#ef4444", animationDelay: `${i * 80}ms` }} />
                ))}
              </div>
            </div>
          </div>
        )}

        <div ref={chatEndRef} />
      </main>

      {/* INPUT BAR */}
      <footer style={{
        position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 20,
        background: `linear-gradient(to top, ${C.bg} 55%, transparent)`,
        padding: "24px 16px 28px",
      }}>
        {/* Quick category pills */}
        <div className="no-sb" style={{ display: "flex", gap: 8, overflowX: "auto", marginBottom: 10, paddingBottom: 4 }}>
          {["🍜 Starters", "🥩 Mains", "🍰 Desserts", "🥤 Drinks", "🧾 My Order"].map((q, i) => (
            <button key={i} onClick={() => handleChip(q)} style={{
              whiteSpace: "nowrap", padding: "5px 13px", borderRadius: 20,
              background: "transparent", border: `1px solid ${C.border}`,
              color: C.muted, fontSize: 12, flexShrink: 0, transition: "all 0.2s",
            }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(232,97,10,0.5)"; e.currentTarget.style.color = C.orange; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.muted; }}
            >{q}</button>
          ))}
        </div>

        {/* Text input row */}
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          background: C.card, border: `1px solid ${C.border}`,
          borderRadius: 22, padding: "6px 8px 6px 14px",
          boxShadow: "0 -4px 40px rgba(0,0,0,0.5)",
        }}>
          {hasSpeech && (
            <button onClick={toggleMic} className={isListening ? "mic-active" : ""} style={{
              width: 38, height: 38, borderRadius: 12, flexShrink: 0, border: "none",
              background: isListening ? "#ef4444" : "transparent",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={isListening ? "#fff" : C.muted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" />
              </svg>
            </button>
          )}
          <input
            value={isListening ? interim : input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && sendMsg(input)}
            placeholder={isListening ? "Listening..." : "Type your order..."}
            disabled={isListening}
            autoFocus
            style={{
              flex: 1, background: "transparent", border: "none", outline: "none",
              color: C.text, fontSize: 14, padding: "8px 4px",
              caretColor: C.orange,
            }}
          />
          <button onClick={() => sendMsg(input)} disabled={!input.trim() || loading} style={{
            width: 40, height: 40, borderRadius: 16, flexShrink: 0, border: "none",
            background: input.trim() && !loading
              ? `linear-gradient(135deg, ${C.orange}, #b84d00)`
              : "rgba(255,255,255,0.04)",
            boxShadow: input.trim() && !loading ? `0 4px 16px ${C.orangeGlow}` : "none",
            display: "flex", alignItems: "center", justifyContent: "center",
            transition: "all 0.2s",
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill={input.trim() && !loading ? "#fff" : C.muted}>
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
            </svg>
          </button>
        </div>
      </footer>

      <CartModal cart={cart} cartCount={cartCount} cartTotal={cartTotal} menuItems={menuItems}
        addItem={addItem} removeItem={removeItem} handleOrder={() => handleOrder(cartRef.current)}
        isOpen={isCartOpen} onClose={() => setIsCartOpen(false)} />
      <MenuModal menuGrouped={menuGrouped} menuItems={menuItems}
        cart={cart} cartCount={cartCount} cartTotal={cartTotal}
        addItem={addItem} removeItem={removeItem} isOpen={isMenuOpen}
        onClose={() => setIsMenuOpen(false)} setIsCartOpen={setIsCartOpen} />
      <Toast item={toastItem} />
    </div>
  );
}

// ════════════════════════════════════════════════════════
// CART MODAL
// ════════════════════════════════════════════════════════
function CartModal({ cart, cartCount, cartTotal, menuItems, addItem, removeItem, handleOrder, isOpen, onClose }) {
  if (!isOpen) return null;
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", justifyContent: "flex-end" }}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(10px)" }} onClick={onClose} />
      <div className="msg-in" style={{
        position: "relative", width: "100%", maxWidth: 380, height: "100%",
        background: C.card, borderLeft: `1px solid ${C.border}`,
        display: "flex", flexDirection: "column",
        boxShadow: "-8px 0 60px rgba(0,0,0,0.6)",
      }}>
        <div style={{ height: 2, background: `linear-gradient(90deg, transparent, ${C.orange}, transparent)` }} />

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 20px 16px", borderBottom: `1px solid ${C.border}` }}>
          <div>
            <h2 className="syne" style={{ color: "#fff", fontSize: 18, fontWeight: 800 }}>Your Order</h2>
            <p style={{ color: C.muted, fontSize: 11.5, marginTop: 2 }}>{cartCount} item{cartCount !== 1 ? "s" : ""}</p>
          </div>
          <button onClick={onClose} style={{
            width: 36, height: 36, borderRadius: 10, border: `1px solid ${C.border}`,
            background: C.bg, display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.mutedMid} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="no-sb" style={{ flex: 1, overflowY: "auto", padding: "12px 20px" }}>
          {cart.length === 0 ? (
            <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, textAlign: "center" }}>
              <div style={{ width: 56, height: 56, borderRadius: 18, background: C.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={C.border} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" />
                  <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
                </svg>
              </div>
              <p style={{ color: C.muted, fontSize: 13 }}>Your cart is empty</p>
            </div>
          ) : (
            <div style={{ borderTop: `1px solid ${C.border}` }}>
              {cart.map((item, i) => {
                const mi = menuItems.find((m) => m.name === item.name);
                const price = mi?.price || 150;
                return (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 0", borderBottom: `1px solid ${C.border}` }}>
                    <div>
                      <p style={{ color: C.text, fontSize: 13.5, fontWeight: 500 }}>{item.name}</p>
                      <p style={{ color: C.muted, fontSize: 11.5, marginTop: 2 }}>₹{price} each</p>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <span style={{ color: C.text, fontSize: 14, fontWeight: 700 }}>₹{item.qty * price}</span>
                      <div style={{ display: "flex", alignItems: "center", borderRadius: 20, overflow: "hidden", border: `1px solid ${C.border}`, background: C.bg }}>
                        <button onClick={() => removeItem(item.name)} style={{ width: 28, height: 28, border: "none", background: "transparent", color: C.mutedMid, fontSize: 16, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>−</button>
                        <span style={{ width: 26, textAlign: "center", fontSize: 12.5, fontWeight: 700, color: C.text }}>{item.qty}</span>
                        <button onClick={() => addItem(item.name)} style={{ width: 28, height: 28, border: "none", background: C.orange, color: "#fff", fontSize: 16, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>+</button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div style={{ padding: "16px 20px 28px", borderTop: `1px solid ${C.border}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 16 }}>
            <span style={{ color: C.muted, fontSize: 13 }}>Total</span>
            <span className="syne" style={{ color: "#fff", fontSize: 26, fontWeight: 800 }}>₹{cartTotal}</span>
          </div>
          <button onClick={handleOrder} disabled={cart.length === 0} style={{
            width: "100%", padding: "14px", borderRadius: 14, border: "none",
            background: `linear-gradient(135deg, ${C.orange}, #b84d00)`,
            color: "#fff", fontSize: 14.5, fontWeight: 700,
            boxShadow: `0 6px 24px ${C.orangeGlow}`,
            letterSpacing: 0.3,
          }}>Confirm Order →</button>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════
// MENU MODAL
// ════════════════════════════════════════════════════════
function MenuModal({ menuGrouped, menuItems, cart, cartCount, cartTotal, addItem, removeItem, isOpen, onClose, setIsCartOpen }) {
  if (!isOpen) return null;
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", justifyContent: "flex-end" }}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(10px)" }} onClick={onClose} />
      <div className="msg-in" style={{
        position: "relative", width: "100%", maxWidth: 380, height: "100%",
        background: C.card, borderLeft: `1px solid ${C.border}`,
        display: "flex", flexDirection: "column",
        boxShadow: "-8px 0 60px rgba(0,0,0,0.6)",
      }} onClick={e => e.stopPropagation()}>
        <div style={{ height: 2, background: `linear-gradient(90deg, transparent, ${C.orange}, transparent)` }} />

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 20px 16px", borderBottom: `1px solid ${C.border}` }}>
          <div>
            <h2 className="syne" style={{ color: "#fff", fontSize: 18, fontWeight: 800 }}>Our Menu</h2>
            <p style={{ color: C.muted, fontSize: 11.5, marginTop: 2 }}>{menuItems.length} items</p>
          </div>
          <button onClick={onClose} style={{
            width: 36, height: 36, borderRadius: 10, border: `1px solid ${C.border}`,
            background: C.bg, display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.mutedMid} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="no-sb" style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
          {Object.entries(menuGrouped).map(([cat, items]) =>
            items.length > 0 ? (
              <div key={cat} style={{ marginBottom: 28 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                  <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: C.orange }}>{cat}</span>
                  <div style={{ flex: 1, height: 1, background: C.border }} />
                </div>
                {items.map((item, idx) => {
                  const ci = cart.find((c) => c.name === item.name);
                  const qty = ci?.qty || 0;
                  return (
                    <div key={idx} style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      padding: "10px 0", borderBottom: `1px solid ${C.border}`,
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div>
                          <p style={{ color: C.text, fontSize: 13.5, fontWeight: 500 }}>{item.name}</p>
                          <p style={{ color: C.muted, fontSize: 11.5, marginTop: 2 }}>₹{item.price || 150}</p>
                        </div>
                        {qty > 0 && (
                          <span style={{
                            width: 18, height: 18, borderRadius: "50%", background: C.orange,
                            fontSize: 9, fontWeight: 700, color: "#fff",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            marginLeft: 4,
                          }}>×{qty}</span>
                        )}
                      </div>
                      {qty > 0 ? (
                        <div style={{ display: "flex", alignItems: "center", border: `1px solid ${C.border}`, borderRadius: 20, overflow: "hidden", background: C.bg }}>
                          <button onClick={() => removeItem(item.name)} style={{ width: 28, height: 28, border: "none", background: "transparent", color: C.mutedMid, fontSize: 16, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>−</button>
                          <span style={{ width: 26, textAlign: "center", fontSize: 12.5, fontWeight: 700, color: C.text }}>{qty}</span>
                          <button onClick={() => addItem(item.name)} style={{ width: 28, height: 28, border: "none", background: C.orange, color: "#fff", fontSize: 16, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>+</button>
                        </div>
                      ) : (
                        <button onClick={() => addItem(item.name)} style={{
                          padding: "6px 14px", borderRadius: 20, border: `1px solid ${C.border}`,
                          background: "transparent", color: C.mutedMid, fontSize: 12, fontWeight: 600,
                          transition: "all 0.2s",
                        }}
                          onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(232,97,10,0.5)"; e.currentTarget.style.color = C.orange; e.currentTarget.style.background = C.orangeDim; }}
                          onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.mutedMid; e.currentTarget.style.background = "transparent"; }}
                        >ADD</button>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : null
          )}
        </div>

        {cartCount > 0 ? (
          <div style={{ padding: "16px 20px 28px", borderTop: `1px solid ${C.border}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 16 }}>
              <span style={{ color: C.muted, fontSize: 13 }}>Current total</span>
              <span className="syne" style={{ color: "#fff", fontSize: 26, fontWeight: 800 }}>₹{cartTotal}</span>
            </div>
            <button onClick={() => { onClose(); setIsCartOpen(true); }} style={{
              width: "100%", padding: "14px", borderRadius: 14, border: "none",
              background: `linear-gradient(135deg, ${C.orange}, #b84d00)`,
              color: "#fff", fontSize: 14.5, fontWeight: 700,
              boxShadow: `0 6px 24px ${C.orangeGlow}`,
              letterSpacing: 0.3,
            }}>View Cart ({cartCount}) →</button>
          </div>
        ) : (
          <div style={{ padding: "16px 20px 28px", borderTop: `1px solid ${C.border}` }}>
            <p style={{ textAlign: "center", color: C.muted, fontSize: 13 }}>Add items to view cart</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════
// TOAST
// ════════════════════════════════════════════════════════
function Toast({ item }) {
  if (!item) return null;
  return (
    <div style={{ position: "fixed", bottom: 140, left: 0, right: 0, display: "flex", justifyContent: "center", zIndex: 60, pointerEvents: "none" }}>
      <div className="toast-up" style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "10px 18px", borderRadius: 20,
        background: C.card, border: `1px solid rgba(232,97,10,0.35)`,
        boxShadow: `0 6px 30px rgba(0,0,0,0.4), 0 0 0 1px rgba(232,97,10,0.1)`,
      }}>
        <div style={{
          width: 20, height: 20, borderRadius: "50%", background: C.orange,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <span style={{ fontSize: 13.5, color: C.text }}>
          <span style={{ color: C.orange, fontWeight: 700 }}>{item}</span> added to cart
        </span>
      </div>
    </div>
  );
}

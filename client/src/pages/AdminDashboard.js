import React, { useEffect, useMemo, useRef, useState } from "react";
import { GoogleGenerativeAI } from "@google/generative-ai";
import API from "../api";
import AdminSidebar from "../components/AdminSidebar";
import LogoutButton from "../components/LogoutButton";
import { Card, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { sendCouponEmail } from "../email";
import html2canvas from "html2canvas";
import "./AdminDashboard.css";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Calendar, CalendarDays, Download, IndianRupee, Mail, MessageCircle, Moon, Phone, Search, Send, Sun, UserPlus, X, ClipboardList, TrendingUp, Users } from "lucide-react";

const COLORS = {
  blue: "#4a8cff",
  green: "#20c997",
  cyan: "#21c1d9",
  violet: "#8d5cf6",
  amber: "#f59e0b",
  red: "#f35f72",
  textMuted: "#8aa0c8",
  grid: "rgba(255,255,255,0.04)",
};

const META = {
  overview: { title: "Overview", sub: "Your restaurant at a glance" },
  analytics: { title: "Sales Analytics", sub: "Revenue, customers and performance metrics" },
  staff: { title: "Manage Staff", sub: "View, pay and manage your team" },
  dish: { title: "Add Dish", sub: "Manage your menu offerings" },
  requests: { title: "Requests", sub: "Review and take action on pending requests" },
  users: { title: "Users & Coupons", sub: "Understand and reward your customers" },
};

const CATEGORY_COLORS = {
  Starters: COLORS.blue,
  Mains: COLORS.green,
  Beverages: COLORS.cyan,
  Desserts: COLORS.violet,
};

const GEMINI_MODEL_CHAIN = ["models/gemini-3.1-flash-lite-preview", "gemini-2.5-flash", "gemini-2.0-flash"];

function currency(value) {
  return `₹${Number(value || 0).toLocaleString("en-IN")}`;
}

function delta(value) {
  const n = Number(value || 0);
  return { text: `${n >= 0 ? "▲" : "▼"} ${Math.abs(n).toFixed(1)}%`, up: n >= 0 };
}

function shortDate(value) {
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime())
    ? "Apr 17"
    : date.toLocaleDateString("en-IN", { month: "short", day: "numeric" });
}

function toInputDate(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function TooltipCard({ active, payload, label, money = false }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="sd-chart-tooltip">
      <div className="sd-chart-tooltip__label">{label}</div>
      {payload.map((item) => (
        <div key={item.dataKey || item.name} className="sd-chart-tooltip__row">
          <span>{item.name || item.dataKey}</span>
          <strong>{money ? currency(item.value) : item.value}</strong>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ icon, title, subtitle }) {
  return (
    <Card className="sd-empty-card">
      <CardContent className="sd-empty-card__body">
        <div className="sd-empty-card__icon">{icon}</div>
        <h3>{title}</h3>
        <p>{subtitle}</p>
      </CardContent>
    </Card>
  );
}

function MetricRing({ value, label, color }) {
  const percent = Math.max(0, Math.min(100, (Number(value || 0) / 5) * 100));
  return (
    <div className="sd-ring">
      <div className="sd-ring__chart" style={{ background: `conic-gradient(${color} ${percent}%, rgba(255,255,255,0.08) ${percent}% 100%)` }}>
        <div className="sd-ring__inner" />
      </div>
      <strong style={{ color }}>{Number(value || 0).toFixed(1)}</strong>
      <span>{label}</span>
    </div>
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractJsonText(raw) {
  const text = String(raw || "").trim();
  if (!text) return "";

  const fencedMatch = text.match(/```json\s*([\s\S]*?)```/i) || text.match(/```\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) return fencedMatch[1].trim();

  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    return text.slice(firstBrace, lastBrace + 1).trim();
  }

  return text;
}

function buildAdminInsightContext(dashboard) {
  const kpis = dashboard?.overview?.kpis || {};
  const charts = dashboard?.charts || {};
  const requests = dashboard?.requests || {};
  const staff = dashboard?.staff || {};

  return {
    range: dashboard?.selectedRange?.label || "Selected range",
    revenue: Number(kpis.totalRevenue?.value || 0),
    revenueDelta: Number(kpis.totalRevenue?.deltaVsPreviousPeriod || 0),
    orders: Number(kpis.totalOrders?.value || 0),
    ordersDelta: Number(kpis.totalOrders?.deltaVsPreviousPeriod || 0),
    avgOrderValue: Number(kpis.avgOrderValue?.value || 0),
    avgOrderValueDelta: Number(kpis.avgOrderValue?.deltaVsPreviousPeriod || 0),
    uniqueCustomers: Number(kpis.uniqueCustomers?.value || 0),
    uniqueCustomersDelta: Number(kpis.uniqueCustomers?.deltaVsPreviousPeriod || 0),
    repeatRate: Number(dashboard?.overview?.extra?.repeatRate || 0),
    completionRate: Number(dashboard?.overview?.extra?.completionRate || 0),
    occupancyRate: Number(dashboard?.overview?.extra?.tableOccupancyRate || 0),
    topDay: dashboard?.overview?.extra?.topDay || null,
    topHour: dashboard?.overview?.extra?.topHour || null,
    revenueSeries: (charts.revenueSeries || []).slice(-8),
    orderSeries: (charts.orderSeries || []).slice(-8),
    hourlyOrders: charts.hourlyOrders || [],
    bestSellingItems: (charts.bestSellingItems || []).slice(0, 5),
    categoryPerformance: charts.categoryPerformance || [],
    customerSplit: charts.customerSplit || [],
    statusDistribution: charts.statusDistribution || [],
    spendBuckets: charts.spendBuckets || [],
    topCustomers: (charts.topCustomers || []).slice(0, 5),
    tableUsage: (charts.tableUsage || []).slice(0, 8),
    revenueByDayOfWeek: charts.revenueByDayOfWeek || [],
    topUpsellOpportunities: (charts.topUpsellOpportunities || []).slice(0, 5),
    pendingRequests: Number(requests.pendingCount || 0),
    requestPreview: (requests.items || []).slice(0, 5).map((item) => ({
      type: item.type,
      category: item.category,
      status: item.status,
      tableNo: item.tableNo,
    })),
    staffSummary: {
      waiters: Array.isArray(staff.waiters) ? staff.waiters.length : 0,
      cooks: Array.isArray(staff.cooks) ? staff.cooks.length : 0,
    },
  };
}

export default function AdminDashboard() {
  const genAIRef = useRef(null);
  const modelIdxRef = useRef(0);
  const [activePanel, setActivePanel] = useState("overview");
  const [overviewTab, setOverviewTab] = useState("overview");
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [insights, setInsights] = useState(null);
  const [insightLoading, setInsightLoading] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatQuestion, setChatQuestion] = useState("");
  const [chatMessages, setChatMessages] = useState([]);
  const [chatPrompts, setChatPrompts] = useState([
    "What stands out in this range?",
    "Which hours are busiest?",
    "How can we improve repeat visits?",
  ]);
  const [staffTab, setStaffTab] = useState("waiters");
  const [staffSearch, setStaffSearch] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [userSegment, setUserSegment] = useState("all");
  const [addStaffOpen, setAddStaffOpen] = useState(false);
  const [payModal, setPayModal] = useState({ open: false, staff: null });
  const [couponModal, setCouponModal] = useState({ open: false, users: [], title: "" });
  const [staffForm, setStaffForm] = useState({ name: "", phone: "", email: "", role: "waiter", password: "", salary: "", employmentStatus: "active" });
  const [dishForm, setDishForm] = useState({ name: "", price: "", category: "starters", description: "" });
  const [payForm, setPayForm] = useState({ amount: "", month: "", method: "Cash", note: "" });
  const [couponForm, setCouponForm] = useState({
    title: "Special Offer Just For You",
    code: "",
    discountType: "percent",
    discountValue: 20,
    minOrderValue: 500,
    expiresAt: "",
    message: "Thank you for dining with us. Enjoy this exclusive offer at SmartDine!",
  });
  const [busy, setBusy] = useState({ staff: false, dish: false, pay: false, coupon: false });

  const [timeRange, setTimeRange] = useState("7_days");
  const [customRangeDraft, setCustomRangeDraft] = useState(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 6);
    return { startDate: toInputDate(start), endDate: toInputDate(end) };
  });
  const [appliedRange, setAppliedRange] = useState(null);
  const [orderSearch, setOrderSearch] = useState("");
  const [menuItems, setMenuItems] = useState([]);
  const [menuLoading, setMenuLoading] = useState(false);
  const [menuTab, setMenuTab] = useState("starters");
  const [theme, setTheme] = useState(() => localStorage.getItem("sd-theme") || "dark");
  const toggleTheme = () => setTheme(prev => {
    const next = prev === "dark" ? "light" : "dark";
    localStorage.setItem("sd-theme", next);
    return next;
  });
  const [isRefreshing, setIsRefreshing] = useState(false);

  const geminiEnabled = Boolean(process.env.REACT_APP_GEMINI_API_KEY);

  const buildRangeParams = (override = {}) => {
    const nextTimeRange = override.timeRange || timeRange;
    const nextAppliedRange = override.appliedRange !== undefined ? override.appliedRange : appliedRange;
    if (nextTimeRange === "custom" && nextAppliedRange?.startDate && nextAppliedRange?.endDate) {
      return {
        timeRange: "custom",
        startDate: nextAppliedRange.startDate,
        endDate: nextAppliedRange.endDate,
      };
    }
    return { timeRange: nextTimeRange };
  };

  const generateAdminGeminiJson = async (prompt) => {
    if (!geminiEnabled) return null;

    if (!genAIRef.current) {
      genAIRef.current = new GoogleGenerativeAI(process.env.REACT_APP_GEMINI_API_KEY);
    }

    for (let attempt = 0; attempt < 7; attempt += 1) {
      try {
        const modelName = GEMINI_MODEL_CHAIN[Math.min(modelIdxRef.current, GEMINI_MODEL_CHAIN.length - 1)];
        const model = genAIRef.current.getGenerativeModel({
          model: modelName,
          generationConfig: { temperature: 0.4, maxOutputTokens: 900 },
        });
        const result = await model.generateContent(prompt);
        const raw = result?.response?.text?.()?.trim() || "";
        const cleaned = extractJsonText(raw);
        if (cleaned) return JSON.parse(cleaned);
      } catch (err) {
        const message = String(err?.message || "");
        const is429 = message.includes("429");
        const is404 = message.includes("404");

        if (is404) {
          const next = modelIdxRef.current + 1;
          if (next < GEMINI_MODEL_CHAIN.length) {
            modelIdxRef.current = next;
            continue;
          }
        }

        if (is429) {
          const wait = Math.min(800 * 2 ** Math.floor(attempt / 2), 10000);
          await sleep(wait);
          if (attempt % 2 === 1 && modelIdxRef.current < GEMINI_MODEL_CHAIN.length - 1) {
            modelIdxRef.current += 1;
          }
          continue;
        }

        throw err;
      }
    }

    return null;
  };

  const fetchDashboard = async () => {
    // First load — show full spinner. Subsequent range changes — keep UI, just refresh data.
    const isFirstLoad = !dashboard;
    if (isFirstLoad) {
      setLoading(true);
    } else {
      setIsRefreshing(true);
    }
    setError("");
    try {
      const { data } = await API.get("/admin-dashboard", { params: buildRangeParams() });
      let resolvedInsights = data?.insights || null;

      if (geminiEnabled) {
        try {
          const geminiInsights = await generateAdminGeminiJson(`
You are Nova, SmartDine's AI business analyst for the admin dashboard.
Analyze the selected dashboard range and respond ONLY with valid JSON. No markdown. No backticks.

Schema:
{
  "summary": "string",
  "chips": ["string"],
  "actions": ["string"]
}

Rules:
- Summary must be under 80 words.
- Focus on the most important business trend or risk.
- Chips must be short dashboard-ready callouts.
- Actions must be practical and specific.
- Use only the provided dashboard context.

Dashboard context:
${JSON.stringify(buildAdminInsightContext(data), null, 2)}
`);
          if (geminiInsights) resolvedInsights = geminiInsights;
        } catch (geminiError) {
          console.error("Gemini insight generation failed, using dashboard fallback:", geminiError);
        }
      }

      setDashboard(data);
      setInsights(resolvedInsights);
      setChatMessages([]);
      setChatPrompts(resolvedInsights?.actions?.length ? resolvedInsights.actions : [
        "What stands out in this range?",
        "Which hours are busiest?",
        "How can we improve repeat visits?",
      ]);
    } catch (err) {
      console.error(err);
      setError("Failed to load admin dashboard data.");
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  const fetchMenu = async () => {
    try {
      setMenuLoading(true);
      let res;
      try { res = await API.get("/menu/items"); } catch { res = await API.get("/menu"); }
      setMenuItems(Array.isArray(res.data) ? res.data : (res.data?.items || []));
    } catch (err) {
      console.error(err);
    } finally {
      setMenuLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
  }, [timeRange, appliedRange]);

  useEffect(() => {
    fetchMenu();
  }, []);

  const handlePresetRangeChange = (value) => {
    if (value === "custom") {
      setTimeRange("custom");
      if (customRangeDraft.startDate && customRangeDraft.endDate) {
        setAppliedRange({ ...customRangeDraft });
      }
      return;
    }
    setTimeRange(value);
    setAppliedRange(null);
  };

  const applyCustomDateRange = () => {
    if (!customRangeDraft.startDate || !customRangeDraft.endDate) {
      alert("Select both start and end dates.");
      return;
    }
    if (customRangeDraft.endDate < customRangeDraft.startDate) {
      alert("End date must be after start date.");
      return;
    }
    setTimeRange("custom");
    setAppliedRange({ ...customRangeDraft });
  };

  const resetToDefaultRange = () => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 6);
    setCustomRangeDraft({ startDate: toInputDate(start), endDate: toInputDate(end) });
    setAppliedRange(null);
    setTimeRange("7_days");
  };

  const topMeta = META[activePanel] || META.overview;
  const requestCount = dashboard?.requests?.pendingCount || 0;
  const staffList = dashboard?.staff?.[staffTab] || [];
  const filteredStaff = useMemo(() => {
    const q = staffSearch.trim().toLowerCase();
    if (!q) return staffList;
    return staffList.filter((staff) => [staff.name, staff.email, staff.phone].some((v) => String(v || "").toLowerCase().includes(q)));
  }, [staffList, staffSearch]);

  const filteredUsers = useMemo(() => {
    const items = dashboard?.users?.items || [];
    const q = userSearch.trim().toLowerCase();
    let next = items.filter((user) => [user.name, user.email, user.phone].some((v) => String(v || "").toLowerCase().includes(q)));
    if (userSegment === "firstTime") next = next.filter((user) => user.type === "First-time");
    if (userSegment === "returning") next = next.filter((user) => user.type === "Returning");
    if (userSegment === "highValue") next = next.filter((user) => Number(user.totalSpent || 0) >= 3000);
    return next;
  }, [dashboard, userSearch, userSegment]);

  const exportDashboardImage = () => {
    const el = document.querySelector(".sd-admin");
    if (!el) return;
    html2canvas(el, { backgroundColor: "#060A12", scale: 2 }).then((canvas) => {
      const link = document.createElement("a");
      link.href = canvas.toDataURL("image/jpeg", 0.9);
      link.download = `smartdine-dashboard-${new Date().toISOString().slice(0, 10)}.jpg`;
      link.click();
    });
  };

  const refreshInsights = async () => {
    try {
      setInsightLoading(true);
      const context = buildAdminInsightContext(dashboard);
      let data = null;

      if (dashboard && geminiEnabled) {
        data = await generateAdminGeminiJson(`
You are Nova, SmartDine's AI business analyst for the admin dashboard.
Analyze the selected dashboard range and respond ONLY with valid JSON. No markdown. No backticks.

Schema:
{
  "summary": "string",
  "chips": ["string"],
  "actions": ["string"]
}

Rules:
- Summary must be under 80 words.
- Focus on what matters most for business performance.
- Chips must be short dashboard-ready callouts.
- Actions must be practical next steps for a restaurant manager.
- Use only the provided dashboard context.

Dashboard context:
${JSON.stringify(context, null, 2)}
`);
      }

      if (!data) {
        const response = await API.get("/admin-dashboard/insights", { params: buildRangeParams() });
        data = response.data;
      }

      setInsights(data);
      if (data?.actions?.length) {
        setChatPrompts(data.actions);
      }
    } catch (err) {
      console.error(err);
      alert("Failed to generate insights.");
    } finally {
      setInsightLoading(false);
    }
  };

  const submitInsightQuestion = async (questionText) => {
    const question = String(questionText || chatQuestion).trim();
    if (!question) return;

    const nextHistory = [...chatMessages, { role: "user", content: question }];
    setChatMessages(nextHistory);
    setChatQuestion("");

    try {
      setChatLoading(true);
      const context = buildAdminInsightContext(dashboard);
      let data = null;

      if (dashboard && geminiEnabled) {
        data = await generateAdminGeminiJson(`
You are Nova, SmartDine's AI business analyst for the admin dashboard.
Answer questions about revenue, operations, customer behavior, table usage, staff load, and product performance.
Use only the provided dashboard data and recent chat history.
Respond ONLY with valid JSON. No markdown. No backticks.

Schema:
{
  "answer": "string",
  "suggestedPrompts": ["string"]
}

Rules:
- Keep the answer concise but specific.
- Mention exact metrics when they support the answer.
- If the dashboard data does not support the answer, say that directly.
- Suggested prompts should be strong follow-up business questions.

Dashboard context:
${JSON.stringify(context, null, 2)}

Recent chat history:
${JSON.stringify(nextHistory.slice(-6), null, 2)}

User question:
${question}
`);
      }

      if (!data) {
        const response = await API.post("/admin-dashboard/insights/chat", {
          question,
          ...buildRangeParams(),
          history: nextHistory,
        });
        data = response.data;
      }

      setChatMessages((prev) => [...prev, { role: "assistant", content: data?.answer || "No answer available." }]);
      if (Array.isArray(data?.suggestedPrompts) && data.suggestedPrompts.length) {
        setChatPrompts(data.suggestedPrompts);
      }
    } catch (err) {
      console.error(err);
      setChatMessages((prev) => [...prev, { role: "assistant", content: "I could not answer that insight question right now." }]);
    } finally {
      setChatLoading(false);
    }
  };

  const decideRequest = async (requestId, decision) => {
    try {
      await API.post(`/requests/${requestId}/decision`, { decision });
      await fetchDashboard();
    } catch (err) {
      console.error(err);
      alert("Failed to update request.");
    }
  };

  const removeStaff = async (staff) => {
    if (!window.confirm(`Remove ${staff.name}?`)) return;
    try {
      await API.delete(`/admin-dashboard/staff/${staff.role}/${staff.id}`);
      await fetchDashboard();
    } catch (err) {
      console.error(err);
      alert("Failed to remove staff member.");
    }
  };

  const submitStaff = async (event) => {
    event.preventDefault();
    try {
      setBusy((prev) => ({ ...prev, staff: true }));
      await API.post("/auth/staff-signup", {
        ...staffForm,
        salary: Number(staffForm.salary || 0),
        phone: String(staffForm.phone || "").replace(/\D/g, ""),
      });
      setAddStaffOpen(false);
      setStaffForm({ name: "", phone: "", email: "", role: "waiter", password: "", salary: "", employmentStatus: "active" });
      await fetchDashboard();
    } catch (err) {
      console.error(err);
      alert(err?.response?.data?.message || "Failed to add staff.");
    } finally {
      setBusy((prev) => ({ ...prev, staff: false }));
    }
  };

  const submitDish = async (event) => {
    event.preventDefault();
    try {
      setBusy((prev) => ({ ...prev, dish: true }));
      await API.post("/menu/items", {
        name: dishForm.name.trim(),
        price: Number(dishForm.price),
        category: dishForm.category,
        description: dishForm.description.trim(),
      });
      setDishForm({ name: "", price: "", category: "starters", description: "" });
      await fetchDashboard();
      await fetchMenu();
    } catch (err) {
      console.error(err);
      alert(err?.response?.data?.message || "Failed to add dish.");
    } finally {
      setBusy((prev) => ({ ...prev, dish: false }));
    }
  };

  const submitPay = async (event) => {
    event.preventDefault();
    if (!payModal.staff) return;
    try {
      setBusy((prev) => ({ ...prev, pay: true }));
      await API.post("/admin-dashboard/payroll/pay", {
        staffId: payModal.staff.id,
        amount: Number(payForm.amount),
        month: payForm.month,
        method: payForm.method,
        note: payForm.note,
      });
      setPayModal({ open: false, staff: null });
      setPayForm({ amount: "", month: "", method: "Cash", note: "" });
      await fetchDashboard();
    } catch (err) {
      console.error(err);
      alert("Failed to record payment.");
    } finally {
      setBusy((prev) => ({ ...prev, pay: false }));
    }
  };

  const submitCoupons = async (event) => {
    event.preventDefault();
    try {
      setBusy((prev) => ({ ...prev, coupon: true }));
      await Promise.all(couponModal.users.filter((user) => user.email).map((user) => sendCouponEmail(user, couponForm)));
      setCouponModal({ open: false, users: [], title: "" });
      alert("Coupon email sent successfully.");
    } catch (err) {
      console.error(err);
      alert("Failed to send coupon email.");
    } finally {
      setBusy((prev) => ({ ...prev, coupon: false }));
    }
  };

  const rangeLabel = {
    "7_days": "Last 7 Days", "30_days": "Last 30 Days",
    "90_days": "Last 90 Days", "this_month": "This Month",
    "this_year": "This Year", "custom": "Custom Range",
  }[timeRange] || "Selected Range";

  const renderRangeToolbar = () => (
    <div style={{ marginBottom: 20, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <select
        value={timeRange}
        onChange={(e) => handlePresetRangeChange(e.target.value)}
        style={{ padding: "7px 10px", borderRadius: 8, fontSize: 12, fontWeight: 500, border: "1px solid var(--border-hi)", background: "var(--card)", color: "var(--text)", cursor: "pointer", opacity: isRefreshing ? 0.6 : 1, transition: "opacity 0.2s" }}
      >
        <option value="7_days">Last 7 Days</option>
        <option value="30_days">Last 30 Days</option>
        <option value="90_days">Last 90 Days</option>
        <option value="this_month">This Month</option>
        <option value="this_year">This Year</option>
        <option value="custom">Custom Range</option>
      </select>
      {timeRange === "custom" && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <label style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600 }}>From</label>
            <input type="date" value={customRangeDraft.startDate}
              onChange={(e) => setCustomRangeDraft((prev) => ({ ...prev, startDate: e.target.value }))}
              style={{ padding: "6px 9px", borderRadius: 7, fontSize: 12, border: "1px solid var(--border-hi)", background: "var(--card)", color: "var(--text)" }}
            />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <label style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600 }}>To</label>
            <input type="date" value={customRangeDraft.endDate}
              onChange={(e) => setCustomRangeDraft((prev) => ({ ...prev, endDate: e.target.value }))}
              style={{ padding: "6px 9px", borderRadius: 7, fontSize: 12, border: "1px solid var(--border-hi)", background: "var(--card)", color: "var(--text)" }}
            />
          </div>
          <button onClick={applyCustomDateRange} style={{ padding: "6px 13px", borderRadius: 7, fontSize: 12, fontWeight: 600, border: "1px solid var(--accent)", background: "var(--accent-soft)", color: "var(--accent)", cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}>
            <Calendar size={12} /> Apply
          </button>
        </>
      )}
      {(timeRange === "custom" || appliedRange) && (
        <button onClick={resetToDefaultRange} style={{ padding: "6px 11px", borderRadius: 7, fontSize: 12, fontWeight: 600, border: "1px solid var(--border)", background: "transparent", color: "var(--muted)", cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}>
          <X size={12} /> Reset
        </button>
      )}
      <span style={{ marginLeft: 4, fontSize: 11, color: "var(--muted)", fontWeight: 500 }}>Showing: {rangeLabel}</span>
      {isRefreshing && (
        <span style={{ marginLeft: 6, fontSize: 11, color: "var(--accent)", fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--accent)", display: "inline-block", animation: "pulse-dot 1s ease-in-out infinite" }} />
          Updating…
        </span>
      )}
    </div>
  );

  const renderOverview = () => {
    const kpis = dashboard?.overview?.kpis || {};
    const extra = dashboard?.overview?.extra || {};
    const activeInsights = insights;
    const fallbackInsight =
      "Generate insights to get an AI summary of performance, trends, and practical actions for the selected range.";

    const overviewHome = (
      <div className="sd-stack">
        <Card className="sd-ai-card">
          <CardContent>
            <div className="sd-card-header">
              <div className="sd-ai-title">
                <div className="sd-ai-icon">✦</div>
                <div>
                  <h3>AI Business Insights</h3>
                </div>
              </div>
              <Button onClick={refreshInsights} className="sd-ai-button" disabled={insightLoading}>
                {insightLoading ? "Analyzing..." : activeInsights ? "Refresh Insights" : "Generate Insights"}
              </Button>
            </div>
            <div className={`sd-ai-body ${!activeInsights ? "is-empty" : ""}`}>{activeInsights?.summary || fallbackInsight}</div>
            <div className="sd-chip-row">
              {(activeInsights?.chips || []).map((chip) => (
                <span key={chip} className="sd-chip">
                  {chip}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="sd-kpi-grid">
          {[
            { key: "revenue", label: "Total Revenue", value: currency(kpis.totalRevenue?.value), deltaValue: kpis.totalRevenue?.deltaVsPreviousPeriod, icon: <IndianRupee size={20} /> },
            { key: "orders", label: "Total Orders", value: kpis.totalOrders?.value || 0, deltaValue: kpis.totalOrders?.deltaVsPreviousPeriod, icon: <ClipboardList size={20} /> },
            { key: "aov", label: "Avg Order Value", value: currency(kpis.avgOrderValue?.value), deltaValue: kpis.avgOrderValue?.deltaVsPreviousPeriod, icon: <TrendingUp size={20} /> },
            { key: "customers", label: "Unique Customers", value: kpis.uniqueCustomers?.value || 0, deltaValue: kpis.uniqueCustomers?.deltaVsPreviousPeriod, icon: <Users size={20} /> },
          ].map((item) => {
            const change = delta(item.deltaValue);
            return (
              <Card key={item.key} className="sd-kpi-card">
                <CardContent>
                  <div className="sd-kpi-card__head">
                    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                      <span style={{ opacity: 0.55, display: "flex", alignItems: "center" }}>{item.icon}</span>
                      <span className="sd-kpi-card__label">{item.label}</span>
                    </div>
                  </div>
                  <div className="sd-kpi-card__value">{item.value}</div>
                  <div className={`sd-kpi-card__delta ${change.up ? "is-up" : "is-down"}`}>
                    <span>{change.text}</span>
                    <small>vs last week</small>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="sd-grid sd-grid--snapshots">
          {[
            { label: "Repeat Rate", value: `${extra.repeatRate || 0}%`, note: "Returning customers in range" },
            { label: "Completion Rate", value: `${extra.completionRate || 0}%`, note: "Orders served or paid" },
            { label: "Table Occupancy", value: `${extra.tableOccupancyRate || 0}%`, note: "Current occupied tables" },
            { label: "Peak Window", value: extra.topHour || "N/A", note: `Best day: ${extra.topDay || "N/A"}` },
          ].map((item) => (
            <Card key={item.label}>
              <CardContent className="sd-snapshot">
                <small>{item.label}</small>
                <strong>{item.value}</strong>
                <span>{item.note}</span>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="sd-grid sd-grid--primary">
          <Card>
            <CardContent>
              <div className="sd-card-header"><div><h3>Revenue Trend</h3><p>{rangeLabel} — daily</p></div><span className="sd-badge">{rangeLabel}</span></div>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={dashboard?.charts?.revenueSeries || []}>
                  <CartesianGrid stroke={COLORS.grid} vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: COLORS.textMuted, fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: COLORS.textMuted, fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={currency} />
                  <Tooltip content={<TooltipCard money />} />
                  <Bar dataKey="value" fill={COLORS.blue} radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <div className="sd-card-header">
                <div><h3>Customer Split</h3><p>First-time vs returning</p></div>
              </div>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie data={dashboard?.charts?.customerSplit || []} dataKey="value" nameKey="name" innerRadius={72} outerRadius={108} strokeWidth={0}>
                    <Cell fill={COLORS.blue} />
                    <Cell fill={COLORS.green} />
                  </Pie>
                  <Tooltip content={<TooltipCard />} />
                  <Legend verticalAlign="bottom" iconType="circle" />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        <div className="sd-grid sd-grid--equal">
          <Card>
            <CardContent>
              <div className="sd-card-header">
                <div><h3>Best Selling Items</h3><p>Orders by dish — all time</p></div>
                <span className="sd-badge sd-badge--muted">Top 7</span>
              </div>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={dashboard?.charts?.bestSellingItems || []} layout="vertical">
                  <CartesianGrid stroke={COLORS.grid} horizontal={false} />
                  <XAxis type="number" tick={{ fill: COLORS.textMuted, fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" width={120} tick={{ fill: COLORS.textMuted, fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<TooltipCard />} />
                  <Bar dataKey="value" radius={[0, 8, 8, 0]}>
                    {(dashboard?.charts?.bestSellingItems || []).map((item) => (
                      <Cell key={item.name} fill={CATEGORY_COLORS[item.category] || COLORS.blue} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <div className="sd-card-header">
                <div><h3>Category Performance</h3><p>Revenue contribution by menu category</p></div>
                <span className="sd-badge sd-badge--violet">Category</span>
              </div>
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={dashboard?.charts?.categoryPerformance || []} dataKey="value" nameKey="name" innerRadius={78} outerRadius={115} strokeWidth={0}>
                    {(dashboard?.charts?.categoryPerformance || []).map((item) => (
                      <Cell key={item.name} fill={CATEGORY_COLORS[item.name] || COLORS.violet} />
                    ))}
                  </Pie>
                  <Tooltip content={<TooltipCard />} />
                  <Legend verticalAlign="bottom" iconType="circle" />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        <div className="sd-grid sd-grid--equal">
          <Card>
            <CardContent>
              <div className="sd-card-header">
                <div><h3>Item Category Breakdown</h3><p>Order share per category</p></div>
              </div>
              <div className="sd-progress-stack">
                {(dashboard?.charts?.itemCategoryBreakdown || []).map((item) => (
                  <div key={item.name} className="sd-progress">
                    <div className="sd-progress__meta"><span>{item.name}</span><strong style={{ color: CATEGORY_COLORS[item.name] || COLORS.blue }}>{item.value}%</strong></div>
                    <div className="sd-progress__track"><div className="sd-progress__fill" style={{ width: `${item.value}%`, background: CATEGORY_COLORS[item.name] || COLORS.blue }} /></div>
                  </div>
                ))}
              </div>
              <div className="sd-section-heading">Top Upsell Opportunities</div>
              <div className="sd-progress-stack">
                {(dashboard?.charts?.topUpsellOpportunities || []).map((item) => {
                  const color = item.name.includes("Dessert") ? COLORS.amber : item.name.includes("Beverage") ? COLORS.cyan : COLORS.green;
                  return (
                    <div key={item.name} className="sd-progress">
                      <div className="sd-progress__meta"><span>{item.name}</span><strong style={{ color }}>{item.value}%</strong></div>
                      <div className="sd-progress__track"><div className="sd-progress__fill" style={{ width: `${item.value}%`, background: color }} /></div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <div className="sd-card-header">
                <div><h3>Table Activity Heatmap</h3><p>Orders per table — today</p></div>
              </div>
              <div className="sd-table-heatmap">
                {(dashboard?.charts?.tableHeatmap || []).map((item) => {
                  const pct = Math.min(item.orders / 24, 1);
                  const bgA = (0.10 + pct * 0.70).toFixed(2);
                  const bdA = Math.min(parseFloat(bgA) + 0.15, 0.55).toFixed(2);
                  return (
                    <div
                      key={item.tableId}
                      className="sd-heatmap-cell"
                      style={{
                        background: `rgba(59,130,246,${bgA})`,
                        border: `1px solid rgba(59,130,246,${bdA})`,
                      }}
                    >
                      <div className="sd-heatmap-cell__id">{item.tableId}</div>
                      <div className="sd-heatmap-cell__count">{item.orders}</div>
                      <small>orders</small>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="sd-grid sd-grid--equal">
          <Card className="sd-chat-card">
            <CardContent>
              <div className="sd-card-header">
                <div><h3>Ask About Insights</h3><p>Question the AI about this dashboard range</p></div>
                <span className="sd-badge sd-badge--muted">{dashboard?.selectedRange?.label || "Range"}</span>
              </div>
              <div className="sd-chat-thread">
                {chatMessages.length === 0 ? (
                  <div className="sd-chat-empty">
                    <MessageCircle size={18} />
                    <span>Ask about revenue drivers, peak hours, retention, or item performance.</span>
                  </div>
                ) : chatMessages.map((message, index) => (
                  <div key={`${message.role}-${index}`} className={`sd-chat-bubble ${message.role === "user" ? "is-user" : "is-assistant"}`}>
                    {message.content}
                  </div>
                ))}
                {chatLoading ? <div className="sd-chat-bubble is-assistant">Analyzing the selected range...</div> : null}
              </div>
              <div className="sd-chip-row">
                {chatPrompts.map((prompt) => (
                  <button key={prompt} type="button" className="sd-chip sd-chip-btn" onClick={() => submitInsightQuestion(prompt)}>
                    {prompt}
                  </button>
                ))}
              </div>
              <div className="sd-chat-compose">
                <input
                  value={chatQuestion}
                  onChange={(e) => setChatQuestion(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      submitInsightQuestion();
                    }
                  }}
                  placeholder="Ask a question about these insights..."
                />
                <Button onClick={() => submitInsightQuestion()} disabled={chatLoading || !chatQuestion.trim()}>
                  <Send size={14} />
                  Ask
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <div className="sd-card-header">
                <div><h3>Status Distribution</h3><p>Operational mix in the selected range</p></div>
              </div>
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={dashboard?.charts?.statusDistribution || []} dataKey="value" nameKey="name" innerRadius={70} outerRadius={108} strokeWidth={0}>
                    {(dashboard?.charts?.statusDistribution || []).map((item, index) => (
                      <Cell key={item.name} fill={[COLORS.blue, COLORS.green, COLORS.amber, COLORS.violet, COLORS.cyan][index % 5]} />
                    ))}
                  </Pie>
                  <Tooltip content={<TooltipCard />} />
                  <Legend verticalAlign="bottom" iconType="circle" />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      </div>
    );

    const overviewAnalytics = (
      <div className="sd-stack">
        <div className="sd-grid sd-grid--primary">
          <Card>
            <CardContent>
              <div className="sd-card-header"><div><h3>Revenue Trend</h3><p>{rangeLabel} — daily revenue</p></div></div>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={dashboard?.charts?.revenueTrend || dashboard?.charts?.revenueSeries || []}>
                  <CartesianGrid stroke={COLORS.grid} vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: COLORS.textMuted, fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: COLORS.textMuted, fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={currency} />
                  <Tooltip content={<TooltipCard money />} />
                  <Legend />
                  <Line type="monotone" dataKey="actual" stroke={COLORS.blue} strokeWidth={3} dot={{ r: 4 }} />
                  <Line type="monotone" dataKey="forecast" stroke={COLORS.violet} strokeWidth={3} strokeDasharray="6 6" dot={{ r: 4 }} />
                  <Line type="monotone" dataKey="value" stroke={COLORS.blue} strokeWidth={3} dot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <Card>
            <CardContent>
              <div className="sd-card-header"><div><h3>Orders by Hour</h3><p>Hourly distribution · {rangeLabel}</p></div></div>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={dashboard?.charts?.hourlyOrders || []}>
                  <CartesianGrid stroke={COLORS.grid} vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: COLORS.textMuted, fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: COLORS.textMuted, fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<TooltipCard />} />
                  <Bar dataKey="value" fill={COLORS.green} radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
        <div className="sd-grid sd-grid--equal">
          <Card>
            <CardContent>
              <div className="sd-card-header"><div><h3>Performance Radar</h3><p>This week vs last week</p></div></div>
              <ResponsiveContainer width="100%" height={320}>
                <RadarChart data={dashboard?.charts?.performanceRadar || []}>
                  <PolarGrid stroke={COLORS.grid} />
                  <PolarAngleAxis dataKey="name" tick={{ fill: COLORS.textMuted, fontSize: 11 }} />
                  <Tooltip content={<TooltipCard />} />
                  <Radar name="This Week" dataKey="thisWeek" stroke={COLORS.blue} fill={COLORS.blue} fillOpacity={0.2} />
                  <Radar name="Last Week" dataKey="lastWeek" stroke={COLORS.violet} fill={COLORS.violet} fillOpacity={0.15} />
                </RadarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <Card>
            <CardContent>
              <div className="sd-card-header"><div><h3>Satisfaction & Ratings</h3><p>Food quality metrics</p></div></div>
              <div className="sd-rings">
                {(dashboard?.charts?.ratings || []).map((item) => (
                  <MetricRing key={item.name} value={item.value} label={item.name} color={CATEGORY_COLORS[item.name] || COLORS.blue} />
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );

    const overviewOrders = (
      <Card>
        <CardContent>
          <div className="sd-card-header">
            <div><h3>Recent Orders</h3><p>All orders · {dashboard?.dateLabel}</p></div>
            <div className="sd-search" style={{ border: '1px solid var(--border)', borderRadius: '8px', padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.05)' }}>
              <Search size={15} color="var(--text-dim)" />
              <input value={orderSearch} onChange={(e) => setOrderSearch(e.target.value)} placeholder="Filter orders..." style={{ background: 'transparent', border: 'none', color: 'var(--text)', outline: 'none' }} />
            </div>
          </div>
          <div className="sd-table-wrap">
            <table className="sd-table">
              <thead><tr><th>Order ID</th><th>Customer</th><th>Items</th><th>Table</th><th>Amount</th><th>Status</th></tr></thead>
              <tbody>
                {((dashboard?.recentOrders || []).filter(o =>
                  String(o.orderId).toLowerCase().includes(orderSearch.toLowerCase()) ||
                  String(o.customerName).toLowerCase().includes(orderSearch.toLowerCase()) ||
                  String(o.tableNo).toLowerCase().includes(orderSearch.toLowerCase())
                )).map((order) => (
                  <tr key={order.id}>
                    <td className="sd-mono">{order.orderId}</td>
                    <td>{order.customerName}</td>
                    <td>{order.items.join(", ")}</td>
                    <td>{order.tableNo}</td>
                    <td className="sd-strong">{currency(order.amount)}</td>
                    <td><span className={`sd-status ${order.statusTone === "green" ? "is-green" : order.statusTone === "amber" ? "is-amber" : "is-muted"}`}>{order.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    );

    return overviewTab === "overview" ? overviewHome : overviewTab === "analytics" ? overviewAnalytics : overviewOrders;
  };

  const renderAnalytics = () => {
    const snapshots = dashboard?.overview?.snapshots || {};
    const extra = dashboard?.overview?.extra || {};
    return (
      <div className="sd-stack">
        {renderRangeToolbar()}
        <div className="sd-grid sd-grid--snapshots">
          {[
            { label: "Last 7 Days", value: snapshots.last7Days },
            { label: "This Month", value: snapshots.thisMonth },
            { label: "This Year", value: snapshots.thisYear },
          ].map((item) => (
            <Card key={item.label}>
              <CardContent className="sd-snapshot">
                <small>{item.label}</small>
                <strong>{currency(item.value?.revenue)}</strong>
                <span>{item.value?.orders || 0} orders · Avg {currency(item.value?.avgOrderValue)}</span>
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="sd-grid sd-grid--primary">
          <Card>
            <CardContent>
              <div className="sd-card-header">
                <div><h3>Revenue - Selected Range</h3><p>Daily totals</p></div>
                <select className="sd-select" style={{ background: 'transparent', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: '6px', padding: '4px 8px' }} value={timeRange} onChange={(e) => handlePresetRangeChange(e.target.value)}>
                  <option value="7_days" style={{ color: '#000' }}>Last 7 Days</option>
                  <option value="30_days" style={{ color: '#000' }}>Last 30 Days</option>
                  <option value="90_days" style={{ color: '#000' }}>Last 90 Days</option>
                  <option value="this_month" style={{ color: '#000' }}>This Month</option>
                  <option value="this_year" style={{ color: '#000' }}>This Year</option>
                  <option value="custom" style={{ color: '#000' }}>Custom Range</option>
                </select>
              </div>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={dashboard?.charts?.revenueSeries || []}>
                  <CartesianGrid stroke={COLORS.grid} vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: COLORS.textMuted, fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: COLORS.textMuted, fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={currency} />
                  <Tooltip content={<TooltipCard money />} />
                  <Bar dataKey="value" fill={COLORS.blue} radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <Card><CardContent><div className="sd-card-header"><div><h3>Best Selling Items</h3><p>By order count</p></div></div><ResponsiveContainer width="100%" height={260}><BarChart data={dashboard?.charts?.bestSellingItems || []} layout="vertical"><CartesianGrid stroke={COLORS.grid} horizontal={false} /><XAxis type="number" tick={{ fill: COLORS.textMuted, fontSize: 11 }} axisLine={false} tickLine={false} /><YAxis type="category" dataKey="name" width={120} tick={{ fill: COLORS.textMuted, fontSize: 11 }} axisLine={false} tickLine={false} /><Tooltip content={<TooltipCard />} /><Bar dataKey="value" fill={COLORS.cyan} radius={[0, 8, 8, 0]} /></BarChart></ResponsiveContainer></CardContent></Card>
        </div>
        <div className="sd-grid sd-grid--snapshots">
          {[
            { label: "Repeat Rate", value: `${extra.repeatRate || 0}%`, note: "Returning customer share" },
            { label: "Completion Rate", value: `${extra.completionRate || 0}%`, note: "Served or paid orders" },
            { label: "Occupancy", value: `${extra.tableOccupancyRate || 0}%`, note: "Live table utilization" },
            { label: "Peak Hour", value: extra.topHour || "N/A", note: `Top day: ${extra.topDay || "N/A"}` },
          ].map((item) => (
            <Card key={item.label}>
              <CardContent className="sd-snapshot">
                <small>{item.label}</small>
                <strong>{item.value}</strong>
                <span>{item.note}</span>
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="sd-grid sd-grid--equal">
          <Card><CardContent><div className="sd-card-header"><div><h3>Most Used Tables</h3><p>By order count</p></div></div><ResponsiveContainer width="100%" height={240}><BarChart data={dashboard?.charts?.tableUsage || []}><CartesianGrid stroke={COLORS.grid} vertical={false} /><XAxis dataKey="name" tick={{ fill: COLORS.textMuted, fontSize: 11 }} axisLine={false} tickLine={false} /><YAxis tick={{ fill: COLORS.textMuted, fontSize: 11 }} axisLine={false} tickLine={false} /><Tooltip content={<TooltipCard />} /><Bar dataKey="value" fill={COLORS.violet} radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer></CardContent></Card>
          <Card><CardContent><div className="sd-card-header"><div><h3>Orders by Hour</h3><p>Peak dining times</p></div></div><ResponsiveContainer width="100%" height={240}><BarChart data={dashboard?.charts?.hourlyOrders || []}><CartesianGrid stroke={COLORS.grid} vertical={false} /><XAxis dataKey="label" tick={{ fill: COLORS.textMuted, fontSize: 10 }} axisLine={false} tickLine={false} /><YAxis tick={{ fill: COLORS.textMuted, fontSize: 11 }} axisLine={false} tickLine={false} /><Tooltip content={<TooltipCard />} /><Bar dataKey="value" fill={COLORS.green} radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer></CardContent></Card>
        </div>
        <div className="sd-grid sd-grid--equal">
          <Card><CardContent><div className="sd-card-header"><div><h3>Customer Split</h3><p>First-time vs returning</p></div></div><div className="sd-split-panel"><ResponsiveContainer width="100%" height={180}><PieChart><Pie data={dashboard?.charts?.customerSplit || []} dataKey="value" innerRadius={50} outerRadius={72} strokeWidth={0}><Cell fill={COLORS.blue} /><Cell fill={COLORS.green} /></Pie></PieChart></ResponsiveContainer><div className="sd-split-panel__stats">{(dashboard?.charts?.customerSplit || []).map((item, index) => <div key={item.name}><strong>{item.value}%</strong><span>{item.name} customers</span>{index === 0 ? <i /> : null}</div>)}</div></div></CardContent></Card>
          <Card><CardContent><div className="sd-card-header"><div><h3>Revenue by Day of Week</h3><p>Weekly pattern</p></div></div><ResponsiveContainer width="100%" height={240}><BarChart data={dashboard?.charts?.revenueByDayOfWeek || []}><CartesianGrid stroke={COLORS.grid} vertical={false} /><XAxis dataKey="label" tick={{ fill: COLORS.textMuted, fontSize: 11 }} axisLine={false} tickLine={false} /><YAxis tick={{ fill: COLORS.textMuted, fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={currency} /><Tooltip content={<TooltipCard money />} /><Bar dataKey="value" fill={COLORS.blue} radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer></CardContent></Card>
        </div>
        <div className="sd-grid sd-grid--equal">
          <Card><CardContent><div className="sd-card-header"><div><h3>Orders Over Time</h3><p>Volume trend for the selected range</p></div></div><ResponsiveContainer width="100%" height={240}><LineChart data={dashboard?.charts?.orderSeries || []}><CartesianGrid stroke={COLORS.grid} vertical={false} /><XAxis dataKey="label" tick={{ fill: COLORS.textMuted, fontSize: 11 }} axisLine={false} tickLine={false} /><YAxis tick={{ fill: COLORS.textMuted, fontSize: 11 }} axisLine={false} tickLine={false} /><Tooltip content={<TooltipCard />} /><Line type="monotone" dataKey="value" stroke={COLORS.amber} strokeWidth={3} dot={false} /></LineChart></ResponsiveContainer></CardContent></Card>
          <Card><CardContent><div className="sd-card-header"><div><h3>Customer Spend Buckets</h3><p>Distribution of customer value</p></div></div><ResponsiveContainer width="100%" height={240}><BarChart data={dashboard?.charts?.spendBuckets || []}><CartesianGrid stroke={COLORS.grid} vertical={false} /><XAxis dataKey="name" tick={{ fill: COLORS.textMuted, fontSize: 11 }} axisLine={false} tickLine={false} /><YAxis tick={{ fill: COLORS.textMuted, fontSize: 11 }} axisLine={false} tickLine={false} /><Tooltip content={<TooltipCard />} /><Bar dataKey="value" fill={COLORS.violet} radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer></CardContent></Card>
        </div>
      </div>
    );
  };
  const renderStaff = () => (
    <div className="sd-stack">
      <div className="sd-toolbar">
        <div className="sd-segmented">
          <button className={staffTab === "waiters" ? "active" : ""} onClick={() => setStaffTab("waiters")}>Waiters</button>
          <button className={staffTab === "cooks" ? "active" : ""} onClick={() => setStaffTab("cooks")}>Cooks / Chefs</button>
        </div>
        <div className="sd-search">
          <Search size={15} />
          <input value={staffSearch} onChange={(e) => setStaffSearch(e.target.value)} placeholder="Search by name, phone, email..." />
        </div>
        <Button onClick={() => setAddStaffOpen(true)}><UserPlus size={15} />Add Staff</Button>
      </div>
      <div className="sd-card-grid">
        {filteredStaff.map((staff) => (
          <Card key={staff.id}>
            <CardContent>
              <div className="sd-staff-card">
                <div className="sd-staff-card__top">
                  <div className="sd-staff-card__avatar">{staff.name.slice(0, 2).toUpperCase()}</div>
                  <div><h4>{staff.name}</h4><p>{staff.role.toUpperCase()}</p></div>
                  <span className={`sd-status ${staff.employmentStatus === "active" ? "is-green" : "is-amber"}`}>{staff.employmentStatus === "active" ? "Active" : "On Leave"}</span>
                </div>
                <div className="sd-staff-card__meta">
                  <div><Mail size={13} /><span>{staff.email || "No email"}</span></div>
                  <div><Phone size={13} /><span>{staff.phone}</span></div>
                  <div><IndianRupee size={13} /><span>Salary: {currency(staff.salary)}/mo</span></div>
                  <div><Calendar size={13} /><span>Joined: {shortDate(staff.joinedAt)}</span></div>
                </div>
                <div className="sd-staff-card__actions">
                  <Button className="sd-fill" style={{ backgroundColor: 'var(--accent)', color: 'white', border: 'none' }} onClick={() => { setPayModal({ open: true, staff }); setPayForm({ amount: staff.salary || "", month: "", method: "Cash", note: "" }); }}>Pay Salary</Button>
                  <Button variant="ghost" className="sd-fill sd-btn-danger" onClick={() => removeStaff(staff)}>Remove</Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );

  const renderDish = () => {
    const displayedMenuItems = (menuItems || []).filter(item => item.category === menuTab || (menuTab === 'maincourse' && item.category === 'mains'));

    return (
      <div className="sd-grid sd-grid--equal" style={{ alignItems: 'start' }}>
        <Card className="sd-form-shell">
          <CardContent>
            <div className="sd-form-header"><div><h3 style={{ color: "var(--text)" }}>Add New Dish</h3><p>Fill in the details below</p></div></div>
            <form className="sd-form" onSubmit={submitDish}>
              <label>Dish Name<input value={dishForm.name} onChange={(e) => setDishForm((prev) => ({ ...prev, name: e.target.value }))} placeholder="e.g. Chicken 65" /></label>
              <label>Price (₹)<input type="number" value={dishForm.price} onChange={(e) => setDishForm((prev) => ({ ...prev, price: e.target.value }))} placeholder="e.g. 280" /></label>
              <label>Category<select value={dishForm.category} onChange={(e) => setDishForm((prev) => ({ ...prev, category: e.target.value }))}><option value="starters">Starters</option><option value="maincourse">Mains</option><option value="desserts">Desserts</option><option value="beverages">Beverages</option><option value="snacks">Snacks</option></select></label>
              <label>Description<textarea rows={4} value={dishForm.description} onChange={(e) => setDishForm((prev) => ({ ...prev, description: e.target.value }))} placeholder="Short description..." /></label>
              <Button type="submit" className="sd-form-submit" disabled={busy.dish}>{busy.dish ? "Adding..." : "Add Dish"}</Button>
            </form>
          </CardContent>
        </Card>

        {menuItems && menuItems.length > 0 && (
          <Card className="sd-form-shell" style={{ height: 'fit-content', maxHeight: '600px', display: 'flex', flexDirection: 'column' }}>
            <CardContent style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div className="sd-card-header" style={{ marginBottom: "10px" }}>
                <div><h3 style={{ color: "var(--text)", margin: 0, fontSize: "15px" }}>Current Menu</h3><p style={{ margin: "3px 0 0", color: "var(--muted)", fontSize: "11.5px" }}>All available dishes</p></div>
              </div>
              <div className="sd-segmented" style={{ marginBottom: '15px' }}>
                <button className={menuTab === "starters" ? "active" : ""} onClick={() => setMenuTab("starters")}>Starters</button>
                <button className={menuTab === "maincourse" ? "active" : ""} onClick={() => setMenuTab("maincourse")}>Mains</button>
                <button className={menuTab === "desserts" ? "active" : ""} onClick={() => setMenuTab("desserts")}>Desserts</button>
              </div>
              <div className="sd-table-wrap" style={{ overflowY: 'auto' }}>
                <table className="sd-table">
                  <thead><tr><th>Dish Name</th><th>Price</th></tr></thead>
                  <tbody>
                    {displayedMenuItems.length === 0 ? (
                      <tr><td colSpan="2" style={{ textAlign: "center", padding: "20px", color: "var(--muted)" }}>No dishes in this category.</td></tr>
                    ) : displayedMenuItems.map(item => (
                      <tr key={item._id}>
                        <td className="sd-strong">{item.name}</td>
                        <td className="sd-strong">{currency(item.price)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    );
  };

  const renderRequests = () => {
    const requests = dashboard?.requests?.items || [];
    if (!requests.length) return <EmptyState icon="🎉" title="All caught up!" subtitle="No pending requests at the moment." />;
    return (
      <div className="sd-request-grid">
        {requests.map((request) => (
          <Card key={request.id}>
            <CardContent>
              <div className="sd-request-card">
                <div className="sd-request-card__top"><span className="sd-status is-amber">{request.status}</span><small>{new Date(request.createdAt).toLocaleString("en-IN")}</small></div>
                <h4>{request.name}</h4>
                <div className="sd-request-card__rows">
                  <div><span>Type</span><strong>{request.type || "—"}</strong></div>
                  <div><span>Category</span><strong>{request.category || "—"}</strong></div>
                  <div><span>Price</span><strong>{request.price ? currency(request.price) : "—"}</strong></div>
                  <div><span>Requested By</span><strong>{request.requestedBy || "—"}</strong></div>
                </div>
                {request.notes ? <p className="sd-request-card__notes">{request.notes}</p> : null}
                <div className="sd-request-card__actions">
                  <Button variant="success" className="sd-fill" onClick={() => decideRequest(request.id, "approved")}>Approve</Button>
                  <Button variant="danger" className="sd-fill" onClick={() => decideRequest(request.id, "rejected")}>Reject</Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  };

  const renderUsers = () => {
    const users = filteredUsers;
    return (
      <div className="sd-stack">
        <div className="sd-toolbar sd-toolbar--users">
          <div className="sd-search sd-search--wide"><Search size={15} /><input value={userSearch} onChange={(e) => setUserSearch(e.target.value)} placeholder="Search by name, email, phone..." /></div>
          <select className="sd-select" value={userSegment} onChange={(e) => setUserSegment(e.target.value)}>
            <option value="all">All Customers</option>
            <option value="firstTime">First-time</option>
            <option value="returning">Returning</option>
            <option value="highValue">High Value</option>
          </select>
          <Button onClick={() => setCouponModal({ open: true, users: users.filter((user) => user.email), title: "All Customers" })}>Send Coupon to Segment</Button>
        </div>
        <Card>
          <CardContent>
            <div className="sd-card-header"><div><h3>Users & Coupons</h3><p>Understand your customers and send targeted coupons</p></div></div>
            <div className="sd-table-wrap">
              <table className="sd-table">
                <thead><tr><th>Customer</th><th>Email</th><th>Phone</th><th>Orders</th><th>Total Spent</th><th>Type</th><th>Action</th></tr></thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id}>
                      <td className="sd-strong">{user.name}</td>
                      <td>{user.email}</td>
                      <td>{user.phone}</td>
                      <td>{user.orders}</td>
                      <td className="sd-strong">{currency(user.totalSpent)}</td>
                      <td><span className={`sd-status ${user.type === "Returning" ? "is-green" : "is-blue"}`}>{user.type}</span></td>
                      <td><Button variant="outline" size="sm" onClick={() => setCouponModal({ open: true, users: [user], title: user.name })}>Send Coupon</Button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  const renderContent = () => {
    // Only full-screen spinner on very first load (no data yet)
    if (loading && !dashboard) return <EmptyState icon="⏳" title="Loading dashboard" subtitle="Fetching admin analytics and management data." />;
    if (error) return <EmptyState icon="⚠️" title="Unable to load dashboard" subtitle={error} />;
    if (!dashboard) return null;
    if (activePanel === "overview") return renderOverview();
    if (activePanel === "analytics") return renderAnalytics();
    if (activePanel === "staff") return renderStaff();
    if (activePanel === "dish") return renderDish();
    if (activePanel === "requests") return renderRequests();
    return renderUsers();
  };

  return (
    <div className={`sd-admin${theme === "light" ? " sd-light" : ""}`}>
      <AdminSidebar active={activePanel} setActive={setActivePanel} badges={{ requests: requestCount }} />
      <main className="sd-main-shell">
        <header className="sd-topbar">
          <div>
            <h1>{topMeta.title}</h1>
            <p>{topMeta.sub}</p>
          </div>
          <div className="sd-topbar__actions">
            <button className="sd-theme-toggle" onClick={toggleTheme} title={theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}>
              {theme === "dark" ? <><Sun size={13} /> Light</> : <><Moon size={13} /> Dark</>}
            </button>
            <button
              onClick={exportDashboardImage}
              style={{
                display: "flex", alignItems: "center", gap: 5,
                padding: "6px 13px", borderRadius: 8, fontSize: 12, fontWeight: 600,
                border: "1px solid var(--border-hi)", background: "var(--accent-soft)",
                color: "var(--accent)", cursor: "pointer", fontFamily: "inherit",
              }}
            >
              <Download size={13} /> Export
            </button>
            <LogoutButton
              className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-all hover:border-red-300 hover:bg-red-50 hover:text-red-700"
            />
          </div>
        </header>

        {/* ── Secondary tab bar — Overview only ── */}
        {activePanel === "overview" && (
          <div className="sd-page-tabs">
            {[
              { key: "overview", label: "Overview" },
              { key: "analytics", label: "Analytics" },
              { key: "orders", label: "Orders" },
            ].map((tab) => (
              <button
                key={tab.key}
                className={overviewTab === tab.key ? "active" : ""}
                onClick={() => setOverviewTab(tab.key)}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}

        {isRefreshing && (
          <div style={{
            position: "sticky", top: 0, left: 0, right: 0, height: 3, zIndex: 99,
            background: "linear-gradient(90deg, var(--accent), var(--violet), var(--accent))",
            backgroundSize: "200% 100%",
            animation: "sd-refresh-bar 1.2s linear infinite",
          }} />
        )}
        <section className="sd-content-shell">{renderContent()}</section>
      </main>

      {addStaffOpen ? (
        <div className="sd-modal-backdrop">
          <Card className="sd-modal">
            <CardContent>
              <div className="sd-modal__header">
                <div><h3 style={{ color: "var(--text)" }}>Add Staff Member</h3><p style={{ color: "var(--text-dim)" }}>Register waiters or cooks with login credentials.</p></div>
                <button className="sd-icon-btn" onClick={() => setAddStaffOpen(false)}><X size={16} /></button>
              </div>
              <form className="sd-form" onSubmit={submitStaff}>
                <div className="sd-form-grid">
                  <label>Full Name<input value={staffForm.name} onChange={(e) => setStaffForm((prev) => ({ ...prev, name: e.target.value }))} /></label>
                  <label>Phone<input value={staffForm.phone} onChange={(e) => setStaffForm((prev) => ({ ...prev, phone: e.target.value }))} /></label>
                </div>
                <label>Email<input type="email" value={staffForm.email} onChange={(e) => setStaffForm((prev) => ({ ...prev, email: e.target.value }))} /></label>
                <div className="sd-form-grid">
                  <label>Role<select value={staffForm.role} onChange={(e) => setStaffForm((prev) => ({ ...prev, role: e.target.value }))}><option value="waiter">Waiter</option><option value="cook">Cook / Chef</option></select></label>
                  <label>Salary<input type="number" value={staffForm.salary} onChange={(e) => setStaffForm((prev) => ({ ...prev, salary: e.target.value }))} /></label>
                </div>
                <div className="sd-form-grid">
                  <label>Status<select value={staffForm.employmentStatus} onChange={(e) => setStaffForm((prev) => ({ ...prev, employmentStatus: e.target.value }))}><option value="active">Active</option><option value="leave">On Leave</option></select></label>
                  <label>Password<input type="password" value={staffForm.password} onChange={(e) => setStaffForm((prev) => ({ ...prev, password: e.target.value }))} /></label>
                </div>
                <div className="sd-modal__actions">
                  <Button variant="ghost" onClick={() => setAddStaffOpen(false)}>Cancel</Button>
                  <Button type="submit" disabled={busy.staff}>{busy.staff ? "Adding..." : "Add Staff"}</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {payModal.open ? (
        <div className="sd-modal-backdrop">
          <Card className="sd-modal sd-modal--sm">
            <CardContent>
              <div className="sd-modal__header">
                <div><h3>Pay Salary</h3><p>{payModal.staff?.name}</p></div>
                <button className="sd-icon-btn" onClick={() => setPayModal({ open: false, staff: null })}><X size={16} /></button>
              </div>
              <form className="sd-form" onSubmit={submitPay}>
                <label>Amount<input type="number" value={payForm.amount} onChange={(e) => setPayForm((prev) => ({ ...prev, amount: e.target.value }))} /></label>
                <label>Month<input type="month" value={payForm.month} onChange={(e) => setPayForm((prev) => ({ ...prev, month: e.target.value }))} /></label>
                <label>Method<select value={payForm.method} onChange={(e) => setPayForm((prev) => ({ ...prev, method: e.target.value }))}><option>Cash</option><option>UPI</option><option>Bank Transfer</option></select></label>
                <label>Note<textarea rows={3} value={payForm.note} onChange={(e) => setPayForm((prev) => ({ ...prev, note: e.target.value }))} /></label>
                <div className="sd-modal__actions">
                  <Button variant="ghost" onClick={() => setPayModal({ open: false, staff: null })}>Cancel</Button>
                  <Button type="submit" disabled={busy.pay}>{busy.pay ? "Saving..." : "Record Payment"}</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {couponModal.open ? (
        <div className="sd-modal-backdrop">
          <Card className="sd-modal">
            <CardContent>
              <div className="sd-modal__header">
                <div><h3>Send Coupon</h3><p>{couponModal.title}</p></div>
                <button className="sd-icon-btn" onClick={() => setCouponModal({ open: false, users: [], title: "" })}><X size={16} /></button>
              </div>
              <form className="sd-form" onSubmit={submitCoupons}>
                <label>Coupon Title<input value={couponForm.title} onChange={(e) => setCouponForm((prev) => ({ ...prev, title: e.target.value }))} /></label>
                <div className="sd-form-grid">
                  <label>Code<input value={couponForm.code} onChange={(e) => setCouponForm((prev) => ({ ...prev, code: e.target.value.toUpperCase() }))} /></label>
                  <label>Discount Value<input type="number" value={couponForm.discountValue} onChange={(e) => setCouponForm((prev) => ({ ...prev, discountValue: Number(e.target.value || 0) }))} /></label>
                </div>
                <div className="sd-form-grid">
                  <label>Discount Type<select value={couponForm.discountType} onChange={(e) => setCouponForm((prev) => ({ ...prev, discountType: e.target.value }))}><option value="percent">Percent (%)</option><option value="flat">Flat (₹)</option></select></label>
                  <label>Minimum Order Value<input type="number" value={couponForm.minOrderValue} onChange={(e) => setCouponForm((prev) => ({ ...prev, minOrderValue: Number(e.target.value || 0) }))} /></label>
                </div>
                <label>Expires On<input type="date" value={couponForm.expiresAt} onChange={(e) => setCouponForm((prev) => ({ ...prev, expiresAt: e.target.value }))} /></label>
                <label>Message<textarea rows={4} value={couponForm.message} onChange={(e) => setCouponForm((prev) => ({ ...prev, message: e.target.value }))} /></label>
                <div className="sd-modal__actions">
                  <Button variant="ghost" onClick={() => setCouponModal({ open: false, users: [], title: "" })}>Cancel</Button>
                  <Button type="submit" disabled={busy.coupon}>{busy.coupon ? "Sending..." : `Send to ${couponModal.users.length} user${couponModal.users.length > 1 ? "s" : ""}`}</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}

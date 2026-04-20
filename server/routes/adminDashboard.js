const express = require("express");
const router = express.Router();

const auth = require("../middleware/auth");
const requireRole = require("../middleware/requireRole");
const PreviousOrder = require("../models/PreviousOrder");
const Order = require("../models/Order");
const MenuItem = require("../models/MenuItem");
const Request = require("../models/Request");
const User = require("../models/User");
const Waiter = require("../models/Waiter");
const Cook = require("../models/Cook");
const Feedback = require("../models/Feedback");
const Table = require("../models/Table");
const PayrollPayment = require("../models/PayrollPayment");
const { GoogleGenerativeAI } = require("@google/generative-ai");

router.use(auth, requireRole("admin"));

const GEMINI_MODEL_CHAIN = [
  process.env.GEMINI_MODEL || "gemini-2.5-flash",
  "gemini-3.1-flash-lite-preview",
  "gemini-2.0-flash",
  "gemini-1.5-flash",
].filter((model, index, list) => model && list.indexOf(model) === index);
const GEMINI_API_KEYS = [
  process.env.GEMINI_API_KEY_1,
  process.env.GEMINI_API_KEY_2,
  process.env.GEMINI_API_KEY_3,
  process.env.GEMINI_API_KEY_4,
  process.env.GEMINI_API_KEY_5,
  process.env.GEMINI_API_KEY,
  process.env.GOOGLE_API_KEY,
].filter((key, index, list) => key && list.indexOf(key) === index);
const geminiClients = GEMINI_API_KEYS.map((key) => new GoogleGenerativeAI(key));

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function getOrderDate(order) {
  const date = new Date(order?.createdAt || order?.updatedAt || Date.now());
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function getItemName(item) {
  if (typeof item === "string") return item.trim();
  return String(item?.name || "").trim();
}

function getItemQuantity(item) {
  if (typeof item === "object" && item) {
    return Math.max(1, number(item.quantity, 1));
  }
  return 1;
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function endOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
}

function addDays(date, days) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function addMonths(date, months) {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function parseDateInput(value) {
  if (!value) return null;
  const parsed = new Date(`${String(value).trim()}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseTimeRange(range) {
  const value = String(range || "7_days").toLowerCase();
  if (["7_days", "30_days", "90_days", "this_month", "this_year", "custom"].includes(value)) {
    return value;
  }
  return "7_days";
}

function formatRangeLabel(from, to) {
  return `${from.toLocaleDateString("en-IN", { day: "2-digit", month: "short" })} - ${addDays(to, -1).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}`;
}

function getBucketForSpan(days) {
  if (days > 180) return "month";
  if (days > 45) return "week";
  return "day";
}

function getRangeConfig(range, now, startDate, endDate) {
  const todayStart = startOfDay(now);
  const tomorrowStart = endOfDay(now);
  const customStart = parseDateInput(startDate);
  const customEnd = parseDateInput(endDate);

  if (customStart && customEnd && customEnd >= customStart) {
    const from = startOfDay(customStart);
    const to = endOfDay(customEnd);
    const totalDays = Math.max(1, Math.round((to - from) / (1000 * 60 * 60 * 24)));
    return {
      key: "custom",
      label: formatRangeLabel(from, to),
      from,
      to,
      bucket: getBucketForSpan(totalDays),
      comparisonSize: totalDays,
    };
  }

  switch (parseTimeRange(range)) {
    case "30_days":
      return {
        key: "30_days",
        label: "Last 30 Days",
        from: addDays(todayStart, -29),
        to: tomorrowStart,
        bucket: "day",
        comparisonSize: 30,
      };
    case "90_days":
      return {
        key: "90_days",
        label: "Last 90 Days",
        from: addDays(todayStart, -89),
        to: tomorrowStart,
        bucket: "week",
        comparisonSize: 90,
      };
    case "this_month":
      return {
        key: "this_month",
        label: "This Month",
        from: new Date(now.getFullYear(), now.getMonth(), 1),
        to: tomorrowStart,
        bucket: "day",
        comparisonSize: now.getDate(),
      };
    case "this_year":
      return {
        key: "this_year",
        label: "This Year",
        from: new Date(now.getFullYear(), 0, 1),
        to: tomorrowStart,
        bucket: "month",
        comparisonSize: now.getMonth() + 1,
      };
    case "7_days":
    default:
      return {
        key: "7_days",
        label: "Last 7 Days",
        from: addDays(todayStart, -6),
        to: tomorrowStart,
        bucket: "day",
        comparisonSize: 7,
      };
  }
}

function getPeriodStart(date, bucket) {
  if (bucket === "month") return new Date(date.getFullYear(), date.getMonth(), 1);
  if (bucket === "week") {
    const day = date.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    return startOfDay(addDays(date, diff));
  }
  return startOfDay(date);
}

function shiftPeriod(date, bucket, amount) {
  if (bucket === "month") return addMonths(date, amount);
  if (bucket === "week") return addDays(date, amount * 7);
  return addDays(date, amount);
}

function formatBucketLabel(date, bucket) {
  if (bucket === "month") return date.toLocaleDateString("en-IN", { month: "short" });
  if (bucket === "week") {
    const end = addDays(date, 6);
    return `${date.toLocaleDateString("en-IN", { day: "numeric", month: "short" })} - ${end.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`;
  }
  return formatShortDate(date);
}

function buildTimeSeries(orders, config, accessor) {
  const labels = [];
  const values = new Map();
  let cursor = getPeriodStart(config.from, config.bucket);

  while (cursor < config.to) {
    const label = formatBucketLabel(cursor, config.bucket);
    labels.push({ label, start: new Date(cursor) });
    values.set(label, 0);
    cursor = shiftPeriod(cursor, config.bucket, 1);
  }

  orders.forEach((order) => {
    if (order.createdAt < config.from || order.createdAt >= config.to) return;
    const label = formatBucketLabel(getPeriodStart(order.createdAt, config.bucket), config.bucket);
    if (values.has(label)) {
      values.set(label, number(values.get(label)) + number(accessor(order)));
    }
  });

  return labels.map(({ label }) => ({ label, value: number(values.get(label)) }));
}

function formatShortDate(date) {
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

function formatMonth(date) {
  return date.toLocaleDateString("en-IN", { month: "short" });
}

function formatMonthInput(value) {
  if (!value) return "";
  const parsed = new Date(`${value}-01T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleDateString("en-IN", { month: "short", year: "numeric" });
}

function formatCurrency(value) {
  return `₹${Math.round(number(value)).toLocaleString("en-IN")}`;
}

function toPercent(part, whole) {
  if (!whole) return 0;
  return Number(((part / whole) * 100).toFixed(1));
}

function normalizeOrderStatus(status) {
  const value = String(status || "").toLowerCase();
  if (value === "requested" || value === "waiting" || value === "pending") return "Accepted";
  if (value === "accepted") return "Accepted";
  if (value === "preparing") return "Cooking";
  if (value === "ready" || value === "cooked") return "Ready";
  if (value === "served" || value === "completed") return "Served";
  if (value === "paid") return "Paid";
  return "Accepted";
}

function statusBadge(status) {
  const value = normalizeOrderStatus(status).toLowerCase();
  if (value === "served" || value === "paid") return "green";
  if (value === "cooking" || value === "ready") return "amber";
  return "muted";
}

function buildSeriesFromMap(entries, labels) {
  return labels.map((label) => ({
    label,
    value: number(entries.get(label)),
  }));
}

function buildSummaryContext(summary) {
  const kpis = summary?.overview?.kpis || {};
  const charts = summary?.charts || {};
  const selectedRange = summary?.selectedRange || {};
  const requests = summary?.requests || {};
  const staff = summary?.staff || {};

  return {
    range: selectedRange.label,
    revenue: number(kpis.totalRevenue?.value),
    orders: number(kpis.totalOrders?.value),
    avgOrderValue: number(kpis.avgOrderValue?.value),
    uniqueCustomers: number(kpis.uniqueCustomers?.value),
    repeatRate: number(summary?.overview?.extra?.repeatRate),
    completionRate: number(summary?.overview?.extra?.completionRate),
    occupancyRate: number(summary?.overview?.extra?.tableOccupancyRate),
    busiestHour: charts.hourlyOrders?.slice().sort((a, b) => b.value - a.value)[0] || null,
    topDay: summary?.overview?.extra?.topDay || null,
    topItems: (charts.bestSellingItems || []).slice(0, 5),
    categories: (charts.categoryPerformance || []).slice(0, 5),
    statusDistribution: charts.statusDistribution || [],
    revenueSeries: (charts.revenueSeries || []).slice(-8),
    orderSeries: (charts.orderSeries || []).slice(-8),
    customerSplit: charts.customerSplit || [],
    spendBuckets: charts.spendBuckets || [],
    tableUsage: (charts.tableUsage || []).slice(0, 6),
    revenueByDayOfWeek: charts.revenueByDayOfWeek || [],
    topUpsellOpportunities: (charts.topUpsellOpportunities || []).slice(0, 5),
    topCustomers: (charts.topCustomers || []).slice(0, 3),
    pendingRequests: number(requests.pendingCount),
    recentRequests: (requests.items || []).slice(0, 5).map((item) => ({
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

function summarizeError(error) {
  const status = Number(error?.status || 0);
  const message = String(error?.message || "").trim();
  return {
    status: status || null,
    message: message || "Unknown error",
  };
}

function isRetryableGeminiError(error) {
  const status = Number(error?.status || 0);
  const message = String(error?.message || "").toLowerCase();

  return (
    status === 404 ||
    status === 429 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504 ||
    message.includes("404") ||
    message.includes("429") ||
    message.includes("500") ||
    message.includes("502") ||
    message.includes("503") ||
    message.includes("504") ||
    message.includes("quota") ||
    message.includes("rate limit") ||
    message.includes("service unavailable") ||
    message.includes("high demand") ||
    message.includes("temporarily unavailable") ||
    message.includes("timed out") ||
    message.includes("aborted")
  );
}

function logAiAttempt(scope, details) {
  const parts = [
    `[AI:${scope}]`,
    `key=${details.keyIndex}`,
    `model=${details.modelName}`,
    `stage=${details.stage}`,
  ];

  if (details.durationMs != null) parts.push(`durationMs=${details.durationMs}`);
  if (details.rawLength != null) parts.push(`rawLength=${details.rawLength}`);
  if (details.retryable != null) parts.push(`retryable=${details.retryable}`);
  if (details.reason) parts.push(`reason=${details.reason}`);
  if (details.status != null) parts.push(`status=${details.status}`);

  console.log(parts.join(" "));
}

async function generateGeminiText(prompt) {
  if (!geminiClients.length) return null;
  return generateGeminiJsonText(prompt);
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

async function generateGeminiJsonText(prompt) {
  if (!geminiClients.length) return null;

  const maxAttempts = Math.max(4, GEMINI_MODEL_CHAIN.length * geminiClients.length);
  let attempts = 0;

  for (const modelName of GEMINI_MODEL_CHAIN) {
    for (let clientIndex = 0; clientIndex < geminiClients.length; clientIndex += 1) {
      const client = geminiClients[clientIndex];
      if (attempts >= maxAttempts) {
        console.log(`[AI:admin] final=attempt_limit_reached maxAttempts=${maxAttempts}`);
        return null;
      }

      attempts += 1;
      const startedAt = Date.now();

      try {
        logAiAttempt("admin", {
          keyIndex: clientIndex + 1,
          modelName,
          stage: "request_started",
          reason: `attempt=${attempts}/${maxAttempts}`,
        });

        const model = client.getGenerativeModel({
          model: modelName,
          generationConfig: {
            temperature: 0.4,
            maxOutputTokens: 800,
            responseMimeType: "application/json",
          },
        });

        const result = await model.generateContent(prompt);
        const raw = result?.response?.text?.() || "";
        const cleaned = extractJsonText(raw);

        logAiAttempt("admin", {
          keyIndex: clientIndex + 1,
          modelName,
          stage: "response_received",
          durationMs: Date.now() - startedAt,
          rawLength: raw.length,
        });

        if (cleaned) {
          return cleaned;
        }

        logAiAttempt("admin", {
          keyIndex: clientIndex + 1,
          modelName,
          stage: "parse_failed",
          durationMs: Date.now() - startedAt,
          reason: "empty_json_text",
        });
      } catch (error) {
        const retryable = isRetryableGeminiError(error);
        const summary = summarizeError(error);

        logAiAttempt("admin", {
          keyIndex: clientIndex + 1,
          modelName,
          stage: "request_failed",
          durationMs: Date.now() - startedAt,
          retryable,
          status: summary.status,
          reason: summary.message,
        });

        if (!retryable) {
          throw error;
        }

        const wait = Math.min(800 * 2 ** Math.floor((attempts - 1) / 2), 10000);
        await sleep(wait);
      }
    }
  }

  return null;
}

function buildFallbackInsightPayload(summary) {
  const selectedRange = summary.selectedRange?.label || "Selected range";
  const bestDay = [...(summary.charts.revenueSeries || [])].sort((a, b) => b.value - a.value)[0];
  const firstTime = summary.charts.customerSplit.find((item) => item.name === "First-time")?.value || 0;
  const returning = summary.charts.customerSplit.find((item) => item.name === "Returning")?.value || 0;
  const beverageShare = summary.charts.categoryPerformance.find((item) => item.name === "Beverages")?.value || 0;
  const dessertShare = summary.charts.categoryPerformance.find((item) => item.name === "Desserts")?.value || 0;
  const repeatRate = summary.overview?.extra?.repeatRate || 0;

  const strengths = [];
  const concerns = [];
  const actions = [];

  if (bestDay?.value) strengths.push(`${bestDay.label} led revenue with ${formatCurrency(bestDay.value)} in ${selectedRange.toLowerCase()}.`);
  if (summary.overview.kpis.totalRevenue.deltaVsPreviousPeriod >= 0) strengths.push(`Revenue is up ${summary.overview.kpis.totalRevenue.deltaVsPreviousPeriod}% versus the previous period.`);
  if (firstTime > returning) concerns.push(`New customer mix is high at ${firstTime}%, while returning customers are ${returning}%.`);
  if (repeatRate < 40) concerns.push(`Repeat rate is only ${repeatRate}% for the selected range.`);
  if (dessertShare < 15) concerns.push(`Desserts contribute just ${dessertShare}% of category revenue.`);

  if (beverageShare < 20) {
    actions.push("Increase beverage upsell prompts during peak meal hours.");
  } else {
    actions.push("Target first-time guests with a bounce-back offer to improve repeat visits.");
  }

  return {
    summary: `${strengths[0] || `${selectedRange} performance is stable.`} ${concerns[0] || "No major operational risk stands out right now."} ${actions[0] || "Keep monitoring repeat rate and category mix."}`,
    chips: [
      selectedRange,
      bestDay?.value ? `${bestDay.label} peak` : null,
      `${firstTime}% first-time`,
      `${returning}% returning`,
      `${repeatRate}% repeat rate`,
      `${beverageShare}% beverage share`,
    ].filter(Boolean),
    actions: actions.slice(0, 3),
  };
}

async function buildInsightPayload(summary) {
  const fallback = buildFallbackInsightPayload(summary);

  try {
    const context = buildSummaryContext(summary);
    const prompt = `
You are Nova, SmartDine's AI business analyst for the admin dashboard.
Analyze the selected dashboard range and respond ONLY with valid JSON. No markdown. No backticks.

Schema:
{
  "summary": "string",
  "chips": ["string"],
  "actions": ["string"]
}

Rules:
- Summary must be under 80 words and mention the most important business trend.
- Chips must be short metric callouts that a dashboard can display directly.
- Actions must be practical and specific for a restaurant manager.
- Use only the provided data.
- If data is limited, still answer using what is available.

Dashboard context:
${JSON.stringify(context, null, 2)}
`;

    const raw = await generateGeminiText(prompt);
    if (!raw) return fallback;

    const parsed = JSON.parse(extractJsonText(raw));
    return {
      summary: String(parsed.summary || fallback.summary),
      chips: Array.isArray(parsed.chips) ? parsed.chips.slice(0, 6).map((item) => String(item)) : fallback.chips,
      actions: Array.isArray(parsed.actions) ? parsed.actions.slice(0, 4).map((item) => String(item)) : fallback.actions,
    };
  } catch (error) {
    console.error("Falling back to rule-based admin insights:", error.message);
    return fallback;
  }
}

async function buildChatReply(summary, question, history = []) {
  const cleanQuestion = String(question || "").trim();
  if (!cleanQuestion) {
    return { answer: "Ask about revenue, customer mix, busy hours, table usage, or best-selling items." };
  }

  const fallback = {
    answer: `For ${summary.selectedRange.label.toLowerCase()}, revenue is ${formatCurrency(summary.overview.kpis.totalRevenue.value)} across ${summary.overview.kpis.totalOrders.value} orders, with an average order value of ${formatCurrency(summary.overview.kpis.avgOrderValue.value)}.`,
    suggestedPrompts: [
      "Which hours are busiest?",
      "What should we improve first?",
      "Which items are driving sales?",
    ],
  };

  try {
    const prompt = `
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
- Suggested prompts should be useful follow-up business questions.

Dashboard context:
${JSON.stringify(buildSummaryContext(summary), null, 2)}

Recent chat history:
${JSON.stringify(history.slice(-6), null, 2)}

User question:
${cleanQuestion}
`;

    const raw = await generateGeminiText(prompt);
    if (!raw) return fallback;

    const parsed = JSON.parse(extractJsonText(raw));
    return {
      answer: String(parsed.answer || fallback.answer),
      suggestedPrompts: Array.isArray(parsed.suggestedPrompts)
        ? parsed.suggestedPrompts.slice(0, 4).map((item) => String(item))
        : fallback.suggestedPrompts,
    };
  } catch (error) {
    console.error("Falling back to rule-based admin insight chat:", error.message);
    return fallback;
  }
}
async function buildDashboardSummary(timeRange = "7_days", startDate, endDate) {
  const [
    paidOrders,
    liveOrders,
    menuItems,
    requests,
    users,
    waiters,
    cooks,
    feedbacks,
    tables,
    payrollPayments,
  ] = await Promise.all([
    PreviousOrder.find({}).lean(),
    Order.find({}).lean(),
    MenuItem.find({}).lean(),
    Request.find({}).sort({ createdAt: -1 }).lean(),
    User.find({}).sort({ createdAt: -1 }).lean(),
    Waiter.find({}).sort({ createdAt: -1 }).lean(),
    Cook.find({}).sort({ createdAt: -1 }).lean(),
    Feedback.find({}).sort({ createdAt: -1 }).lean(),
    Table.find({}).sort({ number: 1 }).lean(),
    PayrollPayment.find({}).sort({ createdAt: -1 }).limit(20).lean(),
  ]);

  const menuLookup = new Map(
    menuItems.map((item) => [
      String(item.name || "").trim().toLowerCase(),
      {
        price: number(item.price),
        category: String(item.category || "uncategorized"),
        description: String(item.description || ""),
      },
    ])
  );

  const salesOrders = paidOrders.map((order) => ({
    ...order,
    source: "paid",
    totalCost: number(order.totalCost),
    createdAt: getOrderDate(order),
  }));

  const operationalOrders = liveOrders.map((order) => ({
    ...order,
    source: "live",
    totalCost: number(order.totalCost),
    createdAt: getOrderDate(order),
  }));

  const allOrders = [...salesOrders, ...operationalOrders];

  const now = new Date();
  const todayStart = startOfDay(now);
  const tomorrowStart = endOfDay(now);
  const rangeConfig = getRangeConfig(timeRange, now, startDate, endDate);
  const previousRangeFrom = addDays(rangeConfig.from, -rangeConfig.comparisonSize);
  const previousRangeTo = rangeConfig.from;
  const currentWeekStart = addDays(todayStart, -6);
  const previousWeekStart = addDays(currentWeekStart, -7);
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const currentYearStart = new Date(now.getFullYear(), 0, 1);

  const selectedOrders = salesOrders.filter((order) => order.createdAt >= rangeConfig.from && order.createdAt < rangeConfig.to);
  const previousSelectedOrders = salesOrders.filter((order) => order.createdAt >= previousRangeFrom && order.createdAt < previousRangeTo);
  const currentWeekOrders = salesOrders.filter((order) => order.createdAt >= currentWeekStart && order.createdAt < tomorrowStart);
  const previousWeekOrders = salesOrders.filter((order) => order.createdAt >= previousWeekStart && order.createdAt < currentWeekStart);
  const monthOrders = salesOrders.filter((order) => order.createdAt >= currentMonthStart && order.createdAt < tomorrowStart);
  const yearOrders = salesOrders.filter((order) => order.createdAt >= currentYearStart && order.createdAt < tomorrowStart);
  const todayOrders = allOrders.filter((order) => order.createdAt >= todayStart && order.createdAt < tomorrowStart);

  const totalRevenue = selectedOrders.reduce((sum, order) => sum + number(order.totalCost), 0);
  const previousPeriodRevenue = previousSelectedOrders.reduce((sum, order) => sum + number(order.totalCost), 0);
  const totalOrders = selectedOrders.length;
  const previousPeriodOrderCount = previousSelectedOrders.length;
  const avgOrderValue = totalOrders ? totalRevenue / totalOrders : 0;
  const previousPeriodAov = previousPeriodOrderCount
    ? previousPeriodRevenue / previousPeriodOrderCount
    : 0;

  const customerStats = new Map();
  selectedOrders.forEach((order) => {
    const email = normalizeEmail(order.userEmail);
    if (!email) return;
    const current = customerStats.get(email) || { orders: 0, revenue: 0, name: "", phone: "" };
    current.orders += 1;
    current.revenue += number(order.totalCost);
    customerStats.set(email, current);
  });

  const previousCustomerSet = new Set(
    previousSelectedOrders.map((order) => normalizeEmail(order.userEmail)).filter(Boolean)
  );

  let firstTimeCustomers = 0;
  let returningCustomers = 0;
  [...customerStats.keys()].forEach((email) => {
    if (previousCustomerSet.has(email) || customerStats.get(email).orders > 1) returningCustomers += 1;
    else firstTimeCustomers += 1;
  });
  const uniqueCustomers = customerStats.size;

  const prevUniqueCustomers = new Set(
    previousSelectedOrders.map((order) => normalizeEmail(order.userEmail)).filter(Boolean)
  ).size;

  const revenueDelta = previousPeriodRevenue
    ? Number((((totalRevenue - previousPeriodRevenue) / previousPeriodRevenue) * 100).toFixed(1))
    : totalRevenue > 0 ? 100 : 0;
  const orderDelta = previousPeriodOrderCount
    ? Number((((totalOrders - previousPeriodOrderCount) / previousPeriodOrderCount) * 100).toFixed(1))
    : totalOrders > 0 ? 100 : 0;
  const aovDelta = previousPeriodAov
    ? Number((((avgOrderValue - previousPeriodAov) / previousPeriodAov) * 100).toFixed(1))
    : avgOrderValue > 0 ? 100 : 0;
  const uniqueCustomerDelta = prevUniqueCustomers
    ? Number((((uniqueCustomers - prevUniqueCustomers) / prevUniqueCustomers) * 100).toFixed(1))
    : uniqueCustomers > 0 ? 100 : 0;

  const revenueWeekLabels = [];
  for (let i = 0; i < 7; i += 1) {
    revenueWeekLabels.push(formatShortDate(addDays(currentWeekStart, i)));
  }
  const revenueWeekMap = new Map(revenueWeekLabels.map((label) => [label, 0]));
  currentWeekOrders.forEach((order) => {
    const label = formatShortDate(order.createdAt);
    revenueWeekMap.set(label, number(revenueWeekMap.get(label)) + number(order.totalCost));
  });
  const revenueWeek = buildSeriesFromMap(revenueWeekMap, revenueWeekLabels);
  const revenueSeries = buildTimeSeries(selectedOrders, rangeConfig, (order) => order.totalCost);
  const orderSeries = buildTimeSeries(selectedOrders, rangeConfig, () => 1);

  const itemStats = new Map();
  const categoryStats = new Map();
  const todayTableStats = new Map();

  selectedOrders.forEach((order) => {
    const items = Array.isArray(order.items) ? order.items : [];

    items.forEach((item) => {
      const name = getItemName(item);
      if (!name) return;
      const qty = getItemQuantity(item);
      const lookup = menuLookup.get(name.toLowerCase()) || { price: 0, category: "uncategorized" };
      const amount = qty * number(lookup.price);

      const currentItem = itemStats.get(name) || { name, quantity: 0, revenue: 0, category: lookup.category };
      currentItem.quantity += qty;
      currentItem.revenue += amount;
      itemStats.set(name, currentItem);

      categoryStats.set(lookup.category, number(categoryStats.get(lookup.category)) + amount);
    });
  });

  allOrders.forEach((order) => {
    if (order.createdAt >= todayStart && order.createdAt < tomorrowStart && order.tableNo) {
      todayTableStats.set(order.tableNo, number(todayTableStats.get(order.tableNo)) + 1);
    }
  });

  const bestSellingItems = [...itemStats.values()]
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 7)
    .map((item) => ({ name: item.name, value: item.quantity }));

  const totalCategoryRevenue = [...categoryStats.values()].reduce((sum, value) => sum + number(value), 0);
  const categoryPerformance = [...categoryStats.entries()]
    .map(([name, value]) => ({
      name: name.charAt(0).toUpperCase() + name.slice(1),
      value: Number(toPercent(value, totalCategoryRevenue).toFixed(1)),
      revenue: number(value),
    }))
    .sort((a, b) => b.value - a.value);

  const quantityByCategory = new Map();
  [...itemStats.values()].forEach((item) => {
    quantityByCategory.set(item.category, number(quantityByCategory.get(item.category)) + item.quantity);
  });
  const totalItemQty = [...quantityByCategory.values()].reduce((sum, value) => sum + number(value), 0);
  const itemCategoryBreakdown = [...quantityByCategory.entries()]
    .map(([name, qty]) => ({
      name: name.charAt(0).toUpperCase() + name.slice(1),
      value: Number(toPercent(qty, totalItemQty).toFixed(1)),
    }))
    .sort((a, b) => b.value - a.value);

  const topUpsellOpportunities = [
    { name: "Dessert Attach Rate", value: categoryPerformance.find((item) => item.name.toLowerCase() === "desserts")?.value || 0 },
    { name: "Beverage Attach Rate", value: categoryPerformance.find((item) => item.name.toLowerCase() === "beverages")?.value || 0 },
    { name: "Combo Conversion", value: Math.min(100, Number((toPercent(totalOrders, uniqueCustomers || totalOrders) * 0.6).toFixed(1))) },
  ];

  const statusMap = new Map();
  const paidRangeOrders = allOrders.filter((order) => order.createdAt >= rangeConfig.from && order.createdAt < rangeConfig.to);
  paidRangeOrders.forEach((order) => {
    const label = normalizeOrderStatus(order.status);
    statusMap.set(label, number(statusMap.get(label)) + 1);
  });
  const statusDistribution = [...statusMap.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  const tableHeatmap = tables.map((table) => {
    const label = table.tableId || `T-${String(table.number).padStart(2, "0")}`;
    return {
      tableId: label,
      orders: number(todayTableStats.get(label) || todayTableStats.get(table.number) || 0),
      status: table.status,
    };
  });

  const monthBuckets = [];
  for (let i = -5; i <= 3; i += 1) {
    monthBuckets.push(addMonths(new Date(now.getFullYear(), now.getMonth(), 1), i));
  }
  const revenueByMonth = new Map(monthBuckets.map((date) => [`${date.getFullYear()}-${date.getMonth()}`, 0]));
  salesOrders.forEach((order) => {
    const key = `${order.createdAt.getFullYear()}-${order.createdAt.getMonth()}`;
    if (revenueByMonth.has(key)) {
      revenueByMonth.set(key, number(revenueByMonth.get(key)) + number(order.totalCost));
    }
  });
  const recentActualValues = monthBuckets.slice(0, 6).map((date) => number(revenueByMonth.get(`${date.getFullYear()}-${date.getMonth()}`)));
  const recentGrowth = recentActualValues.length >= 2
    ? recentActualValues.slice(1).reduce((sum, value, index) => {
        const previous = recentActualValues[index] || 1;
        return sum + ((value - previous) / previous);
      }, 0) / Math.max(1, recentActualValues.length - 1)
    : 0.08;
  let forecastBase = recentActualValues[recentActualValues.length - 1] || totalRevenue || 10000;
  const revenueTrend = monthBuckets.map((date, index) => {
    const label = formatMonth(date);
    const actual = index < 6 ? number(revenueByMonth.get(`${date.getFullYear()}-${date.getMonth()}`)) : null;
    let forecast = null;
    if (index >= 6) {
      forecastBase = forecastBase * (1 + Math.max(0.02, Math.min(recentGrowth || 0.08, 0.18)));
      forecast = Math.round(forecastBase);
    }
    return { label, actual, forecast };
  });

  const hourlyMap = new Map(Array.from({ length: 24 }, (_, hour) => [hour, 0]));
  paidRangeOrders.forEach((order) => {
    const hour = order.createdAt.getHours();
    hourlyMap.set(hour, number(hourlyMap.get(hour)) + 1);
  });
  const hourlyOrders = [...hourlyMap.entries()]
    .filter(([, count]) => count > 0)
    .map(([hour, value]) => ({ label: `${String(hour).padStart(2, "0")}:00`, value }));

  const thisWeekMetrics = {
    revenue: currentWeekOrders.reduce((sum, order) => sum + number(order.totalCost), 0),
    orders: currentWeekOrders.length,
    avgValue: currentWeekOrders.length ? currentWeekOrders.reduce((sum, order) => sum + number(order.totalCost), 0) / currentWeekOrders.length : 0,
    newCustomers: firstTimeCustomers,
    retention: returningCustomers,
    tableTurns: tableHeatmap.reduce((sum, table) => sum + table.orders, 0),
  };
  const lastWeekMetrics = {
    revenue: previousWeekOrders.reduce((sum, order) => sum + number(order.totalCost), 0),
    orders: previousWeekOrders.length,
    avgValue: previousWeekOrders.length ? previousWeekOrders.reduce((sum, order) => sum + number(order.totalCost), 0) / previousWeekOrders.length : 0,
    newCustomers: Math.max(0, prevUniqueCustomers - returningCustomers),
    retention: prevUniqueCustomers,
    tableTurns: previousWeekOrders.length,
  };
  const metricMax = Math.max(
    ...Object.values(thisWeekMetrics),
    ...Object.values(lastWeekMetrics),
    1
  );
  const performanceRadar = [
    { name: "Revenue", thisWeek: Math.round((thisWeekMetrics.revenue / metricMax) * 100), lastWeek: Math.round((lastWeekMetrics.revenue / metricMax) * 100) },
    { name: "Orders", thisWeek: Math.round((thisWeekMetrics.orders / metricMax) * 100), lastWeek: Math.round((lastWeekMetrics.orders / metricMax) * 100) },
    { name: "Avg Value", thisWeek: Math.round((thisWeekMetrics.avgValue / metricMax) * 100), lastWeek: Math.round((lastWeekMetrics.avgValue / metricMax) * 100) },
    { name: "New Customers", thisWeek: Math.round((thisWeekMetrics.newCustomers / metricMax) * 100), lastWeek: Math.round((lastWeekMetrics.newCustomers / metricMax) * 100) },
    { name: "Retention", thisWeek: Math.round((thisWeekMetrics.retention / metricMax) * 100), lastWeek: Math.round((lastWeekMetrics.retention / metricMax) * 100) },
    { name: "Table Turns", thisWeek: Math.round((thisWeekMetrics.tableTurns / metricMax) * 100), lastWeek: Math.round((lastWeekMetrics.tableTurns / metricMax) * 100) },
  ];

  const ratingAverages = feedbacks.reduce(
    (acc, feedback) => {
      const ratings = feedback.ratings || {};
      const foodQuality = number(ratings.foodQuality);
      const serviceSpeed = number(ratings.serviceSpeed || ratings.overall);
      const ambience = number(ratings.ambience);
      const value = number(ratings.value || ratings.overall);
      if (foodQuality) { acc.foodQuality.total += foodQuality; acc.foodQuality.count += 1; }
      if (serviceSpeed) { acc.serviceSpeed.total += serviceSpeed; acc.serviceSpeed.count += 1; }
      if (ambience) { acc.ambience.total += ambience; acc.ambience.count += 1; }
      if (value) { acc.value.total += value; acc.value.count += 1; }
      return acc;
    },
    {
      foodQuality: { total: 0, count: 0 },
      serviceSpeed: { total: 0, count: 0 },
      ambience: { total: 0, count: 0 },
      value: { total: 0, count: 0 },
    }
  );

  const ratings = [
    { name: "Food Quality", value: Number(((ratingAverages.foodQuality.total / (ratingAverages.foodQuality.count || 1)) || 4.7).toFixed(1)) },
    { name: "Service Speed", value: Number(((ratingAverages.serviceSpeed.total / (ratingAverages.serviceSpeed.count || 1)) || 4.3).toFixed(1)) },
    { name: "Ambience", value: Number(((ratingAverages.ambience.total / (ratingAverages.ambience.count || 1)) || 4.5).toFixed(1)) },
    { name: "Value", value: Number(((ratingAverages.value.total / (ratingAverages.value.count || 1)) || 4.1).toFixed(1)) },
  ];

  const recentOrders = operationalOrders
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 10)
    .map((order) => ({
      id: order._id,
      orderId: `#ORD-${String(order._id).slice(-4).toUpperCase()}`,
      customerName: users.find((user) => normalizeEmail(user.email) === normalizeEmail(order.userEmail))?.name || order.userEmail || "Guest",
      userEmail: order.userEmail,
      tableNo: order.tableNo || "Walk-in",
      items: (Array.isArray(order.items) ? order.items : []).map(getItemName).filter(Boolean),
      amount: number(order.totalCost),
      status: normalizeOrderStatus(order.status),
      statusTone: statusBadge(order.status),
      createdAt: order.createdAt,
    }));

  const tableUsage = [...allOrders.reduce((acc, order) => {
    const table = order.tableNo || "Unknown";
    acc.set(table, number(acc.get(table)) + 1);
    return acc;
  }, new Map()).entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  const dayOfWeekOrderMap = new Map(["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => [day, 0]));
  selectedOrders.forEach((order) => {
    const label = order.createdAt.toLocaleDateString("en-IN", { weekday: "short" });
    dayOfWeekOrderMap.set(label, number(dayOfWeekOrderMap.get(label)) + number(order.totalCost));
  });
  const revenueByDayOfWeek = [...dayOfWeekOrderMap.entries()].map(([label, value]) => ({ label, value }));

  const repeatRate = Number(toPercent(returningCustomers, uniqueCustomers).toFixed(1));
  const completionRate = Number(toPercent(
    paidRangeOrders.filter((order) => ["Served", "Paid"].includes(normalizeOrderStatus(order.status))).length,
    paidRangeOrders.length
  ).toFixed(1));
  const occupiedTables = tables.filter((table) => table.status === "occupied").length;
  const tableOccupancyRate = Number(toPercent(occupiedTables, tables.length).toFixed(1));

  const userLookup = new Map(users.map((user) => [normalizeEmail(user.email), user]));
  const customerRows = users.map((user) => {
    const email = normalizeEmail(user.email);
    const relatedOrders = salesOrders.filter((order) => normalizeEmail(order.userEmail) === email);
    const totalSpent = relatedOrders.reduce((sum, order) => sum + number(order.totalCost), 0);
    const orderCount = relatedOrders.length;
    const lastOrder = relatedOrders.length ? relatedOrders.sort((a, b) => b.createdAt - a.createdAt)[0].createdAt : null;
    const isReturning = orderCount > 1 || previousCustomerSet.has(email);
    return {
      id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      orders: orderCount,
      totalSpent,
      avgOrderValue: orderCount ? Number((totalSpent / orderCount).toFixed(0)) : 0,
      type: isReturning ? "Returning" : "First-time",
      lastOrderAt: lastOrder,
      createdAt: user.createdAt,
    };
  });

  const topCustomers = customerRows
    .filter((user) => user.totalSpent > 0)
    .sort((a, b) => b.totalSpent - a.totalSpent)
    .slice(0, 7)
    .map((user) => ({
      name: user.name || user.email || "Guest",
      email: user.email,
      orders: user.orders,
      totalSpent: user.totalSpent,
      avgOrderValue: user.avgOrderValue,
    }));

  const spendBuckets = [
    { name: "Below 500", min: 0, max: 500 },
    { name: "500 - 1499", min: 500, max: 1500 },
    { name: "1500 - 2999", min: 1500, max: 3000 },
    { name: "3000+", min: 3000, max: Number.MAX_SAFE_INTEGER },
  ].map((bucket) => ({
    name: bucket.name,
    value: customerRows.filter((user) => user.totalSpent >= bucket.min && user.totalSpent < bucket.max).length,
  }));

  const staff = {
    waiters: waiters.map((person) => ({
      id: person._id,
      name: person.name,
      email: person.email || "",
      phone: person.phone,
      role: "waiter",
      salary: number(person.salary),
      joinedAt: person.createdAt,
      employmentStatus: String(person.employmentStatus || "active").toLowerCase(),
    })),
    cooks: cooks.map((person) => ({
      id: person._id,
      name: person.name,
      email: person.email || "",
      phone: person.phone,
      role: "cook",
      salary: number(person.salary),
      joinedAt: person.createdAt,
      employmentStatus: String(person.employmentStatus || "active").toLowerCase(),
    })),
  };

  const payroll = payrollPayments.map((payment) => ({
    id: payment._id,
    staffId: payment.staffId,
    staffRole: payment.staffRole,
    staffName: payment.staffName,
    amount: number(payment.amount),
    month: payment.month,
    monthLabel: formatMonthInput(payment.month),
    method: payment.method,
    note: payment.note || "",
    createdAt: payment.createdAt,
  }));

  const topDay = [...revenueSeries].sort((a, b) => b.value - a.value)[0] || null;
  const busiestHour = [...hourlyOrders].sort((a, b) => b.value - a.value)[0] || null;

  const summary = {
    generatedAt: now.toISOString(),
    dateLabel: now.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }),
    selectedRange: {
      key: rangeConfig.key,
      label: rangeConfig.label,
      from: rangeConfig.from.toISOString(),
      to: addDays(rangeConfig.to, -1).toISOString(),
    },
    overview: {
      kpis: {
        totalRevenue: { value: Math.round(totalRevenue), deltaVsPreviousPeriod: revenueDelta },
        totalOrders: { value: totalOrders, deltaVsPreviousPeriod: orderDelta },
        avgOrderValue: { value: Math.round(avgOrderValue), deltaVsPreviousPeriod: aovDelta },
        uniqueCustomers: { value: uniqueCustomers, deltaVsPreviousPeriod: uniqueCustomerDelta },
      },
      extra: {
        repeatRate,
        completionRate,
        tableOccupancyRate,
        topDay: topDay?.label || "N/A",
        topHour: busiestHour?.label || "N/A",
      },
      snapshots: {
        last7Days: {
          revenue: Math.round(currentWeekOrders.reduce((sum, order) => sum + number(order.totalCost), 0)),
          orders: currentWeekOrders.length,
          avgOrderValue: Math.round(currentWeekOrders.length ? totalRevenue / currentWeekOrders.length : 0),
        },
        thisMonth: {
          revenue: Math.round(monthOrders.reduce((sum, order) => sum + number(order.totalCost), 0)),
          orders: monthOrders.length,
          avgOrderValue: Math.round(monthOrders.length ? monthOrders.reduce((sum, order) => sum + number(order.totalCost), 0) / monthOrders.length : 0),
        },
        thisYear: {
          revenue: Math.round(yearOrders.reduce((sum, order) => sum + number(order.totalCost), 0)),
          orders: yearOrders.length,
          avgOrderValue: Math.round(yearOrders.length ? yearOrders.reduce((sum, order) => sum + number(order.totalCost), 0) / yearOrders.length : 0),
        },
      },
    },
    charts: {
      revenueWeek,
      revenueSeries,
      orderSeries,
      customerSplit: [
        { name: "First-time", value: Number(toPercent(firstTimeCustomers, uniqueCustomers).toFixed(1)) },
        { name: "Returning", value: Number(toPercent(returningCustomers, uniqueCustomers).toFixed(1)) },
      ],
      bestSellingItems,
      categoryPerformance,
      itemCategoryBreakdown,
      topUpsellOpportunities,
      tableHeatmap,
      revenueTrend,
      hourlyOrders,
      performanceRadar,
      ratings,
      tableUsage,
      revenueByDayOfWeek,
      statusDistribution,
      spendBuckets,
      topCustomers,
    },
    requests: {
      pendingCount: requests.filter((request) => String(request.status || "pending").toLowerCase() === "pending").length,
      items: requests.map((request) => ({
        id: request._id,
        type: request.type,
        name: request.name,
        category: request.category,
        price: request.price,
        notes: request.notes,
        requestedBy: request.requestedBy,
        status: request.status,
        createdAt: request.createdAt,
      })),
    },
    recentOrders,
    staff,
    payroll,
    users: {
      segmentCounts: {
        all: customerRows.length,
        firstTime: customerRows.filter((user) => user.type === "First-time").length,
        returning: customerRows.filter((user) => user.type === "Returning").length,
        highValue: customerRows.filter((user) => user.totalSpent >= 3000).length,
      },
      items: customerRows.sort((a, b) => b.totalSpent - a.totalSpent),
    },
    menu: {
      totalItems: menuItems.length,
      items: menuItems.map((item) => ({
        id: item._id,
        name: item.name,
        category: item.category,
        price: number(item.price),
        description: item.description || "",
      })),
    },
    meta: {
      totalLiveOrders: operationalOrders.length,
      totalPaidOrders: salesOrders.length,
      totalTables: tables.length,
      occupiedTables: tables.filter((table) => table.status === "occupied").length,
      openRequests: requests.length,
      totalUsers: users.length,
    },
  };

  summary.insights = await buildInsightPayload(summary);
  return summary;
}

router.get("/", async (req, res) => {
  try {
    const summary = await buildDashboardSummary(req.query.timeRange, req.query.startDate, req.query.endDate);
    return res.json(summary);
  } catch (error) {
    console.error("Failed to build admin dashboard summary:", error);
    return res.status(500).json({ message: "Failed to load admin dashboard summary" });
  }
});

router.get("/summary", async (req, res) => {
  try {
    const summary = await buildDashboardSummary(req.query.timeRange, req.query.startDate, req.query.endDate);
    return res.json(summary);
  } catch (error) {
    console.error("Failed to build admin dashboard summary:", error);
    return res.status(500).json({ message: "Failed to load admin dashboard summary" });
  }
});

router.get("/orders/recent", async (req, res) => {
  try {
    const summary = await buildDashboardSummary(req.query.timeRange, req.query.startDate, req.query.endDate);
    return res.json({ items: summary.recentOrders });
  } catch (error) {
    console.error("Failed to load recent admin orders:", error);
    return res.status(500).json({ message: "Failed to load recent orders" });
  }
});

router.get("/insights", async (req, res) => {
  try {
    const summary = await buildDashboardSummary(req.query.timeRange, req.query.startDate, req.query.endDate);
    return res.json(summary.insights);
  } catch (error) {
    console.error("Failed to build admin insights:", error);
    return res.status(500).json({ message: "Failed to generate insights" });
  }
});

router.post("/insights/chat", async (req, res) => {
  try {
    const { question, history, timeRange, startDate, endDate } = req.body || {};
    const summary = await buildDashboardSummary(timeRange, startDate, endDate);
    const reply = await buildChatReply(summary, question, Array.isArray(history) ? history : []);
    return res.json(reply);
  } catch (error) {
    console.error("Failed to answer admin insight chat:", error);
    return res.status(500).json({ message: "Failed to answer insight question" });
  }
});

router.post("/payroll/pay", async (req, res) => {
  try {
    const { staffId, amount, month, method, note } = req.body;
    if (!staffId || !amount || !month) {
      return res.status(400).json({ message: "staffId, amount, and month are required" });
    }

    let staffRole = "waiter";
    let staff = await Waiter.findById(staffId);
    if (!staff) {
      staff = await Cook.findById(staffId);
      staffRole = "cook";
    }

    if (!staff) {
      return res.status(404).json({ message: "Staff member not found" });
    }

    const payment = await PayrollPayment.create({
      staffId: staff._id,
      staffRole,
      staffName: staff.name,
      amount: number(amount),
      month: String(month),
      method: String(method || "Cash"),
      note: String(note || ""),
      paidBy: req.user?.email || req.user?.name || "admin",
    });

    return res.status(201).json({
      message: "Payroll payment recorded",
      payment: {
        id: payment._id,
        staffId: payment.staffId,
        staffRole: payment.staffRole,
        staffName: payment.staffName,
        amount: payment.amount,
        month: payment.month,
        method: payment.method,
        note: payment.note,
        createdAt: payment.createdAt,
      },
    });
  } catch (error) {
    console.error("Failed to record payroll payment:", error);
    return res.status(500).json({ message: "Failed to record payroll payment" });
  }
});

router.get("/payroll", async (_req, res) => {
  try {
    const payments = await PayrollPayment.find({}).sort({ createdAt: -1 }).limit(50).lean();
    return res.json({
      items: payments.map((payment) => ({
        id: payment._id,
        staffId: payment.staffId,
        staffRole: payment.staffRole,
        staffName: payment.staffName,
        amount: number(payment.amount),
        month: payment.month,
        monthLabel: formatMonthInput(payment.month),
        method: payment.method,
        note: payment.note || "",
        createdAt: payment.createdAt,
      })),
    });
  } catch (error) {
    console.error("Failed to fetch payroll history:", error);
    return res.status(500).json({ message: "Failed to fetch payroll history" });
  }
});

router.delete("/staff/:role/:id", async (req, res) => {
  try {
    const role = String(req.params.role || "").toLowerCase();
    const Model = role === "waiter" ? Waiter : role === "cook" ? Cook : null;

    if (!Model) {
      return res.status(400).json({ message: "role must be waiter or cook" });
    }

    const deleted = await Model.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ message: "Staff member not found" });
    }

    return res.json({ message: `${role} removed successfully` });
  } catch (error) {
    console.error("Failed to remove staff member:", error);
    return res.status(500).json({ message: "Failed to remove staff member" });
  }
});

module.exports = router;

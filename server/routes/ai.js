const express = require("express");
const router = express.Router();
const MenuItem = require("../models/MenuItem");
const Order = require("../models/Order");
const PreviousOrder = require("../models/PreviousOrder");
const Feedback = require("../models/Feedback");
const auth = require("../middleware/auth");
const { GoogleGenerativeAI } = require("@google/generative-ai");

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

function getPositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const AI_REQUEST_TIMEOUT_MS = getPositiveInt(process.env.AI_REQUEST_TIMEOUT_MS, 8000);
const AI_MAX_MODEL_ATTEMPTS = getPositiveInt(process.env.AI_MAX_MODEL_ATTEMPTS, 4);
const ASSISTANT_TEMPERATURE = Number.isFinite(Number(process.env.AI_ASSISTANT_TEMPERATURE))
  ? Number(process.env.AI_ASSISTANT_TEMPERATURE)
  : 0.35;
const RESTAURANT_CONTEXT = String(
  process.env.RESTAURANT_CONTEXT ||
  "SmartDine is a modern restaurant. Speak like a polite, attentive floor waiter: warm, lightly playful, upbeat, brief, and helpful. Be friendly and a little jolly without sounding childish or exaggerated. Never invent menu items, prices, offers, ingredients, timing, or restaurant policies that are not provided."
).trim();
const DIETARY_DISCLAIMER = "I cannot give medical advice, but based on the preferences you mentioned, this may suit you better.";

function summarizeError(error) {
  const status = Number(error?.status || 0);
  const message = String(error?.message || "").trim();
  return {
    status: status || null,
    message: message || "Unknown error",
  };
}

function extractJsonText(raw, expectedType = "object") {
  const text = String(raw || "").trim();
  if (!text) return "";

  const fencedMatch =
    text.match(/```json\s*([\s\S]*?)```/i) ||
    text.match(/```\s*([\s\S]*?)```/i);

  const source = fencedMatch?.[1] ? fencedMatch[1].trim() : text;
  if (!source) return "";

  const openChar = expectedType === "array" ? "[" : "{";
  const closeChar = expectedType === "array" ? "]" : "}";
  const firstIndex = source.indexOf(openChar);
  const lastIndex = source.lastIndexOf(closeChar);

  if (firstIndex !== -1 && lastIndex !== -1 && lastIndex > firstIndex) {
    return source.slice(firstIndex, lastIndex + 1).trim();
  }

  return source;
}

function safeJsonParse(text, expectedType = "object") {
  const cleaned = extractJsonText(text, expectedType);
  if (!cleaned) return null;

  try {
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

function repairJsonText(text) {
  const cleaned = extractJsonText(text, "object");
  if (!cleaned) return "";

  return cleaned
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)(\s*:)/g, '$1"$2"$3')
    .replace(/:\s*'([^']*)'/g, ': "$1"')
    .replace(/,\s*([}\]])/g, "$1");
}

function safeJsonParseLenient(text, expectedType = "object") {
  const direct = safeJsonParse(text, expectedType);
  if (direct) return direct;

  const repaired = repairJsonText(text);
  if (!repaired) return null;

  try {
    return JSON.parse(repaired);
  } catch {
    return null;
  }
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

function normalizeMenuItems(menu) {
  return menu.map((item) => ({
    id: String(item._id),
    name: String(item.name || "").trim(),
    category: String(item.category || "other").trim(),
    price: Number(item.price) || 0,
    description: String(item.description || "").trim(),
  }));
}

function normalizeCartItems(cartItems = []) {
  if (!Array.isArray(cartItems)) return [];
  return cartItems
    .map((item) => ({
      name: String(item?.name || "").trim(),
      qty: Math.max(1, Math.min(20, Number(item?.qty) || 1)),
    }))
    .filter((item) => item.name);
}

function buildCartSummary(cartItems) {
  const totalQty = cartItems.reduce((sum, item) => sum + (Number(item.qty) || 0), 0);
  return {
    itemCount: cartItems.length,
    totalQty,
    items: cartItems.slice(0, 8).map((item) => ({
      name: item.name,
      qty: item.qty,
    })),
  };
}

function splitOrderItems(items) {
  if (!Array.isArray(items)) return [];
  return items
    .flatMap((value) => String(value || "").split(/,\s*/))
    .map((value) => value.replace(/\s*x\s*\d+$/i, "").trim())
    .filter(Boolean);
}

function buildMenuLookup(menuItems) {
  return new Map(menuItems.map((item) => [item.name.toLowerCase(), item]));
}

function normalizePlainText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function looksLikeBrokenStructuredText(value) {
  const text = String(value || "").trim();
  if (!text) return false;
  if (/^[{\[]/.test(text)) return true;
  if (/^"?message"?\s*:|^"?actions"?\s*:|^"?suggestions"?\s*:/i.test(text)) return true;
  return false;
}

function extractBudget(text) {
  const source = String(text || "").toLowerCase();
  const rsMatch = source.match(/(?:under|below|within|budget|around|less than|max(?:imum)? of?)\s*(?:rs\.?|rupees?|₹)?\s*(\d{2,5})/i);
  if (rsMatch) return Number(rsMatch[1]);
  const currencyAfterMatch = source.match(/(?:₹|rs\.?|rupees?)\s*(\d{2,5})/i);
  if (currencyAfterMatch) return Number(currencyAfterMatch[1]);
  return null;
}

function inferMenuMentions(text, menuItems) {
  const normalizedText = normalizePlainText(text);
  if (!normalizedText) return [];

  return menuItems
    .map((item) => ({ ...item, normalized: normalizePlainText(item.name) }))
    .filter((item) => item.normalized && normalizedText.includes(item.normalized))
    .sort((a, b) => b.normalized.length - a.normalized.length);
}

function buildMenuCategorySummary(menuItems) {
  const buckets = new Map();
  for (const item of menuItems) {
    const key = item.category || "other";
    const bucket = buckets.get(key) || {
      category: key,
      count: 0,
      minPrice: Number.POSITIVE_INFINITY,
      maxPrice: 0,
      samples: [],
    };
    bucket.count += 1;
    if (item.price > 0) {
      bucket.minPrice = Math.min(bucket.minPrice, item.price);
      bucket.maxPrice = Math.max(bucket.maxPrice, item.price);
    }
    if (bucket.samples.length < 3) bucket.samples.push(item.name);
    buckets.set(key, bucket);
  }

  return [...buckets.values()]
    .sort((a, b) => a.category.localeCompare(b.category))
    .map((bucket) => ({
      category: bucket.category,
      count: bucket.count,
      priceRange: bucket.minPrice === Number.POSITIVE_INFINITY
        ? "NA"
        : `Rs ${bucket.minPrice}-${bucket.maxPrice}`,
      samples: bucket.samples,
    }));
}

function dedupeMenuItems(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = String(item?.name || "").toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function classifyAssistantIntent(message, menuItems) {
  const normalized = normalizePlainText(message);
  const menuMentions = inferMenuMentions(message, menuItems);

  if (/\b(show|open|see|browse)\b.*\bmenu\b|\bfull menu\b/i.test(normalized)) return "open_menu";
  if (/\b(cart|basket|checkout|bill)\b/i.test(normalized)) return "open_cart";
  if (/\b(place order|confirm order|checkout now|order now)\b/i.test(normalized)) return "place_order";
  if (extractBudget(message)) return "budget";
  if (detectDietaryProfile(message) && Object.values(detectDietaryProfile(message)).some(Boolean)) return "dietary";
  if (menuMentions.length && /\b(add|order|want|have|get|bring|give|take|remove|delete)\b/.test(normalized)) {
    return "item_action";
  }
  if (/\b(recommend|suggest|best|what should i|what can i|top pick|chef|special)\b/.test(normalized)) return "recommendation";
  if (/\b(hi|hello|hey|yo|hola|good morning|good afternoon|good evening|thanks|thank you|awesome|great|nice|cool|love that|joke|funny|bored|surprise me|random)\b/.test(normalized)) {
    return "smalltalk";
  }
  return menuMentions.length ? "menu_query" : "general";
}

function buildRelevantMenuItems(userMessage, menuItems, cartItems) {
  const directMentions = inferMenuMentions(userMessage, menuItems);
  const budget = extractBudget(userMessage);
  const affordable = budget
    ? menuItems.filter((item) => item.price > 0 && item.price <= budget).sort((a, b) => b.price - a.price)
    : [];
  const cartRelated = cartItems
    .map((cartItem) => menuItems.find((menuItem) => menuItem.name.toLowerCase() === cartItem.name.toLowerCase()))
    .filter(Boolean);
  const featured = [...menuItems]
    .sort((a, b) => a.category.localeCompare(b.category) || a.price - b.price)
    .slice(0, 8);

  return dedupeMenuItems([
    ...directMentions,
    ...cartRelated,
    ...affordable.slice(0, 6),
    ...featured,
  ]).slice(0, 12);
}

function buildAssistantContext({
  message,
  guestName,
  guestEmail,
  tableId,
  cartItems,
  menuItems,
  currentOrders = [],
  previousOrders = [],
  feedbacks = [],
}) {
  const relevantMenuItems = buildRelevantMenuItems(message, menuItems, cartItems);
  const intent = classifyAssistantIntent(message, menuItems);
  return {
    guestName: guestName || "Guest",
    guestEmail: guestEmail || "",
    tableId: tableId || "walkin",
    message: String(message || "").trim(),
    normalizedMessage: normalizePlainText(message),
    intent,
    cart: buildCartSummary(cartItems),
    menuOverview: {
      totalItems: menuItems.length,
      categories: buildMenuCategorySummary(menuItems).slice(0, 10),
    },
    relevantMenuItems: relevantMenuItems.map((item) => ({
      name: item.name,
      category: item.category,
      price: item.price,
      description: item.description || "",
    })),
    popularity: buildPopularitySummary(menuItems, currentOrders, previousOrders),
    userHistory: buildUserHistorySummary(guestEmail, tableId, previousOrders),
    feedback: buildFeedbackSummary(feedbacks),
    mentionedItems: inferMenuMentions(message, menuItems).slice(0, 6).map((item) => item.name),
    budgets: {
      requestedBudget: extractBudget(message),
    },
    allowedActions: ["add_to_cart", "remove_from_cart", "show_menu", "open_cart", "place_order", "ask_choice"],
  };
}

function buildPopularitySummary(menuItems, currentOrders = [], previousOrders = []) {
  const counts = new Map();
  const allOrders = [...currentOrders, ...previousOrders];
  for (const order of allOrders) {
    for (const itemName of splitOrderItems(order?.items)) {
      const key = itemName.toLowerCase();
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }

  return menuItems
    .map((item) => ({
      name: item.name,
      orderCount: counts.get(item.name.toLowerCase()) || 0,
      price: item.price,
      category: item.category,
    }))
    .sort((a, b) => b.orderCount - a.orderCount || a.price - b.price)
    .slice(0, 8);
}

function buildUserHistorySummary(userEmail, tableId, previousOrders = []) {
  const normalizedEmail = String(userEmail || "").trim().toLowerCase();
  const normalizedTableId = String(tableId || "").trim();
  const matches = previousOrders.filter((order) => {
    const sameEmail = normalizedEmail && String(order.userEmail || "").trim().toLowerCase() === normalizedEmail;
    const sameTable = normalizedTableId && String(order.tableNo || "").trim() === normalizedTableId;
    return sameEmail || sameTable;
  });

  const recentOrders = matches
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
    .slice(0, 5);
  const favoriteCounts = new Map();
  for (const order of matches) {
    for (const itemName of splitOrderItems(order.items)) {
      const key = itemName.toLowerCase();
      favoriteCounts.set(key, (favoriteCounts.get(key) || 0) + 1);
    }
  }

  const favorites = [...favoriteCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 5)
    .map(([name, count]) => ({ name, count }));

  return {
    orderCount: matches.length,
    recentOrders: recentOrders.map((order) => ({
      items: splitOrderItems(order.items).slice(0, 5),
      totalCost: Number(order.totalCost) || 0,
      status: String(order.status || ""),
      createdAt: order.createdAt || null,
    })),
    favorites,
  };
}

function buildFeedbackSummary(feedbacks = []) {
  if (!feedbacks.length) {
    return {
      averageOverall: null,
      averageFoodQuality: null,
      averageServiceSpeed: null,
      recentComments: [],
    };
  }

  let overallSum = 0;
  let foodSum = 0;
  let serviceSum = 0;
  let overallCount = 0;
  let foodCount = 0;
  let serviceCount = 0;

  for (const feedback of feedbacks) {
    const ratings = feedback.ratings || {};
    const overall = Number(ratings.overall);
    const food = Number(ratings.foodQuality);
    const service = Number(ratings.serviceSpeed || ratings.overall);
    if (overall > 0) {
      overallSum += overall;
      overallCount += 1;
    }
    if (food > 0) {
      foodSum += food;
      foodCount += 1;
    }
    if (service > 0) {
      serviceSum += service;
      serviceCount += 1;
    }
  }

  return {
    averageOverall: overallCount ? Number((overallSum / overallCount).toFixed(1)) : null,
    averageFoodQuality: foodCount ? Number((foodSum / foodCount).toFixed(1)) : null,
    averageServiceSpeed: serviceCount ? Number((serviceSum / serviceCount).toFixed(1)) : null,
    recentComments: feedbacks
      .map((feedback) => String(feedback.comment || "").trim())
      .filter(Boolean)
      .slice(0, 5),
  };
}

function detectDietaryProfile(text) {
  const source = normalizePlainText(text);
  if (!source) return null;

  return {
    diabetic: /\bdiabet|sugar|low sugar\b/.test(source),
    lowSpice: /\blow spice|less spicy|not spicy|mild|no spice\b/.test(source),
    lowOil: /\blow oil|less oil|oil free|light food\b/.test(source),
    vegetarian: /\bveg|vegetarian|no meat|no chicken|no fish|no egg\b/.test(source),
    highProtein: /\bprotein|gym|muscle|fitness\b/.test(source),
    lowCarb: /\blow carb|less carb|keto\b/.test(source),
    avoidFried: /\bavoid fried|not fried|grilled only|baked\b/.test(source),
    soupLike: /\bsoup|light meal|easy to digest|stomach\b/.test(source),
  };
}

function scoreDietaryFit(item, profile) {
  const haystack = normalizePlainText(`${item.name} ${item.category} ${item.description}`);
  let score = 0;

  if (profile.vegetarian) {
    if (/\bchicken|fish|egg|meat\b/.test(haystack)) score -= 6;
    if (/\bpaneer|veg|dal|fruit|corn|tomato\b/.test(haystack)) score += 4;
  }
  if (profile.diabetic) {
    if (/\bgulab|brownie|ice cream|cheesecake|sundae|dessert|sweet|pasta|naan|rice\b/.test(haystack)) score -= 5;
    if (/\bsoup|paneer|fish|chicken|dal|salad\b/.test(haystack)) score += 3;
  }
  if (profile.lowSpice) {
    if (/\b65|tikka|spicy|masala|tandoori|curry\b/.test(haystack)) score -= 2;
    if (/\bsoup|salad|fried rice|fruit\b/.test(haystack)) score += 2;
  }
  if (profile.lowOil || profile.avoidFried) {
    if (/\bfried|roll|65|naan|brownie|sundae\b/.test(haystack)) score -= 3;
    if (/\bsoup|salad|fruit|grill|grilled\b/.test(haystack)) score += 2;
  }
  if (profile.highProtein) {
    if (/\bpaneer|chicken|fish|dal\b/.test(haystack)) score += 3;
  }
  if (profile.lowCarb) {
    if (/\brice|naan|roti|pasta|dessert|cake|jamun\b/.test(haystack)) score -= 3;
    if (/\bpaneer|fish|chicken|soup\b/.test(haystack)) score += 2;
  }
  if (profile.soupLike) {
    if (/\bsoup|salad|fruit\b/.test(haystack)) score += 3;
  }

  return score;
}

function buildDietaryResponse(userMessage, menuItems) {
  const profile = detectDietaryProfile(userMessage);
  if (!profile || !Object.values(profile).some(Boolean)) return null;

  const ranked = menuItems
    .map((item) => ({ item, score: scoreDietaryFit(item, profile) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.item.price - b.item.price);

  if (!ranked.length) {
    return {
      message: `${DIETARY_DISCLAIMER} Please check with your doctor if you need strict medical guidance, and I can still show the lighter menu options we have.`,
      actions: [{ type: "show_menu" }],
      suggestions: ["Light options", "Full menu", "My cart"],
    };
  }

  const picks = ranked.slice(0, 3).map((entry) => entry.item);
  const primary = picks[0];
  return {
    message: `${DIETARY_DISCLAIMER} ${primary.name} may suit you better from our current menu, and ${picks.slice(1).map((item) => item.name).join(" and ")} are also reasonable options to consider.`,
    actions: [],
    suggestions: picks.map((item) => item.name),
  };
}

function buildBudgetResponse(userMessage, menuItems) {
  const budget = extractBudget(userMessage);
  if (!budget) return null;

  const affordable = menuItems
    .filter((item) => item.price > 0 && item.price <= budget)
    .sort((a, b) => b.price - a.price || a.name.localeCompare(b.name));

  if (!affordable.length) {
    return {
      message: `I do not have a full meal under Rs ${budget} from the current menu, but I can show the closest low-cost options.`,
      actions: [{ type: "show_menu" }],
      suggestions: ["Show budget items", "Full menu", "My cart"],
    };
  }

  const topPicks = affordable.slice(0, 3);
  const pickNames = topPicks.map((item) => item.name);
  return {
    message: `Under Rs ${budget}, I would suggest ${pickNames.join(", ")}. ${topPicks[0].name} is the strongest pick for value from the current menu.`,
    actions: [{
      type: "ask_choice",
      options: topPicks.map((item) => ({
        label: item.name,
        value: item.name,
        meta: `Rs ${item.price} · ${item.category}`,
      })),
    }],
    suggestions: pickNames,
  };
}

function buildDirectItemIntent(context, menuItems) {
  const mentions = inferMenuMentions(context.message, menuItems);
  if (!mentions.length) return null;

  const normalized = context.normalizedMessage;
  if (!/\b(add|order|want|have|get|bring|give|take)\b/.test(normalized)) return null;

  return {
    message: `Certainly. I can help with ${mentions.slice(0, 2).map((item) => item.name).join(" and ")}.`,
    actions: mentions.slice(0, 2).map((item) => ({ type: "add_to_cart", item: item.name, qty: 1 })),
    suggestions: ["My cart", "Add another item", "Place order"],
  };
}

function buildRecommendationResponse(context) {
  const picks = context.relevantMenuItems.slice(0, 3);
  if (!picks.length) return null;

  const primary = picks[0];
  const extras = picks.slice(1).map((item) => `${item.name} at Rs ${item.price}`);
  const extraText = extras.length ? ` You could also look at ${extras.join(" or ")}.` : "";

  return {
    message: `${primary.name} at Rs ${primary.price} is my top pick for you right now.${extraText}`.trim(),
    actions: [],
    suggestions: picks.map((item) => item.name),
  };
}

function buildSmalltalkResponse(context) {
  if (/\b(thank|thanks|awesome|great|nice|cool|love that)\b/.test(context.normalizedMessage)) {
    return {
      message: "Always happy to help. Tell me if you want a quick recommendation, a budget pick, or help with your cart.",
      actions: [],
      suggestions: ["Chef's pick", "Budget picks", "My cart"],
    };
  }

  if (/\b(joke|funny|bored|surprise me|random)\b/.test(context.normalizedMessage)) {
    return {
      message: "Let me keep it simple and tasty. Tell me whether you want something spicy, light, or filling, and I’ll narrow it down properly.",
      actions: [],
      suggestions: ["Something spicy", "Light meal", "Chef's pick"],
    };
  }

  return {
    message: "I’m here and ready. Tell me your budget, the kind of dish you want, or a menu item, and I’ll keep it easy.",
    actions: [],
    suggestions: ["Chef's pick", "Budget picks", "Full menu"],
  };
}

function buildIntentFallback(context) {
  if (context.intent === "recommendation" || context.intent === "menu_query") {
    return buildRecommendationResponse(context);
  }
  if (context.intent === "smalltalk" || context.intent === "general") {
    return buildSmalltalkResponse(context);
  }
  return null;
}

function resolveDeterministicIntent(context, menuItems) {
  const directItemIntent = buildDirectItemIntent(context, menuItems);
  if (directItemIntent) return directItemIntent;

  const dietaryResponse = buildDietaryResponse(context.message, menuItems);
  if (dietaryResponse) return dietaryResponse;

  const budgetResponse = buildBudgetResponse(context.message, menuItems);
  if (budgetResponse) return budgetResponse;

  if (/\b(show|open|see|browse)\b.*\bmenu\b|\bfull menu\b/i.test(context.normalizedMessage)) {
    return {
      message: "Certainly. I can open the menu so you can browse everything available right now.",
      actions: [{ type: "show_menu" }],
      suggestions: ["Full menu", "Budget picks", "My cart"],
    };
  }

  if (/\b(cart|basket|checkout|bill)\b/i.test(context.normalizedMessage)) {
    return {
      message: "I can open your cart so you can review the order and total.",
      actions: [{ type: "open_cart" }],
      suggestions: ["My cart", "Add more items", "Place order"],
    };
  }

  return buildIntentFallback(context);
}

function buildResponseFromPlainText(rawText, context, menuItems) {
  const text = String(rawText || "").trim();
  if (!text) return null;
  const deterministic = resolveDeterministicIntent({
    ...context,
    message: `${context.message} ${text}`.trim(),
    normalizedMessage: normalizePlainText(`${context.message} ${text}`),
  }, menuItems);
  if (deterministic) return deterministic;

  const normalizedRaw = normalizePlainText(text);
  if (!normalizedRaw) return null;

  const mentions = inferMenuMentions(`${text} ${context.message}`, menuItems);
  if (mentions.length) {
    return {
      message: looksLikeBrokenStructuredText(text)
        ? `I caught the intent, but that reply came back in a messy format. I can still help you with ${mentions
          .slice(0, 3)
          .map((item) => item.name)
          .join(", ")}.`
        : text,
      actions: mentions.slice(0, 3).map((item) => ({ type: "add_to_cart", item: item.name, qty: 1 })),
      suggestions: mentions.slice(0, 3).map((item) => item.name),
    };
  }

  return {
    message: looksLikeBrokenStructuredText(text)
      ? "I didn't get a clean reply there. Tell me what you'd like to eat, your budget, or the kind of dish you want, and I'll guide you properly."
      : text,
    actions: [],
    suggestions: ["Full menu", "My cart"],
  };
}

function sanitizeSuggestions(suggestions) {
  return (Array.isArray(suggestions) ? suggestions : [])
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .slice(0, 3);
}

function sanitizeAssistantActions(actions, menuItems) {
  const menuLookup = buildMenuLookup(menuItems);
  const sanitized = [];

  for (const action of Array.isArray(actions) ? actions : []) {
    if (!action || typeof action !== "object") continue;

    const type = String(action.type || "").trim();
    if (!["add_to_cart", "remove_from_cart", "show_menu", "place_order", "open_cart", "ask_choice"].includes(type)) {
      continue;
    }

    if (type === "add_to_cart" || type === "remove_from_cart") {
      const itemName = String(action.item || "").trim();
      const menuMatch = menuLookup.get(itemName.toLowerCase());
      if (!menuMatch) continue;
      sanitized.push({
        type,
        item: menuMatch.name,
        qty: Math.max(1, Math.min(20, Number(action.qty) || 1)),
      });
      continue;
    }

    if (type === "ask_choice") {
      const options = (Array.isArray(action.options) ? action.options : [])
        .map((option) => {
          if (option && typeof option === "object") {
            const label = String(option.label || option.value || "").trim();
            const value = String(option.value || option.label || "").trim();
            const meta = String(option.meta || "").trim();
            return label && value ? { label, value, meta } : null;
          }
          const value = String(option || "").trim();
          return value ? { label: value, value, meta: "" } : null;
        })
        .filter(Boolean)
        .slice(0, 3);
      sanitized.push({ type, options });
      continue;
    }

    sanitized.push({ type });
  }

  return sanitized;
}

function sanitizeAssistantResponse(parsed, menuItems) {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;

  const message = String(parsed.message || "").trim();
  if (!message || looksLikeBrokenStructuredText(message)) return null;

  return {
    message,
    actions: sanitizeAssistantActions(parsed.actions, menuItems),
    suggestions: sanitizeSuggestions(parsed.suggestions),
  };
}

function responseLooksWeak(response, context) {
  if (!response || typeof response !== "object") return true;

  const message = String(response.message || "").trim();
  if (!message) return true;

  const normalized = normalizePlainText(message);
  const genericPatterns = [
    /\bi can help with that\b/,
    /\btell me more\b/,
    /\bbased on your preferences\b/,
    /\blet me know what you want\b/,
    /\bi can assist\b/,
    /\bi didn t get that\b/,
  ];

  if (genericPatterns.some((pattern) => pattern.test(normalized))) return true;
  if (message.length > 220) return true;
  if (/(^|\s)(menu|cart|bill)\s*:?$/i.test(message)) return true;

  const mentionsKnownItem = context.relevantMenuItems.some((item) =>
    normalized.includes(normalizePlainText(item.name))
  );
  const hasMeaningfulActions = Array.isArray(response.actions) && response.actions.length > 0;

  if (["budget", "dietary", "recommendation", "menu_query"].includes(context.intent) && !mentionsKnownItem && !hasMeaningfulActions) {
    return true;
  }

  return false;
}

function tryParseAssistantResponse(rawText, menuItems, context) {
  const strictParsed = sanitizeAssistantResponse(safeJsonParse(rawText, "object"), menuItems);
  if (strictParsed && !responseLooksWeak(strictParsed, context)) return strictParsed;

  const repairedParsed = sanitizeAssistantResponse(safeJsonParseLenient(rawText, "object"), menuItems);
  if (repairedParsed && !responseLooksWeak(repairedParsed, context)) return repairedParsed;

  return buildResponseFromPlainText(rawText, context, menuItems);
}

function buildAssistantPrompt(context) {
  const compactContext = JSON.stringify({
    intent: context.intent,
    guest: context.guestName,
    table: context.tableId,
    userMessage: context.message,
    cart: context.cart,
    menuOverview: context.menuOverview,
    relevantMenuItems: context.relevantMenuItems,
    popularity: context.popularity,
    userHistory: context.userHistory,
    feedback: context.feedback,
    mentionedItems: context.mentionedItems,
    requestedBudget: context.budgets.requestedBudget,
    allowedActions: context.allowedActions,
  }, null, 2);
  return `
${RESTAURANT_CONTEXT}

ROLE:
You are Nova, the restaurant's AI waiter.

GOALS:
- Help the guest order from the provided menu only.
- Keep a consistent waiter tone: warm, grounded, clear, not overexcited.
- Sound friendly, lightly jolly, and interactive, like a good waiter who enjoys helping.
- Engage naturally, but keep replies concise and useful.
- Never hallucinate dishes, prices, ingredients, discounts, availability, or restaurant facts.
- If the user asks about something not in the menu/context, say that clearly and guide them to valid options.
- If the guest asks for diet, allergy, health, or medical-based suggestions, do not give medical advice or guarantees. Say you cannot give medical advice, then offer menu options that may suit them better based only on the menu/context.

RESPONSE FORMAT:
Return ONLY one valid JSON object.
No markdown, no code fences, no extra text.

SCHEMA:
{
  "message": "1 or 2 waiter-style sentences",
  "actions": [
    {"type":"add_to_cart","item":"EXACT MENU NAME","qty":2},
    {"type":"remove_from_cart","item":"EXACT MENU NAME","qty":1},
    {"type":"show_menu"},
    {"type":"open_cart"},
    {"type":"place_order"},
    {"type":"ask_choice","options":["A","B","C"]}
  ],
  "suggestions": ["short chip", "short chip", "short chip"]
}

STRICT RULES:
- Use ONLY exact menu names from MENU.
- Do not mention dishes that are not in MENU.
- Only create add/remove actions for exact menu items.
- If the guest says quantity, include qty as an integer.
- If the guest mentions multiple menu items, include multiple actions.
- Keep suggestions short, relevant, and grounded in MENU/cart context.
- If uncertain, ask a clarifying question using message and ask_choice.
- If the guest says something casual or random, respond in a friendly human way and gently steer the conversation back toward menu help or ordering.
- Do not return show_menu or open_cart unless the guest explicitly asked to open/show the menu/cart/bill.
- Use RELEVANT_MENU_ITEMS and MENU_OVERVIEW as the source of truth for recommendations. If something is not in context, do not invent it.
- Use POPULARITY, USER_HISTORY, and FEEDBACK when choosing what to recommend or how to frame the reply.
- Prefer concise waiter replies with one clear next step.
- Keep the reply to the point. Usually 1 sentence, at most 2 short sentences.
- For recommendation, budget, and dietary intents, mention exact relevant menu items or prices from context. Do not answer vaguely.
- If your draft would be generic, replace it with a sharper recommendation or one short clarifying question.
- The reply must sound human and waiter-like, but every factual claim must come from CONTEXT.
- Return valid JSON even for casual chat. Never return raw labels like "Menu" or malformed fragments.

CONTEXT:
${compactContext}
`.trim();
}

function buildAssistantFallback(context, menuItems) {
  const text = String(context?.message || "").toLowerCase();
  const actions = [];
  const suggestions = ["Full menu", "My cart", "Chef's pick"];
  const matchedItem = menuItems.find((item) => text.includes(item.name.toLowerCase()));

  if (matchedItem && /\b(add|order|want|have|get|bring)\b/.test(text)) {
    actions.push({ type: "add_to_cart", item: matchedItem.name });
    return {
      message: `${matchedItem.name} is a lovely choice. I've added it to your cart for you.`,
      actions,
      suggestions: ["My cart", "Suggest pairing", "Add another item"],
    };
  }

  if (/\b(cart|checkout|bill)\b/.test(text)) {
    actions.push({ type: "open_cart" });
    return {
      message: "Of course. Opening your cart now.",
      actions,
      suggestions,
    };
  }

  if (/\b(menu|show)\b/.test(text)) {
    actions.push({ type: "show_menu" });
    return {
      message: "Absolutely. Here is the menu, and you can pick anything you like from there.",
      actions,
      suggestions,
    };
  }

  if (/\b(hi|hello|hey|yo|hola|good morning|good afternoon|good evening)\b/.test(text)) {
    return {
      message: "Hello. I'm right here and happy to help. If you'd like, I can suggest something tasty, budget-friendly, or a little indulgent.",
      actions: [],
      suggestions: ["Chef's pick", "Budget picks", "Full menu"],
    };
  }

  if (/\b(thank|thanks|awesome|great|nice|cool|love that)\b/.test(text)) {
    return {
      message: "Always a pleasure. If you'd like, I can suggest a pairing or help you wrap up the order as well.",
      actions: [],
      suggestions: ["Suggest pairing", "My cart", "Place order"],
    };
  }

  if (/\b(joke|funny|bored|surprise me|random)\b/.test(text)) {
    const featuredFun = menuItems.slice(0, 3).map((item) => item.name);
    return {
      message: featuredFun.length
        ? `Keeping it interesting, I see. If you'd like a fun place to start, I'd look at ${featuredFun.join(", ")}.`
        : "Keeping it interesting, I see. I can still help you find something fun from the menu.",
      actions: [],
      suggestions: ["Chef's pick", "Something spicy", "Budget picks"],
    };
  }

  const featured = menuItems.slice(0, 3).map((item) => item.name);
  return {
    message: featured.length
      ? `Happy to help. Popular picks right now are ${featured.join(", ")}. Tell me the kind of meal you're in the mood for, and I'll narrow it down nicely.`
      : "Happy to help. I can guide you through the menu, suggest something fun, or help you add items to your cart.",
    actions,
    suggestions,
  };
}

async function generateAssistantJson(context, menuItems) {
  if (!geminiClients.length) return null;

  const prompt = buildAssistantPrompt(context);

  let attempts = 0;
  for (const modelName of GEMINI_MODEL_CHAIN) {
    for (let clientIndex = 0; clientIndex < geminiClients.length; clientIndex += 1) {
      const client = geminiClients[clientIndex];
      if (attempts >= AI_MAX_MODEL_ATTEMPTS) {
        console.log(`[AI:assistant] final=attempt_limit_reached maxAttempts=${AI_MAX_MODEL_ATTEMPTS}`);
        return null;
      }

      attempts += 1;
      const startedAt = Date.now();
      try {
        logAiAttempt("assistant", {
          keyIndex: clientIndex + 1,
          modelName,
          stage: "request_started",
          reason: `attempt=${attempts}/${AI_MAX_MODEL_ATTEMPTS}`,
        });

        const model = client.getGenerativeModel({
          model: modelName,
          generationConfig: {
            temperature: ASSISTANT_TEMPERATURE,
            maxOutputTokens: 600,
            responseMimeType: "application/json",
          },
        });

        const result = await model.generateContent(prompt, {
          timeout: AI_REQUEST_TIMEOUT_MS,
        });
        const text = result?.response?.text?.() || "";
        logAiAttempt("assistant", {
          keyIndex: clientIndex + 1,
          modelName,
          stage: "response_received",
          durationMs: Date.now() - startedAt,
          rawLength: text.length,
        });

        const parsed = tryParseAssistantResponse(text, menuItems, context);
        if (parsed) {
          logAiAttempt("assistant", {
            keyIndex: clientIndex + 1,
            modelName,
            stage: "parse_success",
            durationMs: Date.now() - startedAt,
            reason: "strict_or_salvaged",
          });
          return parsed;
        }

        logAiAttempt("assistant", {
          keyIndex: clientIndex + 1,
          modelName,
          stage: "parse_failed",
          durationMs: Date.now() - startedAt,
          reason: "non_json_or_unexpected_shape",
        });

      } catch (error) {
        const retryable = isRetryableGeminiError(error);
        const summary = summarizeError(error);
        logAiAttempt("assistant", {
          keyIndex: clientIndex + 1,
          modelName,
          stage: "request_failed",
          durationMs: Date.now() - startedAt,
          retryable,
          status: summary.status,
          reason: summary.message,
        });

        if (!retryable) {
          console.error("Assistant Gemini error:", error);
          break;
        }
      }
    }
  }

  return null;
}

async function generateRecommendationJson(prompt) {
  if (!geminiClients.length) return null;

  let attempts = 0;
  for (const modelName of GEMINI_MODEL_CHAIN) {
    for (let clientIndex = 0; clientIndex < geminiClients.length; clientIndex += 1) {
      const client = geminiClients[clientIndex];
      if (attempts >= AI_MAX_MODEL_ATTEMPTS) {
        console.log(`[AI:recommend] final=attempt_limit_reached maxAttempts=${AI_MAX_MODEL_ATTEMPTS}`);
        return null;
      }

      attempts += 1;
      const startedAt = Date.now();
      try {
        logAiAttempt("recommend", {
          keyIndex: clientIndex + 1,
          modelName,
          stage: "request_started",
          reason: `attempt=${attempts}/${AI_MAX_MODEL_ATTEMPTS}`,
        });

        const model = client.getGenerativeModel({
          model: modelName,
          generationConfig: {
            temperature: 0.4,
            maxOutputTokens: 600,
            responseMimeType: "application/json",
          },
        });

        const result = await model.generateContent(prompt, {
          timeout: AI_REQUEST_TIMEOUT_MS,
        });
        const text = result?.response?.text?.() || "";
        logAiAttempt("recommend", {
          keyIndex: clientIndex + 1,
          modelName,
          stage: "response_received",
          durationMs: Date.now() - startedAt,
          rawLength: text.length,
        });

        const parsed = safeJsonParse(text, "array");
        if (Array.isArray(parsed)) {
          logAiAttempt("recommend", {
            keyIndex: clientIndex + 1,
            modelName,
            stage: "parse_success",
            durationMs: Date.now() - startedAt,
          });
          return parsed;
        }

        logAiAttempt("recommend", {
          keyIndex: clientIndex + 1,
          modelName,
          stage: "parse_failed",
          durationMs: Date.now() - startedAt,
          reason: "non_json_or_unexpected_shape",
        });
      } catch (error) {
        const retryable = isRetryableGeminiError(error);
        const summary = summarizeError(error);
        logAiAttempt("recommend", {
          keyIndex: clientIndex + 1,
          modelName,
          stage: "request_failed",
          durationMs: Date.now() - startedAt,
          retryable,
          status: summary.status,
          reason: summary.message,
        });

        if (!retryable) {
          console.error("Recommendation Gemini error:", error);
          break;
        }
      }
    }
  }

  return null;
}

router.post("/recommend", auth, async (req, res) => {
  try {
    const prefs = req.body?.prefs || {};
    const menu = await MenuItem.find({ available: true }).limit(50);
    const normalizedMenu = normalizeMenuItems(menu);

    if (!geminiClients.length) {
      const rec = normalizedMenu
        .filter((item) => !prefs.category || item.category === prefs.category)
        .slice(0, 3)
        .map((item) => ({ id: item.id, name: item.name, price: item.price, reason: "Popular choice" }));
      return res.json({ recommendations: rec });
    }

    const prompt = `
You are a restaurant AI assistant.
Customer preferences: ${JSON.stringify(prefs)}.
Menu items: ${normalizedMenu.map((item) => `${item.name} - Rs ${item.price} - ${item.category}`).join("\n")}
Return exactly valid JSON as an array of 3 items.
Each item must be: {"id":"menu id","name":"item name","price":123,"reason":"short reason"}
`;

    const recommendations = await generateRecommendationJson(prompt);
    return res.json({ recommendations: Array.isArray(recommendations) ? recommendations : [] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ err: err.message });
  }
});

router.post("/assistant", auth, async (req, res) => {
  try {
    const message = String(req.body?.message || "").trim();
    const guestName = String(req.body?.guestName || req.user?.name || "").trim();
    const guestEmail = String(req.user?.email || "").trim();
    const tableId = String(req.body?.tableId || "").trim();
    const cartItems = normalizeCartItems(req.body?.cart || []);

    if (!message) {
      return res.status(400).json({ message: "message is required" });
    }

    const [menu, currentOrders, previousOrders, feedbacks] = await Promise.all([
      MenuItem.find({}).sort({ category: 1, name: 1 }).lean(),
      Order.find({}).sort({ createdAt: -1 }).limit(100).lean(),
      PreviousOrder.find({}).sort({ createdAt: -1 }).limit(200).lean(),
      Feedback.find({}).sort({ createdAt: -1 }).limit(50).lean(),
    ]);
    const normalizedMenu = normalizeMenuItems(menu);
    const context = buildAssistantContext({
      message,
      guestName,
      guestEmail,
      tableId,
      cartItems,
      menuItems: normalizedMenu,
      currentOrders,
      previousOrders,
      feedbacks,
    });

    const response = await generateAssistantJson(context, normalizedMenu);
    if (response) {
      console.log("[AI:assistant] final=ai_response");
      return res.json(response);
    }

    console.log("[AI:assistant] final=fallback_response");
    return res.json(buildAssistantFallback(context, normalizedMenu));
  } catch (err) {
    console.error("Assistant route failed:", err);
    return res.json({
      message: "I'm a bit busy right now. You can still browse the menu and add items manually.",
      actions: [],
      suggestions: ["Full menu", "My cart"],
    });
  }
});

module.exports = router;

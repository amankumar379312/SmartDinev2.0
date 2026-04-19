const express = require("express");
const router = express.Router();
const MenuItem = require("../models/MenuItem");
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
  "SmartDine is a modern restaurant. Speak like a polite, attentive floor waiter: warm, confident, brief, helpful. Never invent menu items, prices, offers, ingredients, timing, or restaurant policies that are not provided."
).trim();

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

function buildMenuLookup(menuItems) {
  return new Map(menuItems.map((item) => [item.name.toLowerCase(), item]));
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
        .map((option) => String(option || "").trim())
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
  if (!message) return null;

  return {
    message,
    actions: sanitizeAssistantActions(parsed.actions, menuItems),
    suggestions: sanitizeSuggestions(parsed.suggestions),
  };
}

function buildAssistantPrompt({ message, guestName, tableId, cartItems, menuItems }) {
  const menuBlock = menuItems
    .map((item) => `- ${item.name} | category=${item.category} | price=Rs ${item.price} | desc=${item.description || "NA"}`)
    .join("\n");
  const cartBlock = cartItems.length
    ? cartItems.map((item) => `${item.name} x${item.qty}`).join(", ")
    : "empty";

  return `
${RESTAURANT_CONTEXT}

ROLE:
You are Nova, the restaurant's AI waiter.

GOALS:
- Help the guest order from the provided menu only.
- Keep a consistent waiter tone: warm, grounded, clear, not overexcited.
- Engage naturally, but keep replies concise and useful.
- Never hallucinate dishes, prices, ingredients, discounts, availability, or restaurant facts.
- If the user asks about something not in the menu/context, say that clearly and guide them to valid options.

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

CONTEXT:
Guest=${guestName || "Guest"}
Table=${tableId || "walkin"}
Cart=${cartBlock}

MENU:
${menuBlock}

USER MESSAGE:
${message}
`.trim();
}

function buildAssistantFallback(message, menuItems) {
  const text = String(message || "").toLowerCase();
  const actions = [];
  const suggestions = ["Full menu", "My cart", "Chef's pick"];
  const matchedItem = menuItems.find((item) => text.includes(item.name.toLowerCase()));

  if (matchedItem && /\b(add|order|want|have|get|bring)\b/.test(text)) {
    actions.push({ type: "add_to_cart", item: matchedItem.name });
    return {
      message: `${matchedItem.name} is a solid choice. I've added it to your cart.`,
      actions,
      suggestions: ["My cart", "Suggest pairing", "Add another item"],
    };
  }

  if (/\b(cart|checkout|bill)\b/.test(text)) {
    actions.push({ type: "open_cart" });
    return {
      message: "Opening your cart now.",
      actions,
      suggestions,
    };
  }

  if (/\b(menu|show)\b/.test(text)) {
    actions.push({ type: "show_menu" });
    return {
      message: "Here is the menu. You can add anything you like from there.",
      actions,
      suggestions,
    };
  }

  const featured = menuItems.slice(0, 3).map((item) => item.name);
  return {
    message: featured.length
      ? `I can help with that. Popular picks right now are ${featured.join(", ")}.`
      : "I can help you browse the menu or add items to your cart.",
    actions,
    suggestions,
  };
}

async function generateAssistantJson({ message, guestName, tableId, cartItems, menuItems }) {
  if (!geminiClients.length) return null;

  const prompt = buildAssistantPrompt({
    message,
    guestName,
    tableId,
    cartItems,
    menuItems,
  });

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

        const parsed = sanitizeAssistantResponse(safeJsonParse(text, "object"), menuItems);
        if (parsed) {
          logAiAttempt("assistant", {
            keyIndex: clientIndex + 1,
            modelName,
            stage: "parse_success",
            durationMs: Date.now() - startedAt,
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
    const tableId = String(req.body?.tableId || "").trim();
    const cartItems = normalizeCartItems(req.body?.cart || []);

    if (!message) {
      return res.status(400).json({ message: "message is required" });
    }

    const menu = await MenuItem.find({}).sort({ category: 1, name: 1 }).lean();
    const normalizedMenu = normalizeMenuItems(menu);

    const response = await generateAssistantJson({
      message,
      guestName,
      tableId,
      cartItems,
      menuItems: normalizedMenu,
    });
    if (response) {
      console.log("[AI:assistant] final=ai_response");
      return res.json(response);
    }

    console.log("[AI:assistant] final=fallback_response");
    return res.json(buildAssistantFallback(message, normalizedMenu));
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

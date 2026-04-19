const express = require("express");
const router = express.Router();
const MenuItem = require("../models/MenuItem");
const auth = require("../middleware/auth");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const GEMINI_MODEL_CHAIN = [
  process.env.GEMINI_MODEL || "gemini-3.1-flash-lite-preview",
  "gemini-2.5-flash",
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

function safeJsonParse(text) {
  try {
    return JSON.parse(String(text || "").trim().replace(/```json\s*/gi, "").replace(/```/g, ""));
  } catch {
    return null;
  }
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

async function generateAssistantJson(prompt) {
  if (!geminiClients.length) return null;

  for (const client of geminiClients) {
    for (const modelName of GEMINI_MODEL_CHAIN) {
      try {
        const model = client.getGenerativeModel({
          model: modelName,
          generationConfig: {
            temperature: 0.85,
            maxOutputTokens: 600,
            responseMimeType: "application/json",
          },
        });

        const result = await model.generateContent(prompt);
        const text = result?.response?.text?.() || "";
        const parsed = safeJsonParse(text);
        if (parsed) return parsed;
      } catch (error) {
        const message = String(error?.message || "");
        const retryable = message.includes("404") || message.includes("429") || message.includes("quota");
        if (!retryable) {
          console.error("Assistant Gemini error:", error);
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

    const recommendations = await generateAssistantJson(prompt);
    return res.json({ recommendations: Array.isArray(recommendations) ? recommendations : [] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ err: err.message });
  }
});

router.post("/assistant", auth, async (req, res) => {
  try {
    const message = String(req.body?.message || "").trim();
    const prompt = String(req.body?.prompt || "").trim();

    if (!message || !prompt) {
      return res.status(400).json({ message: "message and prompt are required" });
    }

    const menu = await MenuItem.find({}).sort({ category: 1, name: 1 }).lean();
    const normalizedMenu = normalizeMenuItems(menu);

    const response = await generateAssistantJson(`${prompt}\n\nUser: "${message}"`);
    if (response && typeof response === "object") {
      return res.json({
        message: String(response.message || "I can help with that."),
        actions: Array.isArray(response.actions) ? response.actions : [],
        suggestions: Array.isArray(response.suggestions) ? response.suggestions : [],
      });
    }

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

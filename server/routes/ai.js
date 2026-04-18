const express = require('express');
const router = express.Router();
const MenuItem = require('../models/MenuItem');
const auth = require('../middleware/auth');
const { GoogleGenAI } = require("@google/genai");

const ai = new GoogleGenAI({}); // uses GOOGLE_APPLICATION_CREDENTIALS

router.post('/recommend', auth, async (req, res) => {
  const { prefs } = req.body;

  // get menu snapshot
  const menu = await MenuItem.find({ available: true }).limit(50);

  // Simple fallback if AI key/config missing
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    const rec = menu
      .filter(m => !prefs.category || m.category === prefs.category)
      .sort((a, b) => b.popularityScore - a.popularityScore)
      .slice(0, 3)
      .map(m => ({ id: m._id, name: m.name, price: m.price, reason: 'Popular choice' }));
    return res.json({ recommendations: rec });
  }

  try {
    const prompt = `
You are a restaurant AI assistant. The customer preferences: ${JSON.stringify(prefs)}.
Menu items: ${menu.map(m => `${m.name} - ${m.price} - ${m.category}`).join('\n')}
Return 3 recommended items with short reasons and price, in JSON format.
`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });

    // response.text contains the AI-generated recommendation text
    const text = response.text;

    // Try to parse JSON if AI returns structured response
    let recommendations;
    try { recommendations = JSON.parse(text); } catch { recommendations = text; }

    return res.json({ recommendations });
  } catch (err) {
    console.error(err);
    res.status(500).json({ err: err.message });
  }
});

module.exports = router;

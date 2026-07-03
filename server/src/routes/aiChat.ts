import { Router } from "express";
import OpenAI from "openai";
import { authenticate } from "../middleware/auth";

const router = Router();

const SYSTEM_PROMPT = `You are Truvi AI, a knowledgeable real estate assistant for the Indian property market.
You help buyers, channel partners, developers, and investors with:
- RERA regulations and compliance
- Property valuation and price trends
- Trust score interpretation
- Legal risk assessment
- Commission structures
- Investment analysis and CAGR projections
- Site visit and due diligence advice

Keep responses concise (2–4 sentences), factual, and helpful. If asked something outside real estate, politely redirect.
Never give specific legal or financial advice — recommend consulting certified professionals for complex decisions.`;

router.post("/", authenticate, async (req, res) => {
  const { message, propertyContext } = req.body as {
    message?: string;
    propertyContext?: Record<string, unknown>;
  };

  if (!message || typeof message !== "string" || !message.trim()) {
    return res.status(400).json({ error: "message is required" });
  }

  const apiKey = process.env.OPENAI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;

  if (!apiKey) {
    return res.status(503).json({
      error: "AI service not configured",
      reply: "Ask Truvi AI is not yet configured. Please add your OPENAI_API_KEY to the server environment.",
    });
  }

  const openai = new OpenAI({ apiKey, ...(baseURL ? { baseURL } : {}) });

  let systemPrompt = SYSTEM_PROMPT;
  if (propertyContext && Object.keys(propertyContext).length > 0) {
    systemPrompt += `\n\nCurrent property context:\n${JSON.stringify(propertyContext, null, 2)}`;
  }

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: message.trim() },
      ],
      max_tokens: 300,
    });

    const reply = completion.choices[0]?.message?.content ?? "Sorry, I couldn't generate a response. Please try again.";
    res.json({ reply });
  } catch (err: unknown) {
    console.error("AI chat error:", err);
    const msg = err instanceof Error ? err.message : "AI request failed";
    res.status(502).json({ error: msg, reply: "I'm having trouble connecting right now. Please try again in a moment." });
  }
});

export default router;

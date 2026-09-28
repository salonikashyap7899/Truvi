import { Router } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { authenticate, AuthedRequest } from "../middleware/auth";
import { retrieveContext } from "../services/askTruviService";

const router = Router();

// Model is configurable via env so it can be changed without a redeploy if the
// account's available models change. Keep a sensible default.
const AI_MODEL = process.env.ASK_AI_MODEL?.trim() || "claude-opus-4-5";

/* ---------------- Sales Copilot modes ---------------- */

const COPILOT_PROMPTS: Record<string, string> = {
  whatsapp: `You are an AI sales assistant for Truvi, a real estate platform. Generate a friendly, professional WhatsApp follow-up message for a channel partner to send to their real estate client. The message should be warm, personalized, not pushy, and should move the client toward the next step (site visit, booking, etc.). Keep it under 100 words. Use the context provided about client name and lead stage. Output only the message text, ready to send.`,

  pitch: `You are an AI sales coach for Truvi, a real estate platform. Generate a concise, persuasive pitch script for a channel partner to use when presenting a property to a potential buyer. Structure it as: 1) Opening hook, 2) Key property highlights, 3) Investment angle, 4) Call to action. Keep it under 150 words. Use the project details provided. Output only the pitch script.`,

  objection: `You are an AI sales coach for Truvi, a real estate platform. Provide a confident, empathetic response script to help a channel partner handle the buyer's objection mentioned. The response should acknowledge the concern, reframe it positively, and move the conversation forward. Keep it under 80 words. Output only the response script the CP can use directly.`,
};

/* ---------------- Ask Truvi AI — Decision Intelligence prompt ---------------- */

const ASK_TRUVI_SYSTEM = `You are Ask Truvi AI — a Real Estate Decision Intelligence Assistant for the Indian property market, built on Truvi's verified data ecosystem. You are NOT a generic chatbot: every answer must be grounded in the TRUVI DATA provided below, with honest limitations and clear sourcing.

CORE RULES (non-negotiable):
1. GROUNDING — Use ONLY the facts in TRUVI DATA for claims about specific projects, builders, prices, scores, or locations. If a fact is missing or null, say so plainly and add a DATA_UNAVAILABLE flag. NEVER invent numbers, approvals, or claims.
2. SOURCE ATTRIBUTION — Every fact you use carries a source label (TRUVI_VERIFIED / PUBLIC_RECORD / BUILDER_SUBMITTED / USER_SUBMITTED / TRUVI_PLATFORM) and sometimes a lastUpdated date. TRUVI_PLATFORM = general information about how the Truvi platform works (from PLATFORM KNOWLEDGE). List the sources you actually relied on in the "sources" array. TRUVI_VERIFIED = field-verified by Truvi's ambassador/surveyor network (highest confidence). BUILDER_SUBMITTED = provided by the developer, not independently verified unless noted.
3. RED FLAGS — Use neutral, responsible language. Never say "scam" or make accusations. Flag concerns only via these four types: ATTENTION_REQUIRED (needs closer inspection), DATA_UNAVAILABLE (could not be verified/found), NEEDS_VERIFICATION (claim exists, not independently confirmed), INFORMATION_MISMATCH (discrepancy between sources).
4. INVESTMENT HONESTY — Give pros, limitations, and comparisons from available data. NEVER promise guaranteed returns, exact appreciation percentages, or speculative claims. Recommend certified professionals for legal/financial decisions.
5. DOCUMENTS — Explain documents (RERA, brochures) in simple language, always with source + a clear disclaimer that this is not legal advice and Truvi does not make legal approval claims.
6. VERIFICATION EXPLANATION — When asked how Truvi verified something, explain from the facts: which data points exist (trust score, risk levels, RERA status, site visits), their sources, what is missing, and the lastUpdated date.
7. SCORE EXPLANATION — When explaining a trust score, break down which factors are strong, which have gaps, and why the score reflects the available evidence.
8. RESIDENT INSIGHTS — Present user-submitted signals (e.g. confirmed site visits) only as aggregated themes. Never expose or invent individual personal data.
9. PERSONALIZED ADVISOR — If the user shares budget, family size, location, timeline, or purpose (self-use vs investment, NRI, first-time buyer), tailor recommendations to that profile using available data.
10. LANGUAGE — Mirror the user's language. If they write in Hinglish or Hindi, reply in natural Hinglish. Otherwise reply in English. Keep answers structured and scannable (short paragraphs, key numbers bolded with **).
11. FOLLOW-UPS — Always suggest 2–3 short, contextually relevant next questions the user could ask (e.g. "Compare with another project?", "Check builder profile?", "View verification details?").
12. COMPARISON — When comparing projects, also fill the "comparison" table with rows for Location, Pricing (min–max and ₹/sqft), Progress/Availability, Trust Score, and Verification.
13. PLATFORM GUIDE — When the user asks what Truvi is, how it works, how verification or the Truvi Score works, how to book / buy / contact, what things cost, whether something is safe, or for an overview or tour of the platform, answer fully and warmly from TRUVI PLATFORM KNOWLEDGE below (source label "TRUVI_PLATFORM"). Act like a helpful product guide: give a clear, complete overview, then nudge one concrete next step (usually "book a free site visit"). Keep using TRUVI DATA for any specific project facts.

TRUVI PLATFORM KNOWLEDGE (general product facts — always available, source label "TRUVI_PLATFORM"):
- Truvi Ventures is a verified, RERA-focused real-estate marketplace (website + Android app) that helps buyers in India discover and buy trustworthy property with confidence.
- Trust first: every listing is independently checked by Truvi and given a Truvi Score (0–100) and a Verified badge, across legal/approval/RERA records, on-ground site visits by the Truvi team, connectivity & infrastructure, market intelligence, environmental data, satellite/GIS coordinates and community signals.
- Buyers can: search by city/locality, filter by type, sort by price or trust, use "Near Me"; open each project to see its photo gallery, master plan, LIVE plot inventory (size, price, availability), location intelligence with a map, and the full verification breakdown; save projects; compare projects side by side; ask you (Ask Truvi) anything; and take action.
- Taking action is FREE for buyers — browsing, saving, comparing, enquiring, booking a site visit and WhatsApp cost nothing. To proceed, a buyer taps "Book a Site Visit" (shares name + mobile) or WhatsApps; the Truvi team then calls with the exact price, availability and a visit slot that suits them.
- Safety: Truvi never exposes a developer's personal phone number — contact is routed through Truvi. There is no hidden brokerage; pricing is transparent (prices exclude GST, registration and statutory charges).
- Who uses Truvi: Buyers discover & buy; Channel Partners (property agents) sell listings and earn commission; Developers list projects and manage live inventory; Ambassadors refer people and earn.
- Optional paid add-ons exist (for example an AI property report, document verification, a consultant call, or a concierge buying service) but are never required to browse, enquire or book a visit.
- Honesty: Truvi provides verified information and guidance, not legal or financial advice. Always encourage buyers to verify documents, approvals and RERA registration before purchase.

Prices are in INR. Format large amounts as ₹X.X L (lakh) or ₹X.X Cr (crore).

OUTPUT FORMAT — respond with ONLY a valid JSON object, no markdown fences, no extra text before or after:
{
  "reply": "the answer text (use \\n for line breaks, ** for bold)",
  "sources": [{"label": "TRUVI_VERIFIED", "detail": "what this covered", "lastUpdated": "YYYY-MM-DD or null"}],
  "flags": [{"type": "NEEDS_VERIFICATION", "note": "short neutral note"}],
  "followUps": ["question 1", "question 2", "question 3"],
  "comparison": {"headers": ["Aspect", "Project A", "Project B"], "rows": [["Location", "...", "..."]]} 
}
"comparison" must be null unless the user asked to compare. "flags" may be empty. "sources" must reflect only sources actually used.`;

interface HistoryTurn {
  role: "user" | "ai";
  text: string;
}

/**
 * Read ANTHROPIC_API_KEY defensively: strip whitespace/newlines and
 * wrapping quotes — the most common paste mistakes when setting the
 * variable in a dashboard, and each one makes Anthropic return 401.
 */
function getAnthropicKey(): { key: string | undefined; sanitized: boolean } {
  const raw = process.env.ANTHROPIC_API_KEY;
  if (!raw) return { key: undefined, sanitized: false };
  const cleaned = raw.trim().replace(/^["']+|["']+$/g, "");
  return { key: cleaned || undefined, sanitized: cleaned !== raw };
}

/**
 * Surface the real Anthropic API failure in the server logs — an invalid
 * key (401), missing credits (400/403 billing), rate limit (429), etc. —
 * so a generic "trouble connecting" reply in the UI is diagnosable.
 */
function logAnthropicError(label: string, err: unknown) {
  if (err instanceof Anthropic.APIError) {
    console.error(`${label} error: HTTP ${err.status} — ${err.message}`);
  } else {
    console.error(`${label} error:`, err);
  }
}

/**
 * GET /api/ai/chat/health — self-service diagnostic for the AI setup.
 * Open it in a browser to see whether ANTHROPIC_API_KEY is present in
 * this server's environment and whether Anthropic accepts it (validated
 * via the free models-list endpoint — no tokens spent).
 */
router.get("/health", async (_req, res) => {
  const { key: apiKey, sanitized } = getAnthropicKey();
  if (!apiKey) {
    return res.json({
      configured: false,
      ok: false,
      hint: "ANTHROPIC_API_KEY is not set in this server's environment. Add it in the Render dashboard → Environment, then let the service restart.",
    });
  }

  const keyPreview = `${apiKey.slice(0, 14)}…${apiKey.slice(-4)} (${apiKey.length} chars)`;
  try {
    const client = new Anthropic({ apiKey });
    await client.models.list();
    return res.json({
      configured: true,
      ok: true,
      keyPreview,
      sanitized,
      hint: sanitized
        ? "Key is valid (extra spaces/quotes around the stored value were cleaned automatically) — Ask Truvi should work."
        : "Key is valid — Ask Truvi should work.",
    });
  } catch (err: unknown) {
    const status = err instanceof Anthropic.APIError ? err.status : undefined;
    const message = err instanceof Anthropic.APIError ? err.message : String(err);
    return res.json({
      configured: true,
      ok: false,
      keyPreview,
      sanitized,
      status,
      error: message,
      hint:
        status === 401
          ? "The key set on this server is being rejected by Anthropic (401). Compare keyPreview with your real key — if it differs, re-paste the key; otherwise generate a fresh key at console.anthropic.com."
          : "The key is set but the Anthropic API call failed — see status/error above.",
    });
  }
});

// Ask Truvi requires a signed-in account — signup completes access.
router.post("/", authenticate, async (req: AuthedRequest, res) => {
  const { message, propertyContext, mode, history, advisorProfile } = req.body as {
    message?: string;
    propertyContext?: Record<string, unknown>;
    mode?: string;
    history?: HistoryTurn[];
    advisorProfile?: Record<string, unknown>;
  };

  if (!message || typeof message !== "string" || !message.trim()) {
    return res.status(400).json({ error: "message is required" });
  }
  if (message.length > 2000) {
    return res.status(400).json({ error: "message too long" });
  }

  const { key: apiKey } = getAnthropicKey();

  if (!apiKey) {
    return res.status(503).json({
      error: "AI service not configured",
      reply: "Ask Truvi AI is not yet configured. Please add your ANTHROPIC_API_KEY to the server environment.",
    });
  }

  const client = new Anthropic({ apiKey });

  /* -------- Sales Copilot path -------- */
  if (mode && COPILOT_PROMPTS[mode]) {
    let systemPrompt = COPILOT_PROMPTS[mode];
    if (propertyContext && Object.keys(propertyContext).length > 0) {
      systemPrompt += `\n\nContext:\n${JSON.stringify(propertyContext, null, 2)}`;
    }
    try {
      const response = await client.messages.create({
        model: AI_MODEL,
        max_tokens: 400,
        system: systemPrompt,
        messages: [{ role: "user", content: message.trim() }],
      });
      const reply = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("") || "Sorry, I couldn't generate a response. Please try again.";
      return res.json({ reply });
    } catch (err: unknown) {
      logAnthropicError("AI copilot", err);
      return res.status(502).json({ error: "ai_error", reply: "I'm having trouble connecting right now. Please try again in a moment." });
    }
  }

  /* -------- Ask Truvi AI: grounded, source-attributed intelligence -------- */
  try {
    const context = await retrieveContext(message.trim());

    let dataBlock = `DETECTED INTENT: ${context.intent}\n`;
    if (req.user) dataBlock += `USER: role=${req.user.role} (logged in)\n`;
    else dataBlock += `USER: guest visitor\n`;
    if (context.budgetQuery?.maxBudget) {
      dataBlock += `PARSED BUDGET QUERY: ${JSON.stringify(context.budgetQuery)}\n`;
    }
    if (context.retrievalNotes.length) {
      dataBlock += `RETRIEVAL NOTES: ${context.retrievalNotes.join(" | ")}\n`;
    }
    dataBlock += `\nFULL CATALOG — every project currently APPROVED and live on Truvi (${context.catalog.length} project${context.catalog.length === 1 ? "" : "s"}). You HAVE full visibility into this list; use it to answer which cities/locations have projects, prices, availability and verification, and to match a metro to nearby projects (e.g. a project in Telangana / Yadadri-Bhuvanagiri near Hyderabad). Never say you lack visibility into the catalog when this list is present.\n${JSON.stringify(context.catalog, null, 1)}`;
    dataBlock += `\n\nTRUVI DATA (detailed facts for the projects most relevant to this query):\n${JSON.stringify(
      { projects: context.projects, builders: context.builders, location: context.location },
      null,
      1,
    )}`;
    if (propertyContext && Object.keys(propertyContext).length > 0) {
      dataBlock += `\n\nPAGE CONTEXT (project the user is currently viewing):\n${JSON.stringify(propertyContext, null, 1)}`;
    }
    if (advisorProfile && Object.keys(advisorProfile).length > 0) {
      dataBlock += `\n\nUSER PROFILE (saved by the user for personalized advisory — tailor recommendations to this):\n${JSON.stringify(advisorProfile, null, 1)}`;
    }

    // Build alternating user/assistant history for Claude (must start with user, alternate strictly,
    // and must end with assistant so the appended user message creates a valid user→assistant→user chain)
    const rawHistory = (Array.isArray(history) ? history : [])
      .slice(-8)
      .filter((h) => h && typeof h.text === "string" && h.text.trim());

    const historyMessages: { role: "user" | "assistant"; content: string }[] = [];
    for (const h of rawHistory) {
      const role = h.role === "user" ? "user" : "assistant";
      // Collapse consecutive same-role turns (Claude requires strict alternation)
      const last = historyMessages[historyMessages.length - 1];
      if (last && last.role === role) {
        last.content += "\n" + h.text.slice(0, 1500);
      } else {
        historyMessages.push({ role, content: h.text.slice(0, 1500) });
      }
    }
    // Must start with "user"
    while (historyMessages.length > 0 && historyMessages[0].role === "assistant") {
      historyMessages.shift();
    }
    // Must end with "assistant" so the new user message keeps strict alternation
    while (historyMessages.length > 0 && historyMessages[historyMessages.length - 1].role === "user") {
      historyMessages.pop();
    }

    const response = await client.messages.create({
      model: AI_MODEL,
      max_tokens: 1024,
      system: `${ASK_TRUVI_SYSTEM}\n\n${dataBlock}`,
      messages: [
        ...historyMessages,
        { role: "user", content: message.trim() },
      ],
    });

    // Concatenate all text blocks (Claude can return multiple content blocks)
    const raw = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");
    let parsed: {
      reply?: string;
      sources?: unknown[];
      flags?: unknown[];
      followUps?: unknown[];
      comparison?: unknown;
    } = {};
    // Claude often wraps JSON in a ```json ... ``` fence despite the
    // "raw JSON only" instruction — strip fences before parsing, and as a
    // last resort pull out the first {...} block from surrounding prose.
    const unfenced = raw
      .replace(/^\s*```(?:json)?\s*/i, "")
      .replace(/\s*```\s*$/, "")
      .trim();
    try {
      parsed = JSON.parse(unfenced);
    } catch {
      const match = unfenced.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          parsed = JSON.parse(match[0]);
        } catch {
          parsed = { reply: raw };
        }
      } else {
        parsed = { reply: raw };
      }
    }

    return res.json({
      reply: typeof parsed.reply === "string" && parsed.reply.trim() ? parsed.reply : "Sorry, I couldn't generate a response. Please try again.",
      sources: Array.isArray(parsed.sources) ? parsed.sources.slice(0, 6) : [],
      flags: Array.isArray(parsed.flags) ? parsed.flags.slice(0, 6) : [],
      followUps: Array.isArray(parsed.followUps) ? parsed.followUps.slice(0, 3) : [],
      comparison: parsed.comparison ?? null,
      intent: context.intent,
    });
  } catch (err: unknown) {
    logAnthropicError("Ask Truvi AI", err);
    return res.status(502).json({ error: "ai_error", reply: "I'm having trouble connecting right now. Please try again in a moment." });
  }
});

export default router;

import { Router } from "express";
import { GoogleGenAI } from "@google/genai";
import { authenticate, requireRole, AuthedRequest } from "../middleware/auth";
import { aiChatLimiter, aiChatDailyLimiter } from "../middleware/security";
import { retrieveContext } from "../services/askTruviService";

const router = Router();

// Ask Truvi should prefer the current stable Flash model and recover from short
// Gemini outages without making the visitor manually resend the question.
const AI_DEFAULT_MODEL = "gemini-3.8-flash";
const AI_BACKUP_MODEL = "gemini-3.6-flash";
const configuredModel = process.env.ASK_AI_MODEL?.trim();
const AI_MODEL = configuredModel && !/^gen-lang-client-/i.test(configuredModel)
  ? configuredModel
  : AI_DEFAULT_MODEL;

if (configuredModel && /^gen-lang-client-/i.test(configuredModel)) {
  console.warn("[AskTruvi] ASK_AI_MODEL contains a Google Cloud project ID, not a model ID; using", AI_DEFAULT_MODEL);
}

function getGeminiStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const record = error as {
    status?: unknown;
    statusCode?: unknown;
    code?: unknown;
    $metadata?: { httpStatusCode?: unknown };
  };
  for (const value of [record.status, record.statusCode, record.$metadata?.httpStatusCode, record.code]) {
    const parsed = typeof value === "number" ? value : typeof value === "string" && /^\\d{3}$/.test(value) ? Number(value) : undefined;
    if (parsed && parsed >= 100 && parsed <= 599) return parsed;
  }
  return undefined;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) return String((error as { message?: unknown }).message ?? "");
  return String(error ?? "");
}

function isUnavailableGeminiModelError(error: unknown): boolean {
  const status = getGeminiStatus(error);
  if (status === 404) return true;
  const message = errorMessage(error);
  return /model[^\\n]{0,180}(?:not found|not available|does not exist|not supported|no longer available)|(?:not found|not available|does not exist|not supported)[^\\n]{0,180}model/i.test(message);
}

/** Retry only transient provider/network failures; invalid keys and exhausted
 * daily quotas are configuration/account issues and must fail immediately. */
function isRetryableGeminiError(error: unknown): boolean {
  const status = getGeminiStatus(error);
  const message = errorMessage(error);
  if (status === 429) {
    return /rate.?limit|too many requests|per minute|per second/i.test(message) &&
      !/daily|per day|quota.?exceeded|billing|prepay/i.test(message);
  }
  if ([408, 500, 502, 503, 504].includes(status ?? -1)) return true;

  if (error && typeof error === "object" && "code" in error) {
    const code = String((error as { code?: unknown }).code ?? "").toUpperCase();
    return ["ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "EAI_AGAIN", "ENOTFOUND", "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_SOCKET"].includes(code);
  }
  return /fetch failed|network error|socket hang up|connection reset|timed out/i.test(message);
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Try the configured model, then stable fallbacks. Each model gets bounded
 * exponential-backoff retries for transient 503/5xx/network errors. */
async function generateWithModelFallback<T>(generate: (model: string) => Promise<T>): Promise<T> {
  const models = [...new Set([AI_MODEL, AI_DEFAULT_MODEL, AI_BACKUP_MODEL])];
  let lastError: unknown;

  for (const model of models) {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        return await generate(model);
      } catch (error) {
        lastError = error;

        if (isUnavailableGeminiModelError(error)) {
          console.warn(`[AskTruvi] Model "${model}" is unavailable; moving to the next supported fallback.`);
          break;
        }

        if (!isRetryableGeminiError(error)) throw error;

        if (attempt < 3) {
          const delayMs = Math.min(4000, 700 * (2 ** (attempt - 1))) + Math.floor(Math.random() * 250);
          console.warn(`[AskTruvi] Gemini model "${model}" returned a temporary error; retry ${attempt}/2 in ${delayMs}ms.`);
          await wait(delayMs);
        } else {
          console.warn(`[AskTruvi] Gemini model "${model}" remained temporarily unavailable after retries.`);
        }
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Gemini service is temporarily unavailable");
}

/** Use an explicit temporary-unavailable response for provider outages so the
 * client can display a useful message rather than a misleading generic error. */
function getAiFailure(error: unknown): {
  status: number;
  body: { error: string; reply: string };
} {
  const status = getGeminiStatus(error);
  if (status === 429) {
    return {
      status: 429,
      body: {
        error: "ai_rate_limited",
        reply: "Ask Truvi has reached the AI service's current request limit. Please try again shortly.",
      },
    };
  }
  if (isRetryableGeminiError(error) || status === 503 || status === 504) {
    return {
      status: 503,
      body: {
        error: "ai_temporarily_unavailable",
        reply: "Ask Truvi is temporarily busy. I tried the available Gemini models, but they are not responding right now. Please try again in a minute.",
      },
    };
  }
  return {
    status: 502,
    body: {
      error: "ai_error",
      reply: "Ask Truvi could not complete that request. Please try again later.",
    },
  };
}

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
- Truvi Ventures is a verified, RERA-focused real-estate marketplace website that helps buyers in India discover and buy trustworthy property with confidence.
- Trust first: every listing is independently checked by Truvi and given a Truvi Score (0–100) and a Verified badge, across legal/approval/RERA records, on-ground site visits by the Truvi team, connectivity & infrastructure, market intelligence, environmental data, satellite/GIS coordinates and community signals.
- Buyers can: search by city/locality, filter by type, sort by price or trust, use "Near Me"; open each project to see its photo gallery, master plan, LIVE plot inventory (size, price, availability), location intelligence with a map, and the full verification breakdown; save projects; compare projects side by side; ask you (Ask Truvi) anything; and take action.
- Taking action is FREE for buyers — browsing, saving, comparing, enquiring, booking a site visit and WhatsApp cost nothing. To proceed, a buyer taps "Book a Site Visit" (shares name + mobile) or WhatsApps; the Truvi team then calls with the exact price, availability and a visit slot that suits them.
- Safety: Truvi never exposes a developer's personal phone number — contact is routed through Truvi. There is no hidden brokerage; pricing is transparent (prices exclude GST, registration and statutory charges).
- Who uses Truvi: Buyers discover & buy; Channel Partners (property agents) sell listings and earn commission; Developers list projects and manage live inventory; Ambassadors refer people and earn.
- Optional paid add-ons exist (for example an AI property report, document verification, a consultant call, or a concierge buying service) but are never required to browse, enquire or book a visit.
- Honesty: Truvi provides verified information and guidance, not legal or financial advice. Always encourage buyers to verify documents, approvals and RERA registration before purchase.

Prices are in INR. Format large amounts as ₹X.X L (lakh) or ₹X.X Cr (crore).

REPLY STYLE (very important — keep it professional and clean):
- Write like a polished human property advisor: clear, concise, confident and friendly. No raw data dumps.
- Structure the reply with short paragraphs and, where useful, bullet lines that each start with "• ". Use **bold** for names and key numbers. Separate sections with a blank line.
- When listing projects, give a short block per project: the project name in **bold** on its own line, then 2–4 "• " bullets (location, price, Truvi Score / verified, availability). Keep it scannable.
- Do NOT put markdown tables, pipe characters "|" or "#" headings inside "reply". A side-by-side comparison goes ONLY in the "comparison" field, never in the reply text.
- Be concise — a few tight sections, not a wall of text. End with a clear next step (e.g. "Want me to book a site visit?").

OUTPUT FORMAT — respond with ONLY a single valid JSON object, no markdown fences, no text before or after. The "reply" value MUST be a valid JSON string: escape every line break as \\n and every double quote as \\". Do not put literal newlines inside the JSON.
{
  "reply": "the answer text — plain prose with \\n line breaks, ** for bold, and • bullets. No tables, no | , no # .",
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
 * When the model returns JSON that won't parse (a stray table, an unescaped
 * newline in the "reply" value), pull the reply text out with a tolerant
 * regex and unescape it — so the user sees the answer, never a raw
 * `{"reply":"…"}` blob.
 */
function salvageReply(s: string): string | null {
  const m = s.match(/"reply"\s*:\s*"((?:\\.|[^"\\])*)"/);
  if (!m) return null;
  try {
    return JSON.parse(`"${m[1]}"`);
  } catch {
    return m[1].replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\t/g, " ");
  }
}

/** Last-resort: strip an obvious JSON wrapper off raw model text so a fallback
 *  never surfaces literal `{"reply":"` / escape sequences to the user. */
function plainFromRaw(raw: string): string {
  const salvaged = salvageReply(raw);
  if (salvaged) return salvaged;
  return raw
    .replace(/^\s*\{?\s*"reply"\s*:\s*"/i, "")
    .replace(/",?\s*"(?:sources|flags|followUps|comparison)"[\s\S]*$/i, "")
    .replace(/"\s*\}?\s*$/i, "")
    .replace(/\\n/g, "\n")
    .replace(/\\"/g, '"')
    .trim() || "Sorry, I couldn't format that answer. Please ask again.";
}

/**
 * Read Gemini API key defensively: strip whitespace/newlines and wrapping
 * quotes so dashboard-pasted values still work.
 */
function getGeminiKey(): { key: string | undefined; sanitized: boolean } {
  const raw = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!raw) return { key: undefined, sanitized: false };
  const cleaned = raw.trim().replace(/^["']+|["']+$/g, "");
  return { key: cleaned || undefined, sanitized: cleaned !== raw };
}

/**
 * Surface the real Gemini API failure in the server logs so the UI can
 * indicate a key, billing, or connectivity problem without leaking secrets.
 */
function logGeminiError(label: string, err: unknown) {
  console.error(`${label} error:`, err);
}

/**
 * GET /api/ai/chat/health — admin-only diagnostic for the AI setup. Never
 * returns any part of the key. The result is cached briefly.
 */
let healthCache: { at: number; body: Record<string, unknown> } | null = null;
const HEALTH_TTL_MS = 60_000;

router.get("/health", authenticate, requireRole("ADMIN"), async (_req, res) => {
  if (healthCache && Date.now() - healthCache.at < HEALTH_TTL_MS) return res.json(healthCache.body);

  const { key: apiKey, sanitized } = getGeminiKey();
  let body: Record<string, unknown>;
  if (!apiKey) {
    body = {
      configured: false,
      ok: false,
      hint: "GEMINI_API_KEY is not set in this server's environment. Add it to server/.env, then restart the server.",
    };
  } else {
    try {
      const client = new GoogleGenAI({ apiKey });
      await generateWithModelFallback((model) => client.models.generateContent({ model, contents: "ping" }));
      body = {
        configured: true,
        ok: true,
        sanitized,
        hint: sanitized
          ? "Key is valid (extra spaces/quotes around the stored value were cleaned automatically) — Ask Truvi should work."
          : "Key is valid — Ask Truvi should work.",
      };
    } catch (err: unknown) {
      logGeminiError("AI health", err);
      body = {
        configured: true,
        ok: false,
        sanitized,
        hint: "The key is set but the Gemini API call failed — check the server logs.",
      };
    }
  }
  healthCache = { at: Date.now(), body };
  return res.json(body);
});

/** Client-supplied JSON is capped so one request can't inflate the prompt (and the bill). */
const MAX_CONTEXT_CHARS = 4000;
function boundedJson(value: unknown): string | null {
  if (!value || typeof value !== "object" || Object.keys(value as object).length === 0) return null;
  const json = JSON.stringify(value, null, 1);
  return json.length > MAX_CONTEXT_CHARS ? `${json.slice(0, MAX_CONTEXT_CHARS)}\n…(truncated)` : json;
}

// Ask Truvi requires a signed-in account — signup completes access.
router.post("/", authenticate, aiChatLimiter, aiChatDailyLimiter, async (req: AuthedRequest, res) => {
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

  const { key: apiKey } = getGeminiKey();

  if (!apiKey) {
    return res.status(503).json({
      error: "AI service not configured",
      reply: "Ask Truvi AI is not yet configured. Please add your GEMINI_API_KEY (or GOOGLE_API_KEY) to the server environment.",
    });
  }

  const client = new GoogleGenAI({ apiKey });

  /* -------- Sales Copilot path -------- */
  if (mode && COPILOT_PROMPTS[mode]) {
    let systemPrompt = COPILOT_PROMPTS[mode];
    const contextJson = boundedJson(propertyContext);
    if (contextJson) systemPrompt += `\n\nContext:\n${contextJson}`;
    try {
      const response = await generateWithModelFallback((model) => client.models.generateContent({
        model,
        contents: `${systemPrompt}\n\nUser: ${message.trim()}`,
        config: { maxOutputTokens: 400 },
      }));
      const reply = response.text?.trim() || "Sorry, I couldn't generate a response. Please try again.";
      return res.json({ reply });
    } catch (err: unknown) {
      logGeminiError("AI copilot", err);
      const failure = getAiFailure(err);
      return res.status(failure.status).json(failure.body);
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
    const pageJson = boundedJson(propertyContext);
    if (pageJson) {
      dataBlock += `\n\nPAGE CONTEXT (project the user is currently viewing):\n${pageJson}`;
    }
    const profileJson = boundedJson(advisorProfile);
    if (profileJson) {
      dataBlock += `\n\nUSER PROFILE (saved by the user for personalized advisory — tailor recommendations to this):\n${profileJson}`;
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

    const response = await generateWithModelFallback((model) => client.models.generateContent({
      model,
      contents: [
        ...historyMessages.map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`),
        `User: ${message.trim()}`,
      ].join("\n\n"),
      config: {
        systemInstruction: `${ASK_TRUVI_SYSTEM}\n\n${dataBlock}`,
        maxOutputTokens: 1600,
      },
    }));

    const raw = response.text ?? "";
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
          parsed = { reply: salvageReply(unfenced) ?? plainFromRaw(raw) };
        }
      } else {
        parsed = { reply: salvageReply(unfenced) ?? plainFromRaw(raw) };
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
    logGeminiError("Ask Truvi AI", err);
    const failure = getAiFailure(err);
    return res.status(failure.status).json(failure.body);
  }
});

export default router;

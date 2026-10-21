import { GoogleGenAI } from "@google/genai";
import fs from "fs";

/** Overridable; falls back to a modern Gemini model. */
const MODEL = process.env.MEDIA_AI_MODEL?.trim() || process.env.ASK_AI_MODEL?.trim() || "gemini-2.5-flash";
const SUPPORTED = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

function getKey(): string | undefined {
  return process.env.GEMINI_API_KEY?.trim().replace(/\s+/g, "") || process.env.GOOGLE_API_KEY?.trim().replace(/\s+/g, "") || undefined;
}

/**
 * Rate a property photo 0–100 on how attractive / high-quality it is as a
 * listing cover, using Claude vision. Returns null when AI isn't configured,
 * the format isn't a supported image, the file is too large, or the call fails
 * — callers then fall back to the resolution heuristic. Never throws.
 */
export async function scoreImageFile(filePath: string, mimeType: string): Promise<number | null> {
  const apiKey = getKey();
  if (!apiKey || !SUPPORTED.has(mimeType)) return null;

  let base64: string;
  try {
    const buf = await fs.promises.readFile(filePath);
    // Claude caps images around ~5 MB — skip larger files (they still win on
    // resolution in the fallback ordering).
    if (buf.length > 5 * 1024 * 1024) return null;
    base64 = buf.toString("base64");
  } catch {
    return null;
  }

  try {
    const client = new GoogleGenAI({ apiKey });
    const res = await client.models.generateContent({
      model: MODEL,
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { mimeType, data: base64 } },
            { text: "Score this property photo 0-100 as a listing cover. Reply with only the number." },
          ],
        },
      ],
      config: {
        systemInstruction:
          "You rate real-estate listing photos on how attractive and high-quality they are as a cover image — composition, lighting, sharpness and buyer appeal. Reply with ONLY an integer from 0 to 100. No words, no punctuation.",
        maxOutputTokens: 12,
      },
    });
    const text = res.text ?? "";
    const m = text.match(/\d{1,3}/);
    if (!m) return null;
    return Math.max(0, Math.min(100, parseInt(m[0], 10)));
  } catch {
    return null;
  }
}

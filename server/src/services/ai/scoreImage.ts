import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";

/** Overridable; falls back to the id the rest of the app uses. */
const MODEL = process.env.MEDIA_AI_MODEL?.trim() || process.env.ASK_AI_MODEL?.trim() || "claude-opus-4-5";
const SUPPORTED = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

function getKey(): string | undefined {
  return process.env.ANTHROPIC_API_KEY?.trim().replace(/\s+/g, "") || undefined;
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
    const client = new Anthropic({ apiKey });
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 12,
      system:
        "You rate real-estate listing photos on how attractive and high-quality they are as a cover image — composition, lighting, sharpness and buyer appeal. Reply with ONLY an integer from 0 to 100. No words, no punctuation.",
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp", data: base64 } },
            { type: "text", text: "Score this property photo 0-100 as a listing cover. Reply with only the number." },
          ],
        },
      ],
    });
    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join(" ");
    const m = text.match(/\d{1,3}/);
    if (!m) return null;
    return Math.max(0, Math.min(100, parseInt(m[0], 10)));
  } catch {
    return null;
  }
}

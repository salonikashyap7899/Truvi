/**
 * Origins allowed to make cross-origin (and Socket.io) requests to this
 * server. Supports Replit's proxied preview domains (*.replit.dev / *.repl.co),
 * any explicitly configured CLIENT_URL value(s), and Render's RENDER_EXTERNAL_URL.
 */
export function getAllowedOrigins(): string[] | boolean {
  const replitDomains = process.env.REPLIT_DOMAINS;
  if (replitDomains) {
    return true;
  }

  const configured =
    process.env.CLIENT_URL?.split(",")
      .map((origin) => origin.trim())
      .filter(Boolean) ?? [];

  if (process.env.RENDER_EXTERNAL_URL) configured.push(process.env.RENDER_EXTERNAL_URL);
  if (configured.length === 0) configured.push("http://localhost:5173", "http://localhost:5000");

  return configured;
}

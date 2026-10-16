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

  // The public site is reachable on both apex and www hosts. Treat those as
  // equivalent allowed frontend origins so API requests keep working when a
  // visitor follows a link that uses the other host.
  for (const origin of [...configured]) {
    try {
      const url = new URL(origin);
      if (url.hostname === "truviventures.com") {
        configured.push(`${url.protocol}//www.truviventures.com`);
      } else if (url.hostname === "www.truviventures.com") {
        configured.push(`${url.protocol}//truviventures.com`);
      }
    } catch {
      // Keep malformed configured origins unchanged; CORS will not match them.
    }
  }

  if (process.env.RENDER_EXTERNAL_URL) configured.push(process.env.RENDER_EXTERNAL_URL);
  if (configured.length === 0) configured.push("http://localhost:5173", "http://localhost:5000");

  // The installed Capacitor (Android) app serves its bundled UI from
  // https://localhost and calls this API cross-origin, so those origins must
  // always be allowed for the app's requests (and its refresh cookie) to work.
  for (const origin of ["https://localhost", "capacitor://localhost", "http://localhost"]) {
    if (!configured.includes(origin)) configured.push(origin);
  }

  return configured;
}

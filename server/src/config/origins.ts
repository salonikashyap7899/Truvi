/**
 * Origins allowed to make cross-origin (and Socket.io) requests to this
 * server. Combines any explicitly configured CLIENT_URL value(s) — comma
 * separated if there's more than one, e.g. a custom domain alongside the
 * default onrender.com one — with Render's auto-injected RENDER_EXTERNAL_URL,
 * so CORS and the Socket.io handshake work on first deploy without knowing
 * the public URL in advance.
 */
export function getAllowedOrigins(): string[] {
  const configured =
    process.env.CLIENT_URL?.split(",")
      .map((origin) => origin.trim())
      .filter(Boolean) ?? [];

  if (process.env.RENDER_EXTERNAL_URL) configured.push(process.env.RENDER_EXTERNAL_URL);
  if (configured.length === 0) configured.push("http://localhost:5173");

  return configured;
}

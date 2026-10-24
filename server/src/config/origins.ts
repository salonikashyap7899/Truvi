/**
 * Exact origins trusted for browser and Socket.io requests.
 * Never return wildcard/boolean CORS when credentials are enabled.
 */
function normalizedOrigin(value: string): string | null {
  const local = ["development", "test"].includes((process.env.NODE_ENV || "").trim().toLowerCase());
  try {
    // This service serves browser clients only; reject native Capacitor origins.
    if (/^capacitor:\/\//i.test(value)) return null;
    const candidate = /^https?:\/\//i.test(value) ? value : "https://" + value;
    const url = new URL(candidate);
    if (url.protocol === "https:") return url.origin;
    if (local && url.protocol === "http:") return url.origin;
    return null;
  } catch {
    return null;
  }
}

export function getAllowedOrigins(): string[] {
  const origins = new Set<string>();
  const local = ["development", "test"].includes((process.env.NODE_ENV || "").trim().toLowerCase());

  const addOrigin = (raw: string) => {
    const origin = normalizedOrigin(raw.trim());
    if (!origin) return;
    origins.add(origin);
    try {
      const url = new URL(origin);
      if (url.protocol === "https:" && url.hostname === "truviventures.com") origins.add("https://www.truviventures.com");
      else if (url.protocol === "https:" && url.hostname === "www.truviventures.com") origins.add("https://truviventures.com");
    } catch {
      // Ignore malformed origin values.
    }
  };

  // CLIENT_URL is the exact frontend allow-list; comma-separated origins are supported.
  for (const origin of (process.env.CLIENT_URL || "").split(",")) if (origin.trim()) addOrigin(origin);

  // REPLIT_DOMAINS supplies exact environment-owned hosts, not permission to
  // accept arbitrary origins. Each configured host is added separately.
  for (const domain of (process.env.REPLIT_DOMAINS || "").split(",")) if (domain.trim()) addOrigin(domain);
  if (process.env.RENDER_EXTERNAL_URL) addOrigin(process.env.RENDER_EXTERNAL_URL);

  // Local browser origins are enabled only in development/test.
  if (local) {
    origins.add("http://localhost");
    origins.add("http://localhost:5173");
    origins.add("http://localhost:5000");
  }

  return [...origins];
}

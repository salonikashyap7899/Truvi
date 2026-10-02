// Central configuration for the Truvi production test suite.
// Everything here is overridable via environment variables so the suite is
// portable across machines (your laptop, CI, a Claude web session, etc.).

export const BASE_URL = (process.env.TRUVI_BASE_URL || "https://truviventures.com/").replace(/\/+$/, "/") ;

// Viewports used by the responsive test (and available to others).
export const VIEWPORTS = [
  { name: "mobile", width: 360, height: 780 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1440, height: 900 },
];

// How far the crawler is allowed to roam. Same-origin only.
export const CRAWL = {
  maxPages: Number(process.env.TRUVI_MAX_PAGES || 40),
  maxDepth: Number(process.env.TRUVI_MAX_DEPTH || 3),
  // Paths matching any of these are never opened as pages (still link-checked).
  skipPathPatterns: [
    /\.(pdf|zip|jpg|jpeg|png|gif|svg|webp|mp4|webm|ico|css|js|woff2?|ttf)$/i,
    /^\/(login|logout|signout|api)\b/i, // avoid auth flows / API endpoints as "pages"
  ],
};

// Pages Lighthouse runs against. The first is always the homepage; the crawler
// fills in the rest if these are not present. Override with TRUVI_LH_PAGES
// (comma-separated absolute paths).
export const LIGHTHOUSE_PAGES = (process.env.TRUVI_LH_PAGES || "/")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// Timeouts (ms)
export const TIMEOUTS = {
  navigation: Number(process.env.TRUVI_NAV_TIMEOUT || 45000),
  settle: Number(process.env.TRUVI_SETTLE || 2500), // extra wait for JS-rendered content
  request: Number(process.env.TRUVI_REQ_TIMEOUT || 20000),
};

// Common Supabase table names to probe for the read-only RLS check. These are
// GET-only reads; nothing is ever written. Extend via TRUVI_RLS_TABLES.
export const RLS_TABLES = (
  process.env.TRUVI_RLS_TABLES ||
  "leads,contacts,inquiries,enquiries,users,profiles,properties,listings,projects,submissions,messages,newsletter,subscribers,waitlist,bookings,appointments"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

export const OUT_DIR = new URL("./results/", import.meta.url).pathname;
export const SHOTS_DIR = new URL("./screenshots/", import.meta.url).pathname;

// TEST 4 — Supabase RLS exposure check (READ-ONLY, critical).
//
// 1. Load the site in a real browser and harvest the Supabase project URL and
//    the PUBLIC anon key from the JS bundle / live network traffic.
// 2. Confirm NO service-role / secret key is shipped to the browser.
// 3. Using ONLY the public anon key, issue GET (SELECT) requests against the
//    leads table and other common tables to see what RLS lets an anonymous
//    visitor read. Nothing is ever inserted, updated, or deleted — GET only.

import { standalone, isMain } from "../lib/runner.mjs";
import { Findings, SEVERITY, clip } from "../lib/findings.mjs";
import { BASE_URL, RLS_TABLES, TIMEOUTS } from "../config.mjs";

function decodeJwt(token) {
  try {
    const [, payload] = token.split(".");
    const json = Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    return JSON.parse(json);
  } catch {
    return null;
  }
}

// Harvest keys/urls from a blob of text (bundle or HTML).
function harvest(text, into) {
  if (!text) return;
  for (const m of text.matchAll(/https:\/\/([a-z0-9]{16,40})\.supabase\.co/gi)) into.urls.add(`https://${m[1]}.supabase.co`);
  for (const m of text.matchAll(/eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g)) into.jwts.add(m[0]);
  // obvious non-JWT secret patterns that must never ship to a browser
  for (const re of [/service_role/gi, /SUPABASE_SERVICE_ROLE[_A-Z]*\s*[:=]/gi, /sk_live_[A-Za-z0-9]+/g, /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/g]) {
    for (const m of text.matchAll(re)) into.secretHits.add(m[0].slice(0, 60));
  }
}

export async function run(shared) {
  const f = new Findings("Supabase / RLS");
  const context = shared.context;
  const page = await context.newPage();

  const harvested = { urls: new Set(), jwts: new Set(), secretHits: new Set(), liveApiKeys: new Set(), tablesSeen: new Set() };

  // Capture JS/HTML bodies and live Supabase requests.
  page.on("response", async (res) => {
    try {
      const url = res.url();
      const ct = (res.headers()["content-type"] || "").toLowerCase();
      if (/supabase\.co\/rest\/v1\/([a-z0-9_]+)/i.test(url)) {
        const t = url.match(/rest\/v1\/([a-z0-9_]+)/i);
        if (t) harvested.tablesSeen.add(t[1]);
      }
      if (ct.includes("javascript") || ct.includes("html") || url.endsWith(".js")) {
        const body = await res.text().catch(() => "");
        harvest(body, harvested);
      }
    } catch {}
  });
  page.on("request", (req) => {
    const h = req.headers();
    if (/supabase\.co/i.test(req.url())) {
      if (h["apikey"]) harvested.liveApiKeys.add(h["apikey"]);
      if (h["authorization"]) {
        const m = h["authorization"].match(/eyJ[\w-]+\.eyJ[\w-]+\.[\w-]+/);
        if (m) harvested.liveApiKeys.add(m[0]);
      }
    }
  });

  try {
    await page.goto(BASE_URL, { waitUntil: "networkidle", timeout: TIMEOUTS.navigation });
    await page.waitForTimeout(2500);
  } catch (e) {
    f.error(`Could not load site to harvest keys: ${e.message}`);
    await page.close();
    return f.save("04-supabase-rls");
  }
  // Also scan the raw HTML directly.
  harvest(await page.content().catch(() => ""), harvested);
  await page.close();

  const supabaseUrl = [...harvested.urls][0] || null;
  const allJwts = new Set([...harvested.jwts, ...harvested.liveApiKeys]);

  // Classify JWTs by role claim.
  let anonKey = null;
  const roleFindings = [];
  for (const jwt of allJwts) {
    const p = decodeJwt(jwt);
    const role = p?.role || "unknown";
    if (role === "anon") anonKey = anonKey || jwt;
    roleFindings.push({ role, ref: p?.ref, iss: p?.iss });
    if (role === "service_role") {
      f.add({
        issue: "SERVICE-ROLE Supabase key exposed in the frontend",
        steps: "Load the site and inspect the JS bundle / network traffic",
        severity: SEVERITY.CRITICAL,
        evidence: `JWT with role=service_role present (ref=${p?.ref || "?"})`,
        fix: "Immediately rotate the key in Supabase, remove it from the frontend, and only use it server-side.",
      });
    }
  }
  for (const s of harvested.secretHits) {
    f.add({
      issue: "Possible secret/private material in frontend bundle",
      steps: "Search the JS bundle for secret patterns",
      severity: SEVERITY.HIGH,
      evidence: clip(s),
      fix: "Remove secrets from client code; keep them server-side only.",
    });
  }

  if (!supabaseUrl && !anonKey) {
    f.pass(
      "No Supabase project URL or anon key found in the frontend",
      "Either the site does not call Supabase directly from the browser (server-side API instead) or the bundle was not captured. This is generally a GOOD posture — no public DB key to abuse."
    );
    return f.save("04-supabase-rls");
  }
  if (supabaseUrl) f.pass(`Supabase project detected`, `URL: ${supabaseUrl}`);
  if (anonKey) f.pass(`Public anon key found (expected & safe to be public)`, `role=anon`);

  if (!supabaseUrl || !anonKey) {
    f.error("Found partial Supabase config; cannot run RLS SELECT probes without both URL and anon key.");
    return f.save("04-supabase-rls");
  }

  // ---- READ-ONLY SELECT probes using ONLY the anon key ----
  const headers = { apikey: anonKey, Authorization: `Bearer ${anonKey}`, Accept: "application/json" };
  const tables = [...new Set([...harvested.tablesSeen, ...RLS_TABLES])];
  const SENSITIVE = /lead|contact|inquir|enquir|user|profile|submission|message|subscriber|booking|appointment|payment|order/i;

  async function selectOne(table) {
    const url = `${supabaseUrl}/rest/v1/${encodeURIComponent(table)}?select=*&limit=1`;
    try {
      const res = await context.request.get(url, {
        headers: { ...headers, Prefer: "count=exact" },
        timeout: TIMEOUTS.request,
        failOnStatusCode: false,
      });
      const status = res.status();
      const contentRange = res.headers()["content-range"] || "";
      let rows = [];
      try { rows = await res.json(); } catch {}
      return { status, count: Array.isArray(rows) ? rows.length : 0, contentRange, sampleKeys: Array.isArray(rows) && rows[0] ? Object.keys(rows[0]).slice(0, 12) : [] };
    } catch (e) {
      return { status: 0, error: e.message };
    }
  }

  let exposed = 0, locked = 0, absent = 0;
  for (const table of tables) {
    const r = await selectOne(table);
    if (r.status === 200 && r.count > 0) {
      exposed++;
      const sev = SENSITIVE.test(table) ? SEVERITY.CRITICAL : SEVERITY.HIGH;
      f.add({
        issue: `Anon key can SELECT rows from "${table}" (RLS too permissive)`,
        steps: `GET ${supabaseUrl}/rest/v1/${table}?select=*&limit=1 with only the public anon apikey`,
        severity: sev,
        evidence: `HTTP 200, returned data. Columns: ${clip(r.sampleKeys.join(", "))}. ${r.contentRange ? "Total rows " + r.contentRange.split("/").pop() : ""}`,
        fix: `Enable RLS on "${table}" and remove public SELECT for the anon role (or restrict to intended columns/rows).`,
      });
    } else if (r.status === 200 && r.count === 0) {
      // readable but empty — still means the policy allows anon SELECT
      f.add({
        issue: `Anon SELECT allowed on "${table}" (returned 0 rows, but policy permits reads)`,
        steps: `GET ${supabaseUrl}/rest/v1/${table}?select=*&limit=1 with the anon key`,
        severity: SENSITIVE.test(table) ? SEVERITY.HIGH : SEVERITY.LOW,
        evidence: `HTTP 200, empty array (table empty or all rows filtered)`,
        fix: `Confirm RLS intends anonymous reads on "${table}"; lock down if not.`,
      });
      locked++;
    } else if (r.status === 401 || r.status === 403 || (r.status === 400 && /permission|RLS|policy/i.test(JSON.stringify(r)))) {
      locked++;
    } else if (r.status === 404) {
      absent++;
    }
  }

  f.pass(
    `RLS SELECT probes complete (read-only)`,
    `Probed ${tables.length} table(s): ${exposed} exposed with data, ${locked} locked/empty, ${absent} not present.`
  );

  return f.save("04-supabase-rls");
}

if (isMain(import.meta.url)) {
  standalone(run).then((p) =>
    console.log(`Supabase/RLS: ${p.items.filter((i) => i.severity !== "Info").length} issue(s), ${p.errors.length} error(s)`)
  );
}

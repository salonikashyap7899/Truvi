/**
 * Post-deploy smoke test — a fast, READ-ONLY health check you can run against a
 * live Truvi server (local, staging or the production VPS) after every deploy.
 *
 * It creates NO data, so it is safe to run against production. It verifies:
 *   • the server is up and serving,
 *   • public read endpoints respond,
 *   • an admin/founder can log in,
 *   • every admin/founder dashboard endpoint returns 200 (this is what catches a
 *     stale/partial build where new routes 404),
 *   • the KYC-records and detailed-user-profile routes are live,
 *   • the auth gates hold (unauthenticated admin request is rejected).
 *
 * Usage (from the repo root or the server dir):
 *   SMOKE_BASE_URL=https://your-domain.com \
 *   SMOKE_ADMIN_EMAIL=admin@truvi.app \
 *   SMOKE_ADMIN_PASSWORD='••••••' \
 *   npm --prefix server run smoke
 *
 * Notes:
 *   • BASE_URL defaults to http://127.0.0.1:5055 (a locally running server).
 *   • If no admin credentials are given, the authenticated checks are skipped
 *     (the public + auth-gate checks still run).
 *   • Exits non-zero if any check fails, so it works in CI / deploy scripts.
 */

const BASE = (process.env.SMOKE_BASE_URL || "http://127.0.0.1:5055").replace(/\/$/, "");
const ADMIN_EMAIL = process.env.SMOKE_ADMIN_EMAIL?.trim() || "";
const ADMIN_PASSWORD = process.env.SMOKE_ADMIN_PASSWORD || "";

let pass = 0;
let fail = 0;
const failed: string[] = [];

function record(name: string, ok: boolean, detail = "") {
  if (ok) {
    pass++;
    console.log(`  ✓ ${name}${detail ? `  (${detail})` : ""}`);
  } else {
    fail++;
    failed.push(name);
    console.log(`  ✗ ${name}${detail ? `  (${detail})` : ""}`);
  }
}

interface Result { status: number; json: any; }
async function call(method: string, path: string, token?: string, body?: unknown): Promise<Result> {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 10000);
  try {
    const res = await fetch(`${BASE}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: ac.signal });
    let json: any = null;
    if ((res.headers.get("content-type") || "").includes("application/json")) json = await res.json().catch(() => null);
    return { status: res.status, json };
  } catch (e) {
    return { status: 0, json: { error: String(e) } };
  } finally {
    clearTimeout(timer);
  }
}

// Admin/founder dashboard read endpoints — all must return 200. A 404 here is
// the classic "deployed a stale build" symptom.
const ADMIN_DASHBOARDS = [
  "/api/admin/founder-overview",
  "/api/admin/investor-metrics",
  "/api/admin/kpi-trends",
  "/api/admin/founder-analytics",
  "/api/admin/cp-performance",
  "/api/admin/developer-performance",
  "/api/admin/inventory-overview",
  "/api/admin/bookings-overview",
  "/api/admin/legal-overview",
  "/api/admin/support-overview",
  "/api/admin/ops-overview",
  "/api/admin/users?all=true",
  "/api/admin/projects",
  "/api/admin/documents",
  "/api/admin/kyc/records",
];

async function main() {
  console.log(`\n════ TRUVI SMOKE TEST → ${BASE} ════\n`);

  // 1. Server up + public reads
  console.log("[1] Server up & public read paths");
  record("GET /health", (await call("GET", "/health")).status === 200);
  record("GET /api/inventory", (await call("GET", "/api/inventory")).status === 200);
  const pub = await call("GET", "/api/public/projects");
  record("GET /api/public/projects", pub.status === 200 || pub.status === 404, `status ${pub.status}`);

  // 2. Auth gate holds without a token
  console.log("\n[2] Auth gates");
  record("Admin route rejects unauthenticated", (await call("GET", "/api/admin/users")).status === 401);

  // 3. Authenticated admin checks (only if credentials were supplied)
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    console.log("\n[3] Admin checks SKIPPED — set SMOKE_ADMIN_EMAIL and SMOKE_ADMIN_PASSWORD to enable.");
  } else {
    console.log("\n[3] Admin/founder login + dashboards");
    const loginRes = await call("POST", "/api/auth/login", undefined, { email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
    const token = loginRes.json?.accessToken as string | undefined;
    record("Admin/founder login", loginRes.status === 200 && !!token, `status ${loginRes.status}`);

    if (token) {
      for (const path of ADMIN_DASHBOARDS) {
        const r = await call("GET", path, token);
        record(`GET ${path}`, r.status === 200, `status ${r.status}`);
      }

      // Detailed-profile route is live (read-only): grab any existing user and
      // open their admin profile.
      const usersRes = await call("GET", "/api/admin/users?all=true", token);
      const anyUser = usersRes.json?.users?.[0];
      if (anyUser?._id) {
        const prof = await call("GET", `/api/admin/users/${anyUser._id}/profile`, token);
        record("GET /api/admin/users/:id/profile", prof.status === 200 && !!prof.json?.profile, `status ${prof.status}`);
      } else {
        console.log("  – (no users to profile — skipping detailed-profile check)");
      }
    }
  }

  console.log("\n════ RESULT ════");
  console.log(`  PASS: ${pass}   FAIL: ${fail}`);
  if (failed.length) console.log(`  Failing: ${failed.join(" | ")}`);
  console.log("════════════════\n");
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("Smoke test crashed:", e);
  process.exit(2);
});

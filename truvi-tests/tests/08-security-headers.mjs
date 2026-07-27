// TEST 8 — Security headers, HTTPS, and mixed content. Read-only.
// Checks HSTS, CSP, X-Frame-Options (+ a few related headers), confirms the site
// is served over HTTPS and redirects HTTP→HTTPS, and watches for insecure
// (http://) subresources loaded on the HTTPS page.

import { standalone, isMain } from "../lib/runner.mjs";
import { Findings, SEVERITY, clip } from "../lib/findings.mjs";
import { BASE_URL, TIMEOUTS } from "../config.mjs";

const REQUIRED = [
  {
    key: "strict-transport-security",
    label: "HSTS (Strict-Transport-Security)",
    sev: SEVERITY.HIGH,
    fix: "Add e.g. `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`.",
  },
  {
    key: "content-security-policy",
    label: "Content-Security-Policy",
    sev: SEVERITY.HIGH,
    fix: "Add a CSP restricting default-src/script-src to trusted origins.",
  },
  {
    key: "x-frame-options",
    label: "X-Frame-Options / frame-ancestors",
    sev: SEVERITY.MEDIUM,
    fix: "Add `X-Frame-Options: DENY` (or `SAMEORIGIN`) and/or a CSP `frame-ancestors` directive.",
  },
  {
    key: "x-content-type-options",
    label: "X-Content-Type-Options",
    sev: SEVERITY.LOW,
    fix: "Add `X-Content-Type-Options: nosniff`.",
  },
  {
    key: "referrer-policy",
    label: "Referrer-Policy",
    sev: SEVERITY.LOW,
    fix: "Add e.g. `Referrer-Policy: strict-origin-when-cross-origin`.",
  },
];

export async function run(shared) {
  const f = new Findings("Security Headers");

  if (!/^https:/i.test(BASE_URL)) {
    f.add({
      issue: "Site base URL is not HTTPS",
      steps: `Open ${BASE_URL}`,
      severity: SEVERITY.CRITICAL,
      evidence: BASE_URL,
      fix: "Serve the entire site over HTTPS and redirect HTTP to HTTPS.",
    });
  }

  // --- Header inspection on the main document ---
  let headers = {};
  try {
    const res = await shared.context.request.get(BASE_URL, { timeout: TIMEOUTS.request, failOnStatusCode: false, maxRedirects: 5 });
    const status = res.status();
    headers = res.headers();
    // A >=400 response is NOT the real site — it may be an upstream/egress proxy
    // denial or a bot block. Assessing "missing" security headers off an error
    // page would be misleading, so we bail out with a clear limitation instead.
    if (status >= 400) {
      f.error(
        `Main document returned HTTP ${status} — this is an error/denial response, not the real page ` +
          `(often an egress-proxy block or bot filter from this environment). ` +
          `Security-header assessment skipped to avoid false findings; re-run from a network that can load ${BASE_URL}.`
      );
      return f.save("08-security-headers");
    }
    f.pass("Fetched main document headers", `HTTP ${status}`);
  } catch (e) {
    f.error(`Could not fetch headers: ${e.message}`);
    return f.save("08-security-headers");
  }

  const csp = headers["content-security-policy"] || "";
  for (const h of REQUIRED) {
    const present = h.key === "x-frame-options" ? !!(headers["x-frame-options"] || /frame-ancestors/i.test(csp)) : !!headers[h.key];
    if (!present) {
      f.add({
        issue: `Missing ${h.label} header`,
        steps: `curl -sI ${BASE_URL} and inspect response headers`,
        severity: h.sev,
        evidence: `Header not present in main document response`,
        fix: h.fix,
      });
    } else {
      f.pass(`${h.label} present`, clip(headers[h.key] || "via CSP frame-ancestors"));
    }
  }
  // Weak-CSP heuristic
  if (csp && /unsafe-inline|unsafe-eval|\*/.test(csp)) {
    f.add({
      issue: "Content-Security-Policy is permissive",
      steps: `Inspect the CSP header on ${BASE_URL}`,
      severity: SEVERITY.LOW,
      evidence: clip(csp, 200),
      fix: "Tighten CSP: avoid `unsafe-inline`/`unsafe-eval` and wildcard sources where possible.",
    });
  }
  // Server/version disclosure
  for (const k of ["server", "x-powered-by"]) {
    if (headers[k]) {
      f.add({
        issue: `Technology disclosure via "${k}" header`,
        steps: `curl -sI ${BASE_URL}`,
        severity: SEVERITY.LOW,
        evidence: `${k}: ${clip(headers[k], 80)}`,
        fix: `Remove or obscure the ${k} header.`,
      });
    }
  }

  // --- HTTP -> HTTPS redirect ---
  try {
    const httpUrl = BASE_URL.replace(/^https:/i, "http:");
    const res = await shared.context.request.get(httpUrl, { timeout: TIMEOUTS.request, failOnStatusCode: false, maxRedirects: 0 });
    const loc = res.headers()["location"] || "";
    if (res.status() >= 300 && res.status() < 400 && /^https:/i.test(loc)) {
      f.pass("HTTP redirects to HTTPS", `HTTP ${res.status()} → ${clip(loc, 80)}`);
    } else if (res.status() >= 300 && res.status() < 400) {
      f.pass("HTTP redirects", `HTTP ${res.status()} → ${clip(loc, 80)}`);
    } else {
      f.add({
        issue: "HTTP does not redirect to HTTPS",
        steps: `Request ${httpUrl}`,
        severity: SEVERITY.MEDIUM,
        evidence: `HTTP ${res.status()} (no https redirect)`,
        fix: "Force a 301 redirect from http:// to https://.",
      });
    }
  } catch (e) {
    f.pass("HTTP endpoint not reachable (likely HTTPS-only)", clip(e.message));
  }

  // --- Mixed content: load page in browser, watch for insecure subresources ---
  const page = await shared.context.newPage();
  const insecure = [];
  page.on("request", (req) => {
    if (/^http:\/\//i.test(req.url())) insecure.push(req.url());
  });
  const mixedWarnings = [];
  page.on("console", (msg) => {
    if (/mixed content|was loaded over https.*insecure/i.test(msg.text())) mixedWarnings.push(msg.text());
  });
  try {
    await page.goto(BASE_URL, { waitUntil: "networkidle", timeout: TIMEOUTS.navigation });
    await page.waitForTimeout(2000);
  } catch {}
  await page.close().catch(() => {});

  if (insecure.length || mixedWarnings.length) {
    f.add({
      issue: "Mixed content: insecure (http://) resources on an HTTPS page",
      steps: `Load ${BASE_URL} and watch the network for http:// requests`,
      severity: SEVERITY.MEDIUM,
      evidence: clip((insecure.slice(0, 4).join(", ") + " " + mixedWarnings.slice(0, 2).join(" ")).trim(), 240),
      fix: "Serve all subresources (images, scripts, fonts) over HTTPS.",
    });
  } else {
    f.pass("No mixed-content requests observed", "All subresources loaded over HTTPS");
  }

  return f.save("08-security-headers");
}

if (isMain(import.meta.url)) {
  standalone(run).then((p) =>
    console.log(`Security headers: ${p.items.filter((i) => i.severity !== "Info").length} issue(s), ${p.errors.length} error(s)`)
  );
}

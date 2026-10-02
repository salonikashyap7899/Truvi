// TEST 1 — Links & dead buttons.
// Crawls all pages (real browser), then verifies every internal + external link
// for 404s and redirects, and flags dead interactive elements (href="#",
// javascript:void(0), empty anchors). Read-only: only GET/HEAD requests.

import { ensureCrawl, standalone, isMain } from "../lib/runner.mjs";
import { Findings, SEVERITY, clip } from "../lib/findings.mjs";
import { TIMEOUTS } from "../config.mjs";

async function checkLink(context, href) {
  // Try HEAD first (cheap), fall back to GET for servers that reject HEAD.
  for (const method of ["HEAD", "GET"]) {
    try {
      const res = await context.request.fetch(href, {
        method,
        timeout: TIMEOUTS.request,
        maxRedirects: 0, // observe redirects explicitly
        failOnStatusCode: false,
      });
      const status = res.status();
      if (status === 405 && method === "HEAD") continue; // method not allowed → retry GET
      return { status, method, location: res.headers()["location"] || "" };
    } catch (e) {
      if (method === "GET") return { status: 0, method, error: e.message };
    }
  }
  return { status: 0, method: "GET", error: "unreachable" };
}

export async function run(shared) {
  const f = new Findings("Links");
  const data = await ensureCrawl(shared);

  if (!data.pages.length || !data.pages.some((p) => p.ok)) {
    f.error("Crawler could not load any page — site unreachable from this environment.");
    return f.save("01-links");
  }

  // Page-load failures found during crawl.
  for (const p of data.pages) {
    if (!p.ok) {
      f.add({
        issue: `Page failed to load (status ${p.status ?? "n/a"})`,
        steps: `Navigate to ${p.url}`,
        severity: p.status === 404 ? SEVERITY.HIGH : SEVERITY.MEDIUM,
        evidence: p.error ? clip(p.error) : `HTTP ${p.status}`,
        fix: "Ensure the route exists and returns 200; fix SPA fallback/routing.",
      });
    }
  }

  // Dead interactive elements.
  const deadByHref = {};
  for (const d of data.deadInteractive) {
    (deadByHref[d.href] = deadByHref[d.href] || []).push(d);
  }
  for (const [href, items] of Object.entries(deadByHref)) {
    f.add({
      issue: `Dead/placeholder link (${href}) on ${items.length} element(s)`,
      steps: `Open a page containing it, e.g. ${items[0].from}; click "${items[0].text || "(no text)"}"`,
      severity: SEVERITY.MEDIUM,
      evidence: `Anchor text(s): ${clip(items.map((i) => i.text).filter(Boolean).slice(0, 5).join(" | "))}`,
      fix: "Point the anchor at a real URL, or convert it to a <button> with a real handler.",
    });
  }

  // HTTP-check every collected link.
  const httpLinks = data.links.filter((l) => /^https?:\/\//i.test(l.href));
  const nonHttp = data.links.filter((l) => !/^https?:\/\//i.test(l.href));
  let checked = 0,
    broken = 0,
    redirects = 0;

  const concurrency = 6;
  let idx = 0;
  async function worker() {
    while (idx < httpLinks.length) {
      const link = httpLinks[idx++];
      const r = await checkLink(shared.context, link.href);
      checked++;
      const src = link.sources[0] || "(unknown)";
      if (r.status === 0) {
        broken++;
        f.add({
          issue: `${link.internal ? "Internal" : "External"} link unreachable`,
          steps: `On ${src}, follow link "${clip(link.text, 40)}" → ${link.href}`,
          severity: link.internal ? SEVERITY.HIGH : SEVERITY.LOW,
          evidence: clip(r.error || "no response"),
          fix: link.internal ? "Fix the route/asset so it resolves." : "Update or remove the external link.",
        });
      } else if (r.status === 404 || r.status === 410) {
        broken++;
        f.add({
          issue: `${link.internal ? "Internal" : "External"} link returns ${r.status}`,
          steps: `On ${src}, follow link "${clip(link.text, 40)}" → ${link.href}`,
          severity: link.internal ? SEVERITY.HIGH : SEVERITY.MEDIUM,
          evidence: `HTTP ${r.status} (${r.method})`,
          fix: "Update the link target or restore the missing page.",
        });
      } else if (r.status >= 400) {
        // 401/403 on external sites is often anti-bot; note internal ones louder.
        f.add({
          issue: `Link returns ${r.status}`,
          steps: `On ${src}, follow link "${clip(link.text, 40)}" → ${link.href}`,
          severity: link.internal ? SEVERITY.MEDIUM : SEVERITY.LOW,
          evidence: `HTTP ${r.status} (${r.method})`,
          fix: link.internal ? "Investigate why the resource errors." : "Likely bot protection; verify manually.",
        });
      } else if (r.status >= 300) {
        redirects++;
        f.add({
          issue: `Link redirects (${r.status})`,
          steps: `On ${src}, follow link "${clip(link.text, 40)}" → ${link.href}`,
          severity: SEVERITY.LOW,
          evidence: `HTTP ${r.status} → ${clip(r.location, 120)}`,
          fix: "Point the link at the final URL to avoid an extra hop.",
        });
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));

  f.pass(
    `Crawled ${data.pages.length} page(s); checked ${checked} HTTP link(s)`,
    `Broken: ${broken}, redirects: ${redirects}, non-HTTP (mailto/tel/etc.): ${nonHttp.length}`
  );

  return f.save("01-links");
}

if (isMain(import.meta.url)) {
  standalone(run, { needsCrawl: true }).then((p) =>
    console.log(`Links: ${p.items.filter((i) => i.severity !== "Info").length} issue(s), ${p.errors.length} error(s)`)
  );
}

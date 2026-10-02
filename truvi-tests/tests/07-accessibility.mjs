// TEST 7 — Accessibility via axe-core. Runs axe on each crawled page and lists
// violations with severity (impact) and the CSS selectors of affected nodes.
// Read-only.

import { AxeBuilder } from "@axe-core/playwright";
import { standalone, ensureCrawl, isMain } from "../lib/runner.mjs";
import { Findings, SEVERITY, clip } from "../lib/findings.mjs";
import { BASE_URL, TIMEOUTS } from "../config.mjs";

const IMPACT_TO_SEV = { critical: SEVERITY.CRITICAL, serious: SEVERITY.HIGH, moderate: SEVERITY.MEDIUM, minor: SEVERITY.LOW };

async function settle(page) {
  try { await page.waitForLoadState("networkidle", { timeout: 8000 }); } catch {}
  await page.waitForTimeout(1200);
}

export async function run(shared) {
  const f = new Findings("Accessibility");
  let pageUrls = [BASE_URL];
  try {
    const data = await ensureCrawl(shared);
    pageUrls = data.pages.filter((p) => p.ok).map((p) => p.url);
    if (!pageUrls.length) pageUrls = [BASE_URL];
  } catch {}
  pageUrls = pageUrls.slice(0, 20);

  // Aggregate identical rule violations across pages to keep the report tidy.
  const byRule = new Map();
  let scanned = 0;

  for (const url of pageUrls) {
    const page = await shared.context.newPage();
    try {
      const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: TIMEOUTS.navigation });
      if (!resp || resp.status() >= 400) { await page.close(); continue; }
      await settle(page);
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"]).analyze();
      scanned++;
      for (const v of results.violations) {
        const key = v.id;
        if (!byRule.has(key)) byRule.set(key, { id: v.id, impact: v.impact, help: v.help, helpUrl: v.helpUrl, pages: new Set(), nodes: 0, selectors: new Set() });
        const entry = byRule.get(key);
        entry.pages.add(url);
        entry.nodes += v.nodes.length;
        for (const n of v.nodes.slice(0, 3)) for (const t of n.target) entry.selectors.add(String(t));
      }
    } catch (e) {
      f.error(`axe failed on ${url}: ${e.message}`);
    } finally {
      await page.close().catch(() => {});
    }
  }

  const rules = [...byRule.values()].sort(
    (a, b) => (["critical", "serious", "moderate", "minor"].indexOf(a.impact) - ["critical", "serious", "moderate", "minor"].indexOf(b.impact))
  );
  for (const r of rules) {
    f.add({
      issue: `${r.help} [${r.id}]`,
      steps: `Run axe-core on affected pages (${[...r.pages].slice(0, 3).map((u) => new URL(u).pathname).join(", ")}${r.pages.size > 3 ? " …" : ""})`,
      severity: IMPACT_TO_SEV[r.impact] || SEVERITY.MEDIUM,
      evidence: `${r.nodes} node(s) across ${r.pages.size} page(s). Selectors: ${clip([...r.selectors].slice(0, 4).join(" | "))}. Ref: ${r.helpUrl}`,
      fix: `Follow axe guidance for "${r.id}".`,
    });
  }

  f.pass(`axe-core scanned ${scanned} page(s)`, `${rules.length} distinct rule violation(s) found`);
  return f.save("07-accessibility");
}

if (isMain(import.meta.url)) {
  standalone(run, { needsCrawl: true }).then((p) =>
    console.log(`Accessibility: ${p.items.filter((i) => i.severity !== "Info").length} issue(s), ${p.errors.length} error(s)`)
  );
}

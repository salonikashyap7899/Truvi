// Orchestrator: runs all 8 checks against one shared browser + crawl, then
// generates REPORT.md. Safe / read-only throughout.

import { launch, newContext, EXECUTABLE_PATH } from "./lib/browser.mjs";
import { generateReport } from "./lib/report.mjs";
import { BASE_URL } from "./config.mjs";

import { run as links } from "./tests/01-links.mjs";
import { run as navigation } from "./tests/02-navigation.mjs";
import { run as forms } from "./tests/03-forms.mjs";
import { run as rls } from "./tests/04-supabase-rls.mjs";
import { run as responsive } from "./tests/05-responsive.mjs";
import { run as lighthouse } from "./tests/06-lighthouse.mjs";
import { run as accessibility } from "./tests/07-accessibility.mjs";
import { run as security } from "./tests/08-security-headers.mjs";

const STEPS = [
  ["1/8 Links & dead buttons", links],
  ["2/8 Navigation & CTAs", navigation],
  ["3/8 Forms (validation only, no submit)", forms],
  ["4/8 Supabase RLS (read-only)", rls],
  ["5/8 Responsive screenshots", responsive],
  ["6/8 Lighthouse (perf & SEO)", lighthouse],
  ["7/8 Accessibility (axe-core)", accessibility],
  ["8/8 Security headers", security],
];

async function main() {
  console.log(`\n🔍 Truvi safe test suite → ${BASE_URL}`);
  console.log(`   Browser: ${EXECUTABLE_PATH || "Playwright-managed chromium"}\n`);

  const browser = await launch();
  const context = await newContext(browser);
  const shared = { browser, context };

  for (const [label, fn] of STEPS) {
    const t0 = Date.now();
    process.stdout.write(`▶ ${label} … `);
    try {
      const p = await fn(shared);
      const issues = p.items.filter((i) => i.severity !== "Info").length;
      const errs = (p.errors || []).length;
      console.log(`done (${issues} issue(s)${errs ? ", " + errs + " error(s)" : ""}, ${((Date.now() - t0) / 1000).toFixed(1)}s)`);
    } catch (e) {
      console.log(`FAILED: ${e.message}`);
    }
  }

  await context.close().catch(() => {});
  await browser.close().catch(() => {});

  const r = generateReport();
  console.log(`\n📄 REPORT.md written → ${r.out}`);
  console.log(`   ${r.issues} issue(s): 🔴 ${r.counts.Critical} · 🟠 ${r.counts.High} · 🟡 ${r.counts.Medium} · 🔵 ${r.counts.Low}; ${r.passes} passed; ${r.errors} run-error(s).\n`);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});

// TEST 6 — Performance & SEO via Lighthouse. Runs on the homepage + 2 key pages
// and reports category scores and the biggest issues. Read-only.

import { launch as launchChrome } from "chrome-launcher";
import lighthouse from "lighthouse";
import { EXECUTABLE_PATH } from "../lib/browser.mjs";
import { standalone, ensureCrawl, isMain } from "../lib/runner.mjs";
import { Findings, SEVERITY, clip } from "../lib/findings.mjs";
import { BASE_URL, LIGHTHOUSE_PAGES } from "../config.mjs";

function pct(score) {
  return score == null ? "n/a" : Math.round(score * 100);
}

async function runOne(url, port) {
  const runnerResult = await lighthouse(
    url,
    { port, output: "json", logLevel: "error", onlyCategories: ["performance", "accessibility", "best-practices", "seo"] },
    undefined
  );
  const lhr = runnerResult.lhr;
  const cats = lhr.categories;
  // Top failing audits weighted by importance across perf + seo + best-practices.
  const failing = [];
  for (const catKey of ["performance", "seo", "best-practices"]) {
    const cat = cats[catKey];
    if (!cat) continue;
    for (const ref of cat.auditRefs) {
      const a = lhr.audits[ref.id];
      if (!a) continue;
      if (a.score != null && a.score < 0.9 && (a.details || a.displayValue) && ref.weight > 0) {
        failing.push({ cat: catKey, id: a.id, title: a.title, score: a.score, weight: ref.weight, display: a.displayValue || "" });
      }
    }
  }
  failing.sort((a, b) => b.weight - a.weight || a.score - b.score);
  return {
    scores: { performance: pct(cats.performance?.score), accessibility: pct(cats.accessibility?.score), bestPractices: pct(cats["best-practices"]?.score), seo: pct(cats.seo?.score) },
    metrics: {
      FCP: lhr.audits["first-contentful-paint"]?.displayValue,
      LCP: lhr.audits["largest-contentful-paint"]?.displayValue,
      TBT: lhr.audits["total-blocking-time"]?.displayValue,
      CLS: lhr.audits["cumulative-layout-shift"]?.displayValue,
      SI: lhr.audits["speed-index"]?.displayValue,
    },
    failing: failing.slice(0, 6),
  };
}

export async function run(shared) {
  const f = new Findings("Performance / SEO");

  // Decide the 3 pages: homepage + up to 2 key pages.
  let pages = LIGHTHOUSE_PAGES.map((p) => new URL(p, BASE_URL).href);
  if (pages.length < 3 && shared && shared.context) {
    try {
      const data = await ensureCrawl(shared);
      const key = data.pages
        .filter((p) => p.ok && p.url !== BASE_URL)
        .map((p) => p.url)
        .sort((a, b) => (/(about|contact|propert|listing|service|pricing|project)/i.test(b) ? 1 : 0) - (/(about|contact|propert|listing|service|pricing|project)/i.test(a) ? 1 : 0));
      for (const u of key) { if (pages.length >= 3) break; if (!pages.includes(u)) pages.push(u); }
    } catch {}
  }
  if (!pages.includes(BASE_URL)) pages.unshift(BASE_URL);
  pages = [...new Set(pages)].slice(0, 3);

  let chrome;
  try {
    chrome = await launchChrome({
      chromePath: EXECUTABLE_PATH,
      chromeFlags: ["--headless=new", "--no-sandbox", "--disable-dev-shm-usage"],
    });
  } catch (e) {
    f.error(`Could not launch Chrome for Lighthouse: ${e.message}`);
    return f.save("06-lighthouse");
  }

  try {
    for (const url of pages) {
      try {
        const r = await runOne(url, chrome.port);
        if (["performance", "accessibility", "bestPractices", "seo"].every((k) => r.scores[k] === "n/a")) {
          f.error(`Lighthouse could not analyze ${url} (page did not load / all scores n/a).`);
          continue;
        }
        f.pass(
          `Lighthouse scores for ${url}`,
          `Perf ${r.scores.performance} · A11y ${r.scores.accessibility} · BestPractices ${r.scores.bestPractices} · SEO ${r.scores.seo} | LCP ${r.metrics.LCP || "?"}, TBT ${r.metrics.TBT || "?"}, CLS ${r.metrics.CLS || "?"}`
        );
        const sev = (s) => (s < 50 ? SEVERITY.HIGH : s < 80 ? SEVERITY.MEDIUM : SEVERITY.LOW);
        for (const [label, s] of [["Performance", r.scores.performance], ["SEO", r.scores.seo], ["Best-Practices", r.scores.bestPractices]]) {
          if (typeof s === "number" && s < 90) {
            const top = r.failing.filter((x) => (label === "Best-Practices" ? x.cat === "best-practices" : x.cat === label.toLowerCase())).slice(0, 3);
            f.add({
              issue: `${label} score is ${s}/100 on ${new URL(url).pathname}`,
              steps: `Run Lighthouse on ${url}`,
              severity: sev(s),
              evidence: `Top issues: ${clip(top.map((t) => `${t.title}${t.display ? " (" + t.display + ")" : ""}`).join("; ")) || "see report"}`,
              fix: "Address the highest-weight failing audits listed (images, JS, meta tags, etc.).",
            });
          }
        }
      } catch (e) {
        f.error(`Lighthouse failed on ${url}: ${e.message}`);
      }
    }
  } finally {
    try { await chrome.kill(); } catch {}
  }

  return f.save("06-lighthouse");
}

if (isMain(import.meta.url)) {
  standalone(run, { needsCrawl: true }).then((p) =>
    console.log(`Lighthouse: ${p.items.filter((i) => i.severity !== "Info").length} issue(s), ${p.errors.length} error(s)`)
  );
}

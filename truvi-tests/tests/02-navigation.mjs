// TEST 2 — Navigation & CTAs.
// Clicks the main nav links and primary CTAs and confirms each lands where
// expected (URL change for links, or a modal/dialog opening for CTA buttons).
// Read-only & safe: it never clicks submit/pay/delete-type controls, and it
// never fills or submits a form here.

import { standalone, isMain } from "../lib/runner.mjs";
import { Findings, SEVERITY, clip } from "../lib/findings.mjs";
import { BASE_URL, TIMEOUTS } from "../config.mjs";

const origin = new URL(BASE_URL).origin;

// Controls we must never click (could mutate data / start a transaction).
const UNSAFE = /\b(submit|send|pay|buy|checkout|delete|remove|confirm|save|subscribe|sign\s?up|register|book now|apply)\b/i;
// CTA-ish text worth verifying.
const CTA = /\b(get started|contact|book|schedule|demo|quote|call|enquire|inquire|learn more|explore|view|see|start|join|list your)\b/i;

async function settle(page) {
  try {
    await page.waitForLoadState("networkidle", { timeout: 8000 });
  } catch {}
  await page.waitForTimeout(1200);
}

export async function run(shared) {
  const f = new Findings("Navigation");
  const page = await shared.context.newPage();

  let resp;
  try {
    resp = await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: TIMEOUTS.navigation });
    await settle(page);
  } catch (e) {
    f.error(`Could not load homepage: ${e.message}`);
    await page.close();
    return f.save("02-navigation");
  }
  if (!resp || resp.status() >= 400) {
    f.error(`Homepage returned HTTP ${resp ? resp.status() : "n/a"}`);
    await page.close();
    return f.save("02-navigation");
  }

  // ---- Main nav links ----
  const navLinks = await page.evaluate(() => {
    const seen = new Set();
    const out = [];
    const scope = document.querySelectorAll("header a[href], nav a[href], [role=navigation] a[href]");
    for (const a of scope) {
      const href = a.getAttribute("href");
      const abs = (() => { try { return new URL(href, document.baseURI).href; } catch { return null; } })();
      const text = (a.textContent || "").replace(/\s+/g, " ").trim();
      if (!abs || seen.has(abs)) continue;
      seen.add(abs);
      out.push({ href, abs, text });
    }
    return out;
  });

  let navOk = 0;
  for (const link of navLinks) {
    if (!/^https?:/.test(link.abs) || new URL(link.abs).origin !== origin) continue; // only verify internal nav here
    try {
      await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: TIMEOUTS.navigation });
      await settle(page);
      const loc = page.locator(`header a[href='${cssEscape(link.href)}'], nav a[href='${cssEscape(link.href)}'], [role=navigation] a[href='${cssEscape(link.href)}']`).first();
      if (!(await loc.count())) continue;
      await loc.click({ timeout: 8000 });
      await settle(page);
      const expected = new URL(link.abs).pathname.replace(/\/$/, "");
      const actual = new URL(page.url()).pathname.replace(/\/$/, "");
      if (expected === actual || page.url().startsWith(link.abs)) {
        navOk++;
      } else {
        f.add({
          issue: `Nav item "${clip(link.text, 40)}" lands on the wrong URL`,
          steps: `On homepage, click nav item "${clip(link.text, 40)}"`,
          severity: SEVERITY.MEDIUM,
          evidence: `Expected ${expected || "/"}, got ${actual || "/"}`,
          fix: "Fix the anchor href / client-side route target.",
        });
      }
    } catch (e) {
      f.add({
        issue: `Nav item "${clip(link.text, 40)}" failed to navigate`,
        steps: `On homepage, click nav item "${clip(link.text, 40)}"`,
        severity: SEVERITY.MEDIUM,
        evidence: clip(e.message),
        fix: "Ensure the nav link is clickable and routes correctly.",
      });
    }
  }
  f.pass(`Verified ${navOk}/${navLinks.length} main-nav destination(s)`);

  // ---- Primary CTAs (links + safe buttons) ----
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: TIMEOUTS.navigation });
  await settle(page);
  const ctas = await page.evaluate((ctaSrc) => {
    const re = new RegExp(ctaSrc, "i");
    const els = [...document.querySelectorAll("a[href], button, [role=button]")];
    const out = [];
    let i = 0;
    for (const el of els) {
      const text = (el.textContent || el.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim();
      if (!text || !re.test(text)) continue;
      const tag = el.tagName.toLowerCase();
      const href = el.getAttribute("href");
      out.push({ text: text.slice(0, 60), tag, href, idx: i });
      i++;
      if (out.length >= 12) break;
    }
    return out;
  }, CTA.source);

  let ctaOk = 0,
    ctaModal = 0;
  for (const cta of ctas) {
    if (UNSAFE.test(cta.text)) {
      f.pass(`Skipped potentially state-changing CTA "${clip(cta.text, 40)}" (safety rule)`);
      continue;
    }
    try {
      await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: TIMEOUTS.navigation });
      await settle(page);
      const loc = page.getByText(cta.text, { exact: false }).first();
      if (!(await loc.count())) continue;
      const beforeUrl = page.url();
      const dialogsBefore = await page.locator("[role=dialog], .modal, [aria-modal='true']").count();
      await loc.click({ timeout: 8000 }).catch(() => {});
      await settle(page);
      const afterUrl = page.url();
      const dialogsAfter = await page.locator("[role=dialog], .modal, [aria-modal='true']").count();
      if (afterUrl !== beforeUrl) {
        ctaOk++;
      } else if (dialogsAfter > dialogsBefore) {
        ctaModal++;
      } else {
        f.add({
          issue: `CTA "${clip(cta.text, 40)}" appears inert (no navigation, no modal)`,
          steps: `On homepage, click "${clip(cta.text, 40)}"`,
          severity: SEVERITY.MEDIUM,
          evidence: `URL unchanged (${clip(afterUrl, 60)}); no dialog opened`,
          fix: "Wire the CTA to a route or modal, or remove it.",
        });
      }
    } catch (e) {
      f.add({
        issue: `CTA "${clip(cta.text, 40)}" errored on click`,
        steps: `On homepage, click "${clip(cta.text, 40)}"`,
        severity: SEVERITY.LOW,
        evidence: clip(e.message),
        fix: "Investigate the click handler.",
      });
    }
  }
  f.pass(`CTAs: ${ctaOk} navigated, ${ctaModal} opened a modal, out of ${ctas.length} tested`);

  await page.close();
  return f.save("02-navigation");
}

// Minimal CSS attribute-value escaper for the href selector.
function cssEscape(s) {
  return String(s).replace(/'/g, "\\'");
}

if (isMain(import.meta.url)) {
  standalone(run).then((p) =>
    console.log(`Navigation: ${p.items.filter((i) => i.severity !== "Info").length} issue(s), ${p.errors.length} error(s)`)
  );
}

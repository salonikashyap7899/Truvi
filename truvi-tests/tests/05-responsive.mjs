// TEST 5 — Responsive layout. Screenshots every crawled page at 360 / 768 /
// 1440 px and flags horizontal overflow, content cut off past the viewport, and
// a broken mobile menu. Screenshots are saved under screenshots/<viewport>/.
// Read-only: only navigation, screenshots, and one hamburger-menu click.

import fs from "node:fs";
import { newContext } from "../lib/browser.mjs";
import { standalone, ensureCrawl, isMain } from "../lib/runner.mjs";
import { Findings, SEVERITY, clip } from "../lib/findings.mjs";
import { BASE_URL, VIEWPORTS, SHOTS_DIR, TIMEOUTS } from "../config.mjs";

function slug(url) {
  const u = new URL(url);
  const s = (u.pathname + u.hash).replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "") || "home";
  return s.slice(0, 60);
}

async function settle(page) {
  try { await page.waitForLoadState("networkidle", { timeout: 8000 }); } catch {}
  await page.waitForTimeout(1200);
}

// Measure overflow and find elements sticking out past the viewport width.
async function measure(page, vw) {
  return page.evaluate((vw) => {
    const docW = Math.max(document.documentElement.scrollWidth, document.body ? document.body.scrollWidth : 0);
    const overflow = docW - window.innerWidth;
    const offenders = [];
    if (overflow > 2) {
      for (const el of document.querySelectorAll("body *")) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (r.right > window.innerWidth + 2 && r.width <= window.innerWidth + 40) {
          const id = el.id ? `#${el.id}` : "";
          const cls = typeof el.className === "string" && el.className ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".") : "";
          offenders.push(`${el.tagName.toLowerCase()}${id}${cls}`.slice(0, 60));
          if (offenders.length >= 6) break;
        }
      }
    }
    return { docW, innerW: window.innerWidth, overflow, offenders };
  }, vw);
}

// At mobile width, check the menu opens.
async function checkMobileMenu(page) {
  const navVisible = async () =>
    page.evaluate(() => {
      const links = [...document.querySelectorAll("header a[href], nav a[href], [role=navigation] a[href]")];
      return links.filter((a) => {
        const r = a.getBoundingClientRect();
        const st = getComputedStyle(a);
        return r.width > 0 && r.height > 0 && st.visibility !== "hidden" && st.display !== "none";
      }).length;
    });

  const before = await navVisible();
  const toggle = page
    .locator(
      "button[aria-label*='menu' i], button[aria-label*='navigation' i], [class*='hamburger' i], [class*='menu-toggle' i], button:has(svg)"
    )
    .first();
  const hasToggle = (await toggle.count()) > 0;
  if (!hasToggle) return { hasToggle, before, after: before, opened: before > 0 };
  await toggle.click({ timeout: 4000 }).catch(() => {});
  await page.waitForTimeout(700);
  const after = await navVisible();
  return { hasToggle, before, after, opened: after > before || after > 0 };
}

export async function run(shared) {
  const f = new Findings("Responsive");
  let pageUrls = [BASE_URL];
  try {
    const data = await ensureCrawl(shared);
    pageUrls = data.pages.filter((p) => p.ok).map((p) => p.url);
    if (!pageUrls.length) pageUrls = [BASE_URL];
  } catch {}
  pageUrls = pageUrls.slice(0, 25);

  for (const vp of VIEWPORTS) {
    const dir = SHOTS_DIR + vp.name + "/";
    fs.mkdirSync(dir, { recursive: true });
    const context = await newContext(shared.browser, { viewport: { width: vp.width, height: vp.height } });
    let shots = 0;
    for (const url of pageUrls) {
      const page = await context.newPage();
      try {
        const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: TIMEOUTS.navigation });
        if (!resp || resp.status() >= 400) { await page.close(); continue; }
        await settle(page);
        const file = dir + slug(url) + `-${vp.width}.png`;
        await page.screenshot({ path: file, fullPage: true }).then(() => shots++).catch(() => {});

        const m = await measure(page, vp.width);
        if (m.overflow > 2) {
          f.add({
            issue: `Horizontal overflow at ${vp.width}px (${m.overflow}px wider than viewport)`,
            steps: `Open ${url} at ${vp.width}px width and scroll horizontally`,
            severity: vp.width <= 360 ? SEVERITY.HIGH : SEVERITY.MEDIUM,
            evidence: `docWidth ${m.docW} vs viewport ${m.innerW}. Offenders: ${clip(m.offenders.join(", ")) || "n/a"}. Screenshot: ${file.replace(SHOTS_DIR, "screenshots/")}`,
            fix: "Constrain the offending element (max-width:100%, overflow-x, remove fixed widths).",
          });
        }

        if (vp.width <= 360) {
          const menu = await checkMobileMenu(page);
          if (!menu.opened) {
            f.add({
              issue: `Mobile menu does not expose navigation at 360px`,
              steps: `Open ${url} at 360px; tap the menu / hamburger toggle`,
              severity: SEVERITY.HIGH,
              evidence: `Toggle found: ${menu.hasToggle}; visible nav links before ${menu.before}, after ${menu.after}`,
              fix: "Ensure a working hamburger toggle reveals the nav links on small screens.",
            });
          } else {
            f.pass(`Mobile menu OK on ${slug(url)}`, `toggle=${menu.hasToggle}, links after open=${menu.after}`);
          }
        }
      } catch (e) {
        f.error(`Responsive check failed on ${url} @${vp.width}: ${e.message}`);
      } finally {
        await page.close().catch(() => {});
      }
    }
    await context.close();
    if (shots === 0) f.error(`No page could be loaded to screenshot @ ${vp.width}px.`);
    else f.pass(`Captured ${shots} screenshot(s) @ ${vp.width}px`, `saved to screenshots/${vp.name}/`);
  }

  return f.save("05-responsive");
}

if (isMain(import.meta.url)) {
  standalone(run, { needsCrawl: true }).then((p) =>
    console.log(`Responsive: ${p.items.filter((i) => i.severity !== "Info").length} issue(s), ${p.errors.length} error(s)`)
  );
}

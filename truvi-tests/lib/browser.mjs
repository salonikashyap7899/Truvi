// Browser resolution + launch helpers.
//
// On managed/CI environments a Chromium may be pre-installed at a path that does
// not match the Playwright version's expected build number. We therefore resolve
// an explicit executable if we can find one, and otherwise fall back to
// Playwright's own managed browser (what you get from `npx playwright install`).

import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

function findPreinstalledChrome() {
  if (process.env.PLAYWRIGHT_EXECUTABLE_PATH && fs.existsSync(process.env.PLAYWRIGHT_EXECUTABLE_PATH)) {
    return process.env.PLAYWRIGHT_EXECUTABLE_PATH;
  }
  const roots = [process.env.PLAYWRIGHT_BROWSERS_PATH, "/opt/pw-browsers"].filter(Boolean);
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    let dirs;
    try {
      dirs = fs.readdirSync(root).filter((d) => d.startsWith("chromium-"));
    } catch {
      continue;
    }
    // Prefer the full chromium build (not chrome-headless-shell) so navigation
    // and Lighthouse behave like a real browser.
    dirs.sort().reverse();
    for (const d of dirs) {
      const candidate = path.join(root, d, "chrome-linux", "chrome");
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return undefined; // let Playwright use its managed browser
}

export const EXECUTABLE_PATH = findPreinstalledChrome();

export async function launch(opts = {}) {
  return chromium.launch({
    headless: true,
    executablePath: EXECUTABLE_PATH,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
    ...opts,
  });
}

export async function newContext(browser, opts = {}) {
  const ctx = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (compatible; TruviSafeTestBot/1.0; +read-only non-destructive QA)",
    ignoreHTTPSErrors: false,
    ...opts,
  });
  return ctx;
}

// Shared harness so each test file can also be run on its own
// (`node tests/01-links.mjs`) while run-all.mjs shares a single browser + crawl.

import { launch, newContext } from "./browser.mjs";
import { crawl } from "./crawl.mjs";

export async function withBrowser(fn) {
  const browser = await launch();
  try {
    const context = await newContext(browser);
    return await fn({ browser, context });
  } finally {
    await browser.close();
  }
}

// Lazily crawl once and cache on the shared object passed between tests.
export async function ensureCrawl(shared) {
  if (!shared.crawl) {
    shared.crawl = await crawl(shared.context);
  }
  return shared.crawl;
}

// Standalone entry helper: builds a browser/context, optionally crawls, runs the
// test's run() and saves results. Used at the bottom of each test file.
export async function standalone(run, { needsCrawl = false } = {}) {
  return withBrowser(async ({ browser, context }) => {
    const shared = { browser, context };
    if (needsCrawl) await ensureCrawl(shared);
    const payload = await run(shared);
    if (payload && payload.errors && payload.errors.length) {
      console.error("Errors:", payload.errors.join("; "));
    }
    return payload;
  });
}

export function isMain(importMetaUrl) {
  return process.argv[1] && importMetaUrl === `file://${process.argv[1]}`;
}

// Real-browser crawler for a JS-rendered SPA. BFS over same-origin pages,
// waiting for client-side rendering to settle on each page. Read-only: it only
// navigates and reads the DOM — it never clicks submit or mutates anything.

import { BASE_URL, CRAWL, TIMEOUTS } from "../config.mjs";

const origin = new URL(BASE_URL).origin;

function normalize(rawHref, base) {
  try {
    const u = new URL(rawHref, base);
    // Drop the fragment unless the site clearly uses hash routing (path is "/").
    if (u.origin === origin) {
      const isHashRoute = u.hash && (u.pathname === "/" || u.pathname === "");
      u.hash = isHashRoute ? u.hash : "";
    } else {
      u.hash = "";
    }
    // Normalise trailing slash for de-dup (keep root as "/").
    return u.href;
  } catch {
    return null;
  }
}

function isSkipped(pathname) {
  return CRAWL.skipPathPatterns.some((re) => re.test(pathname));
}

async function settle(page) {
  try {
    await page.waitForLoadState("networkidle", { timeout: TIMEOUTS.navigation });
  } catch {
    /* networkidle can time out on sites with long-polling; continue anyway */
  }
  await page.waitForTimeout(TIMEOUTS.settle);
}

// Extract links + buttons from the current DOM.
async function extract(page) {
  return page.evaluate(() => {
    const abs = (h) => {
      try {
        return new URL(h, document.baseURI).href;
      } catch {
        return null;
      }
    };
    const anchors = [...document.querySelectorAll("a[href]")].map((a) => ({
      href: a.getAttribute("href"),
      absHref: abs(a.getAttribute("href")),
      text: (a.textContent || "").replace(/\s+/g, " ").trim().slice(0, 80),
      target: a.getAttribute("target") || "",
    }));
    const buttons = [
      ...document.querySelectorAll(
        "button, [role=button], input[type=button], input[type=submit]"
      ),
    ].map((b) => ({
      text:
        (b.textContent || b.value || b.getAttribute("aria-label") || "")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 80),
      type: b.getAttribute("type") || b.tagName.toLowerCase(),
      disabled: b.disabled === true,
    }));
    return { anchors, buttons };
  });
}

export async function crawl(context, { onPage } = {}) {
  const page = await context.newPage();

  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push({ url: page.url(), text: msg.text().slice(0, 300) });
  });
  const pageErrors = [];
  page.on("pageerror", (err) => pageErrors.push({ url: page.url(), text: String(err).slice(0, 300) }));

  const visited = new Set();
  const queue = [{ url: BASE_URL, depth: 0 }];
  const pages = [];
  const linksMap = new Map(); // absHref -> { href, text, internal, sources:Set }
  const deadInteractive = []; // href="#" / javascript:void(0) style
  const buttonsByPage = {};

  while (queue.length && pages.length < CRAWL.maxPages) {
    const { url, depth } = queue.shift();
    const key = url.replace(/#.*$/, "");
    if (visited.has(key)) continue;
    visited.add(key);

    let status = null;
    let title = "";
    let ok = false;
    let error = null;
    try {
      const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: TIMEOUTS.navigation });
      status = resp ? resp.status() : null;
      await settle(page);
      title = await page.title().catch(() => "");
      ok = status !== null && status < 400;
    } catch (e) {
      error = e.message;
    }

    pages.push({ url, depth, status, title, ok, error, consoleErrorCount: 0 });
    if (onPage) onPage({ url, depth, status, ok, error });

    if (!ok) continue;

    const { anchors, buttons } = await extract(page).catch(() => ({ anchors: [], buttons: [] }));
    buttonsByPage[url] = buttons;

    for (const a of anchors) {
      const raw = (a.href || "").trim();
      if (raw === "" || raw === "#" || /^javascript:\s*(void\(0\))?;?$/i.test(raw)) {
        deadInteractive.push({ from: url, text: a.text, href: raw || "(empty)", kind: "anchor" });
        continue;
      }
      if (/^(mailto:|tel:|sms:|whatsapp:)/i.test(raw)) {
        // record but don't HTTP-check
        const k = raw;
        if (!linksMap.has(k)) linksMap.set(k, { href: raw, text: a.text, internal: false, scheme: raw.split(":")[0], sources: new Set() });
        linksMap.get(k).sources.add(url);
        continue;
      }
      const absH = a.absHref || normalize(raw, url);
      if (!absH) continue;
      let u;
      try {
        u = new URL(absH);
      } catch {
        continue;
      }
      if (!/^https?:$/.test(u.protocol)) continue;
      const internal = u.origin === origin;
      const k = absH.replace(/#.*$/, "");
      if (!linksMap.has(k)) linksMap.set(k, { href: k, text: a.text, internal, sources: new Set() });
      linksMap.get(k).sources.add(url);

      // enqueue same-origin html pages for crawling
      if (internal && depth < CRAWL.maxDepth && !isSkipped(u.pathname) && !visited.has(k)) {
        queue.push({ url: k, depth: depth + 1 });
      }
    }
  }

  await page.close();

  const links = [...linksMap.values()].map((l) => ({ ...l, sources: [...l.sources] }));
  return { pages, links, deadInteractive, buttonsByPage, consoleErrors, pageErrors, origin };
}

# Truvi — Safe Production Test Suite

Automated, **non-destructive** QA for the live site
(`https://truviventures.com/`). Everything here is **read-only**:

- ❌ **No form is ever submitted to the backend.** The forms test fills fields
  and inspects client-side validation only. It runs in a browser context that
  **hard-blocks every mutating network call** (POST/PUT/PATCH/DELETE via fetch,
  XHR, `sendBeacon`) and neuters `HTMLFormElement.submit()` as a backstop, and
  it only ever clicks a submit button on *invalid* input (where the browser's
  own constraint validation refuses to send).
- ❌ **No injection payloads. No writes/updates/deletes anywhere.** The Supabase
  RLS check issues **GET (SELECT) requests only**, using nothing but the public
  anon key already shipped to every visitor.
- ✅ Uses a **real browser** (Playwright + Chromium), not static fetch.

## What it runs

| # | Check | File |
|---|-------|------|
| 1 | Links & dead buttons — crawl every page, verify internal + external links for 404s/redirects, flag dead buttons | `tests/01-links.mjs` |
| 2 | Navigation & CTAs — click main nav + CTAs, confirm destinations (skips state-changing buttons) | `tests/02-navigation.mjs` |
| 3 | Forms — valid data, empty required, invalid email/phone → validation only, **no submit** | `tests/03-forms.mjs` |
| 4 | Supabase RLS — extract anon key, read-only SELECT probes, check for exposed secret keys | `tests/04-supabase-rls.mjs` |
| 5 | Responsive — screenshots at 360/768/1440, overflow + mobile-menu checks | `tests/05-responsive.mjs` |
| 6 | Performance & SEO — Lighthouse on homepage + 2 key pages | `tests/06-lighthouse.mjs` |
| 7 | Accessibility — axe-core violations with severity + selectors | `tests/07-accessibility.mjs` |
| 8 | Security headers — HSTS / CSP / X-Frame-Options, HTTPS, mixed content | `tests/08-security-headers.mjs` |

## Run it

```bash
cd truvi-tests
npm install
npx playwright install     # first time only — downloads the Chromium build
npm run test:all           # runs all 8 checks, writes REPORT.md
```

Run a single check, e.g.:

```bash
npm run test:security
npm run test:rls
```

Output:

- **`REPORT.md`** — the table (Area | Issue | Steps | Severity | Evidence | Fix)
  plus the top-5 to fix first.
- **`screenshots/<mobile|tablet|desktop>/`** — responsive screenshots.
- **`results/*.json`** — raw machine-readable results per check.

## Configuration (env vars, all optional)

| Var | Default | Purpose |
|-----|---------|---------|
| `TRUVI_BASE_URL` | `https://truviventures.com/` | Target site |
| `TRUVI_MAX_PAGES` | `40` | Crawl page cap |
| `TRUVI_MAX_DEPTH` | `3` | Crawl depth cap |
| `TRUVI_LH_PAGES` | `/` | Comma-separated paths for Lighthouse (homepage always included) |
| `TRUVI_RLS_TABLES` | common names | Extra Supabase tables to probe (read-only) |
| `PLAYWRIGHT_EXECUTABLE_PATH` | — | Point at a specific Chromium binary if needed |

## Notes

- The suite needs outbound network access to the target site (and to
  `*.supabase.co` for the RLS check). In a locked-down/offline environment those
  requests are blocked and the affected sections of `REPORT.md` will note it —
  run from a network that can reach the site to get full results.
- On a fresh machine, `npx playwright install` downloads the matching browser.
  If a Chromium is already present at a non-default path, set
  `PLAYWRIGHT_EXECUTABLE_PATH`.

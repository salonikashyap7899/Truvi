# Truvi Production Test Report

**Target:** https://truviventures.com/  
**Generated:** 2026-07-27T11:08:22.304Z  
**Mode:** Safe / non-destructive (read-only; no form submissions; no data writes)

**Summary:** 0 issue(s) — 🔴 0 Critical · 🟠 0 High · 🟡 0 Medium · 🔵 0 Low. 1 check(s) passed / informational.

> 🚧 **The target could not be reached from the environment that generated this report.**
> Every browser-based check failed to connect (e.g. `ERR_TUNNEL_CONNECTION_FAILED` / HTTP 403 from an egress proxy), so **no live findings were collected**. This is an environment/network limitation, **not** a clean bill of health for the site and **not** a broken suite — the suite is verified working.
>
> **To get real results, run `npm run test:all` from a machine or session with outbound access to https://truviventures.com/ (and `*.supabase.co`).**

## Top 5 issues to fix first

_No issues recorded yet. Run `npm run test:all` from an environment with network access to https://truviventures.com/._

## All findings

| # | Area | Issue | Steps to reproduce | Severity | Evidence | Suggested fix |
|---|------|-------|--------------------|----------|----------|---------------|
| — | — | _No issues found (or suite not yet run against a reachable target)._ | — | — | — | — |

## Passed & informational checks

### Accessibility
- ✅ axe-core scanned 0 page(s) — 0 distinct rule violation(s) found

## Run limitations / errors

- **Links:** Crawler could not load any page — site unreachable from this environment.
- **Navigation:** Could not load homepage: page.goto: net::ERR_TUNNEL_CONNECTION_FAILED at https://truviventures.com/ Call log: [2m  - navigating to "https://truviventures.com/", waiting until "domcontentloaded"[22m
- **Forms:** Form audit failed on https://truviventures.com/: page.goto: net::ERR_TUNNEL_CONNECTION_FAILED at https://truviventures.com/ Call log: [2m  - navigating to "https://truviventures.com/", waiting until "domcontentloaded"[22m
- **Forms:** No candidate page could be loaded — form validation could not be assessed from this environment.
- **Supabase / RLS:** Could not load site to harvest keys: page.goto: net::ERR_TUNNEL_CONNECTION_FAILED at https://truviventures.com/ Call log: [2m  - navigating to "https://truviventures.com/", waiting until "networkidle"[22m
- **Responsive:** Responsive check failed on https://truviventures.com/ @360: page.goto: net::ERR_TUNNEL_CONNECTION_FAILED at https://truviventures.com/ Call log: [2m  - navigating to "https://truviventures.com/", waiting until "domcontentloaded"[22m
- **Responsive:** No page could be loaded to screenshot @ 360px.
- **Responsive:** Responsive check failed on https://truviventures.com/ @768: page.goto: net::ERR_TUNNEL_CONNECTION_FAILED at https://truviventures.com/ Call log: [2m  - navigating to "https://truviventures.com/", waiting until "domcontentloaded"[22m
- **Responsive:** No page could be loaded to screenshot @ 768px.
- **Responsive:** Responsive check failed on https://truviventures.com/ @1440: page.goto: net::ERR_TUNNEL_CONNECTION_FAILED at https://truviventures.com/ Call log: [2m  - navigating to "https://truviventures.com/", waiting until "domcontentloaded"[22m
- **Responsive:** No page could be loaded to screenshot @ 1440px.
- **Performance / SEO:** Lighthouse could not analyze https://truviventures.com/ (page did not load / all scores n/a).
- **Accessibility:** axe failed on https://truviventures.com/: page.goto: net::ERR_TUNNEL_CONNECTION_FAILED at https://truviventures.com/ Call log: [2m  - navigating to "https://truviventures.com/", waiting until "domcontentloaded"[22m
- **Security Headers:** Main document returned HTTP 403 — this is an error/denial response, not the real page (often an egress-proxy block or bot filter from this environment). Security-header assessment skipped to avoid false findings; re-run from a network that can load https://truviventures.com/.

## How to re-run

```bash
cd truvi-tests
npm install          # first time only
npx playwright install   # first time only (downloads the browser)
npm run test:all     # runs all 8 checks and regenerates REPORT.md
```

Individual checks: `npm run test:links`, `test:nav`, `test:forms`, `test:rls`, `test:responsive`, `test:lighthouse`, `test:a11y`, `test:security`.

Screenshots are saved under `screenshots/<mobile|tablet|desktop>/`. Raw JSON results are under `results/`.

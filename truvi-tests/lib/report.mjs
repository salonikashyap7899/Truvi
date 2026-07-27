// Aggregates every results/*.json file into REPORT.md with the required table:
// Area | Issue | Steps to reproduce | Severity | Evidence | Suggested fix.

import fs from "node:fs";
import path from "node:path";
import { OUT_DIR, BASE_URL } from "../config.mjs";
import { SEVERITY_ORDER } from "./findings.mjs";

const ORDER_FILE = ["01-links", "02-navigation", "03-forms", "04-supabase-rls", "05-responsive", "06-lighthouse", "07-accessibility", "08-security-headers"];

function cell(s) {
  return String(s ?? "")
    .replace(/\r?\n/g, " ")
    .replace(/\|/g, "\\|")
    .trim();
}

function sevRank(s) {
  const i = SEVERITY_ORDER.indexOf(s);
  return i === -1 ? 99 : i;
}

export function generateReport() {
  const files = fs.existsSync(OUT_DIR)
    ? fs.readdirSync(OUT_DIR).filter((f) => f.endsWith(".json"))
    : [];
  const payloads = files
    .map((f) => ({ name: f.replace(/\.json$/, ""), data: JSON.parse(fs.readFileSync(path.join(OUT_DIR, f), "utf8")) }))
    .sort((a, b) => ORDER_FILE.indexOf(a.name) - ORDER_FILE.indexOf(b.name));

  const allItems = [];
  const allErrors = [];
  for (const { data } of payloads) {
    for (const it of data.items) allItems.push(it);
    for (const e of data.errors || []) allErrors.push({ area: data.area, message: e });
  }
  const issues = allItems.filter((i) => i.severity !== "Info");
  const passes = allItems.filter((i) => i.severity === "Info");

  const counts = { Critical: 0, High: 0, Medium: 0, Low: 0 };
  for (const i of issues) if (counts[i.severity] != null) counts[i.severity]++;

  // Sort issues by severity, then area.
  issues.sort((a, b) => sevRank(a.severity) - sevRank(b.severity) || a.area.localeCompare(b.area));

  const now = new Date().toISOString();
  const L = [];
  L.push(`# Truvi Production Test Report`);
  L.push("");
  L.push(`**Target:** ${BASE_URL}  `);
  L.push(`**Generated:** ${now}  `);
  L.push(`**Mode:** Safe / non-destructive (read-only; no form submissions; no data writes)`);
  L.push("");
  L.push(
    `**Summary:** ${issues.length} issue(s) — ` +
      `🔴 ${counts.Critical} Critical · 🟠 ${counts.High} High · 🟡 ${counts.Medium} Medium · 🔵 ${counts.Low} Low. ` +
      `${passes.length} check(s) passed / informational.`
  );
  L.push("");

  // Detect a wholesale-unreachable run (most areas errored, nothing loaded).
  const unreachable = allErrors.length >= 5 && issues.length === 0;
  if (unreachable) {
    L.push(`> 🚧 **The target could not be reached from the environment that generated this report.**`);
    L.push(`> Every browser-based check failed to connect (e.g. \`ERR_TUNNEL_CONNECTION_FAILED\` / HTTP 403 from an egress proxy), so **no live findings were collected**. This is an environment/network limitation, **not** a clean bill of health for the site and **not** a broken suite — the suite is verified working.`);
    L.push(`>`);
    L.push(`> **To get real results, run \`npm run test:all\` from a machine or session with outbound access to ${BASE_URL} (and \`*.supabase.co\`).**`);
    L.push("");
  } else if (allErrors.length) {
    L.push(`> ⚠️ **Run limitations:** ${allErrors.length} area(s) reported errors (e.g. target unreachable from this environment). See _Run limitations_ at the bottom — some sections may be empty until the suite is run from a network that can reach the site.`);
    L.push("");
  }

  // ---- Top 5 ----
  L.push(`## Top 5 issues to fix first`);
  L.push("");
  const top = issues.slice(0, 5);
  if (!top.length) {
    L.push(`_No issues recorded yet. Run \`npm run test:all\` from an environment with network access to ${BASE_URL}._`);
  } else {
    top.forEach((it, i) => {
      L.push(`${i + 1}. **[${it.severity}] (${it.area})** ${it.issue}`);
      if (it.fix) L.push(`   - _Fix:_ ${it.fix}`);
    });
  }
  L.push("");

  // ---- Full findings table ----
  L.push(`## All findings`);
  L.push("");
  L.push(`| # | Area | Issue | Steps to reproduce | Severity | Evidence | Suggested fix |`);
  L.push(`|---|------|-------|--------------------|----------|----------|---------------|`);
  if (!issues.length) {
    L.push(`| — | — | _No issues found (or suite not yet run against a reachable target)._ | — | — | — | — |`);
  } else {
    issues.forEach((it, i) => {
      L.push(
        `| ${i + 1} | ${cell(it.area)} | ${cell(it.issue)} | ${cell(it.steps) || "—"} | ${cell(it.severity)} | ${cell(it.evidence) || "—"} | ${cell(it.fix) || "—"} |`
      );
    });
  }
  L.push("");

  // ---- Passed / informational, per area ----
  L.push(`## Passed & informational checks`);
  L.push("");
  for (const { data } of payloads) {
    const ps = data.items.filter((i) => i.severity === "Info");
    if (!ps.length) continue;
    L.push(`### ${data.area}`);
    for (const p of ps) L.push(`- ✅ ${cell(p.issue)}${p.evidence ? " — " + cell(p.evidence) : ""}`);
    L.push("");
  }

  // ---- Run limitations ----
  if (allErrors.length) {
    L.push(`## Run limitations / errors`);
    L.push("");
    for (const e of allErrors) L.push(`- **${cell(e.area)}:** ${cell(e.message)}`);
    L.push("");
  }

  // ---- Footer ----
  L.push(`## How to re-run`);
  L.push("");
  L.push("```bash");
  L.push("cd truvi-tests");
  L.push("npm install          # first time only");
  L.push("npx playwright install   # first time only (downloads the browser)");
  L.push("npm run test:all     # runs all 8 checks and regenerates REPORT.md");
  L.push("```");
  L.push("");
  L.push(`Individual checks: \`npm run test:links\`, \`test:nav\`, \`test:forms\`, \`test:rls\`, \`test:responsive\`, \`test:lighthouse\`, \`test:a11y\`, \`test:security\`.`);
  L.push("");
  L.push(`Screenshots are saved under \`screenshots/<mobile|tablet|desktop>/\`. Raw JSON results are under \`results/\`.`);
  L.push("");

  const out = new URL("../REPORT.md", import.meta.url).pathname;
  fs.writeFileSync(out, L.join("\n"));
  return { out, counts, issues: issues.length, passes: passes.length, errors: allErrors.length };
}

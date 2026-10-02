// A tiny findings model shared by every test. Each finding maps 1:1 to a row in
// the REPORT.md table: Area | Issue | Steps to reproduce | Severity | Evidence | Suggested fix.

import fs from "node:fs";
import { OUT_DIR } from "../config.mjs";

export const SEVERITY = {
  CRITICAL: "Critical",
  HIGH: "High",
  MEDIUM: "Medium",
  LOW: "Low",
  INFO: "Info", // informational / passed checks — not counted as an issue
};

export const SEVERITY_ORDER = ["Critical", "High", "Medium", "Low", "Info"];

export class Findings {
  constructor(area) {
    this.area = area;
    this.items = [];
    this.startedAt = new Date().toISOString();
    this.errors = []; // suite-level errors (e.g. could not reach the site)
  }

  add({ issue, steps, severity, evidence, fix, area }) {
    this.items.push({
      area: area || this.area,
      issue: String(issue || "").trim(),
      steps: String(steps || "").trim(),
      severity: severity || SEVERITY.MEDIUM,
      evidence: String(evidence || "").trim(),
      fix: String(fix || "").trim(),
    });
    return this;
  }

  pass(issue, evidence = "") {
    return this.add({ issue, severity: SEVERITY.INFO, evidence, steps: "", fix: "" });
  }

  error(message) {
    this.errors.push(String(message));
    return this;
  }

  save(name) {
    if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
    const payload = {
      area: this.area,
      startedAt: this.startedAt,
      finishedAt: new Date().toISOString(),
      errors: this.errors,
      items: this.items,
    };
    fs.writeFileSync(OUT_DIR + name + ".json", JSON.stringify(payload, null, 2));
    return payload;
  }
}

// Truncate long evidence so the markdown table stays readable.
export function clip(str, n = 220) {
  const s = String(str ?? "").replace(/\s+/g, " ").trim();
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

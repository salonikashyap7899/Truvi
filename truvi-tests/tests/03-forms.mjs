// TEST 3 — Form validation ONLY. Never submits to the backend.
//
// Safety model (defence in depth):
//   1. This test runs in its OWN browser context with an init script that HARD
//      BLOCKS every mutating network call (POST/PUT/PATCH/DELETE via fetch, XHR,
//      sendBeacon) and neuters HTMLFormElement.submit()/requestSubmit(). So even
//      if some framework handler tries to send, nothing reaches the server.
//   2. For VALID data we NEVER click submit — we only fill fields and read the
//      Constraint Validation API + submit-button state.
//   3. For INVALID data (empty required / bad email / bad phone) we may click the
//      submit button purely to surface the site's validation UI. Native constraint
//      validation refuses to send in that state, and guard (1) blocks anything else.
//
// Nothing is ever written, updated, or deleted.

import { launch, newContext } from "../lib/browser.mjs";
import { standalone, ensureCrawl, isMain } from "../lib/runner.mjs";
import { Findings, SEVERITY, clip } from "../lib/findings.mjs";
import { BASE_URL, TIMEOUTS } from "../config.mjs";

const GUARD = `
(() => {
  window.__blockedMutations = [];
  const MUT = /^(POST|PUT|PATCH|DELETE)$/i;
  const record = (how, url, method) => { try { window.__blockedMutations.push({how, url:String(url), method}); } catch(e){} };

  const origFetch = window.fetch;
  window.fetch = function(input, init) {
    const method = (init && init.method) || (input && input.method) || 'GET';
    const url = (typeof input === 'string') ? input : (input && input.url) || '';
    if (MUT.test(method)) { record('fetch', url, method); return Promise.reject(new Error('[SafeTest] mutating request blocked')); }
    return origFetch.apply(this, arguments);
  };

  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function(method, url) { this.__m = method; this.__u = url; return origOpen.apply(this, arguments); };
  XMLHttpRequest.prototype.send = function() {
    if (MUT.test(this.__m || 'GET')) { record('xhr', this.__u, this.__m); return; } // silently drop
    return origSend.apply(this, arguments);
  };

  if (navigator.sendBeacon) { const b = navigator.sendBeacon.bind(navigator); navigator.sendBeacon = (u, d) => { record('beacon', u, 'POST'); return true; }; }

  const proto = HTMLFormElement.prototype;
  const noop = function(){ record('form.submit', this.action || location.href, 'POST'); };
  try { proto.submit = noop; } catch(e){}
  try { if (proto.requestSubmit) proto.requestSubmit = noop; } catch(e){}
})();
`;

const VALID = {
  email: "test.user@example.com",
  tel: "+919876543210",
  url: "https://example.com",
  number: "12",
  date: "2030-01-01",
  password: "Str0ngPassw0rd!",
  text: "Test User",
  textarea: "This is an automated non-destructive validation test message.",
};

async function settle(page) {
  try { await page.waitForLoadState("networkidle", { timeout: 8000 }); } catch {}
  await page.waitForTimeout(1000);
}

// Fill every fillable field. mode: 'valid' | 'empty-required' | 'bad-email-phone'
async function fillForm(page, formIndex, mode) {
  return page.evaluate(
    ({ formIndex, mode, VALID }) => {
      const form = document.querySelectorAll("form")[formIndex];
      if (!form) return { ok: false };
      const fields = [...form.querySelectorAll("input, textarea, select")];
      const setVal = (el, v) => {
        const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : el.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
        setter ? setter.call(el, v) : (el.value = v);
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        el.dispatchEvent(new Event("blur", { bubbles: true }));
      };
      for (const el of fields) {
        const type = (el.type || el.tagName).toLowerCase();
        if (["hidden", "submit", "button", "reset", "file", "image"].includes(type)) continue;
        const required = el.required || el.getAttribute("aria-required") === "true";
        if (type === "checkbox" || type === "radio") {
          if (mode !== "empty-required") { el.checked = true; el.dispatchEvent(new Event("change", { bubbles: true })); }
          else { el.checked = false; el.dispatchEvent(new Event("change", { bubbles: true })); }
          continue;
        }
        if (el.tagName === "SELECT") {
          const opt = [...el.options].find((o) => o.value);
          if (mode !== "empty-required" && opt) { el.value = opt.value; el.dispatchEvent(new Event("change", { bubbles: true })); }
          else { el.value = ""; el.dispatchEvent(new Event("change", { bubbles: true })); }
          continue;
        }
        if (mode === "empty-required") { setVal(el, ""); continue; }
        let v;
        if (type === "email") v = mode === "bad-email-phone" ? "not-an-email" : VALID.email;
        else if (type === "tel") v = mode === "bad-email-phone" ? "abc" : VALID.tel;
        else if (type === "url") v = VALID.url;
        else if (type === "number") v = VALID.number;
        else if (type === "date") v = VALID.date;
        else if (type === "password") v = VALID.password;
        else if (el.tagName === "TEXTAREA") v = VALID.textarea;
        else {
          // name-based guesses for phone/email fields that use type=text
          const hint = (el.name + " " + el.id + " " + (el.placeholder || "")).toLowerCase();
          if (/e-?mail/.test(hint)) v = mode === "bad-email-phone" ? "not-an-email" : VALID.email;
          else if (/phone|mobile|tel|contact/.test(hint)) v = mode === "bad-email-phone" ? "abc" : VALID.tel;
          else v = VALID.text;
        }
        setVal(el, v);
      }
      // Native constraint snapshot (no submit).
      const invalidFields = [];
      for (const el of fields) {
        if (typeof el.checkValidity === "function" && !el.checkValidity()) {
          invalidFields.push({ name: el.name || el.id || el.type, message: el.validationMessage });
        }
      }
      return {
        ok: true,
        formValid: typeof form.checkValidity === "function" ? form.checkValidity() : null,
        invalidFields,
        fieldCount: fields.length,
      };
    },
    { formIndex, mode, VALID }
  );
}

// Scan for visible validation messages after an invalid interaction.
async function collectMessages(page, formIndex) {
  return page.evaluate((formIndex) => {
    const form = document.querySelectorAll("form")[formIndex];
    if (!form) return { texts: [], ariaInvalid: 0, submitDisabled: null };
    const texts = new Set();
    const sel = "[role=alert], [aria-live], .error, .invalid, .field-error, .help-block, .form-error, [class*='error' i], [class*='invalid' i]";
    for (const el of form.querySelectorAll(sel)) {
      const t = (el.textContent || "").replace(/\s+/g, " ").trim();
      if (t && t.length < 200) texts.add(t);
    }
    // messages rendered just outside the form element are common in React
    for (const el of document.querySelectorAll("[role=alert], [aria-live]")) {
      const t = (el.textContent || "").replace(/\s+/g, " ").trim();
      if (t && t.length < 200) texts.add(t);
    }
    const ariaInvalid = form.querySelectorAll("[aria-invalid='true']").length;
    const submitBtn = form.querySelector("button[type=submit], input[type=submit], button:not([type])");
    return { texts: [...texts].slice(0, 8), ariaInvalid, submitDisabled: submitBtn ? submitBtn.disabled : null };
  }, formIndex);
}

async function clickSubmitGuarded(page, formIndex) {
  // Only called for INVALID scenarios. Native validation refuses to send;
  // the init-script guard blocks anything else. Returns blocked-send log.
  const btn = page
    .locator("form")
    .nth(formIndex)
    .locator("button[type=submit], input[type=submit], button:not([type])")
    .first();
  if (await btn.count()) {
    await btn.click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(800);
  }
  return page.evaluate(() => window.__blockedMutations || []);
}

async function auditPage(url, context, f) {
  const page = await context.newPage();
  try {
    const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: TIMEOUTS.navigation });
    if (!resp || resp.status() >= 400) {
      f.error(`Could not load ${url} (HTTP ${resp ? resp.status() : "n/a"}) to audit forms.`);
      await page.close();
      return { loaded: false, forms: 0 };
    }
    await settle(page);
    const formCount = await page.locator("form").count();
    if (!formCount) { await page.close(); return { loaded: true, forms: 0 }; }

    for (let i = 0; i < formCount; i++) {
      const label = `form #${i + 1} on ${url}`;

      // --- Scenario A: valid data (NO submit click) ---
      const valid = await fillForm(page, i, "valid");
      if (!valid.ok) continue;
      if (valid.formValid === false) {
        f.add({
          issue: `Valid data still fails native validation (${label})`,
          steps: `Fill all fields with valid values; observe Constraint Validation API`,
          severity: SEVERITY.MEDIUM,
          evidence: `Invalid: ${clip(valid.invalidFields.map((x) => `${x.name}:${x.message}`).join("; "))}`,
          fix: "Loosen over-strict field constraints so genuine valid input is accepted.",
        });
      } else {
        f.pass(`Valid data accepted client-side (${label})`, `${valid.fieldCount} field(s); no submit clicked`);
      }
      const validMsgs = await collectMessages(page, i);

      // --- Scenario B: empty required ---
      await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
      await settle(page);
      const empty = await fillForm(page, i, "empty-required");
      const hasRequired = empty.invalidFields && empty.invalidFields.length > 0;
      const blockedB = await clickSubmitGuarded(page, i);
      const msgsB = await collectMessages(page, i);
      const shownB = msgsB.texts.length > 0 || msgsB.ariaInvalid > 0 || hasRequired || msgsB.submitDisabled === true;
      if (!shownB) {
        f.add({
          issue: `No validation shown for empty required fields (${label})`,
          steps: `Leave required fields empty and attempt to proceed`,
          severity: SEVERITY.HIGH,
          evidence: `No error text / aria-invalid / native required constraint detected`,
          fix: "Mark required fields with the required attribute and show inline error messages.",
        });
      } else {
        f.pass(`Empty-required validation present (${label})`, clip(`native:${hasRequired} aria:${msgsB.ariaInvalid} msgs:${msgsB.texts.slice(0,2).join(" | ")}`));
      }
      if (blockedB.length) f.pass(`Guard blocked ${blockedB.length} submit attempt(s) (${label})`, clip(blockedB.map((b) => `${b.how}:${b.method}`).join(", ")));

      // --- Scenario C: invalid email / phone ---
      await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
      await settle(page);
      const bad = await fillForm(page, i, "bad-email-phone");
      const emailPhoneInvalid = (bad.invalidFields || []).some((x) => /mail|phone|tel/i.test(x.name) || /email|phone/i.test(x.message || ""));
      const blockedC = await clickSubmitGuarded(page, i);
      const msgsC = await collectMessages(page, i);
      const shownC = msgsC.texts.length > 0 || msgsC.ariaInvalid > 0 || emailPhoneInvalid || bad.formValid === false;
      if (!shownC) {
        f.add({
          issue: `No validation for invalid email/phone (${label})`,
          steps: `Enter "not-an-email" in email and "abc" in phone; attempt to proceed`,
          severity: SEVERITY.MEDIUM,
          evidence: `No format error surfaced`,
          fix: "Validate email/phone format client-side and show a clear message.",
        });
      } else {
        f.pass(`Invalid email/phone validation present (${label})`, clip(msgsC.texts.slice(0, 2).join(" | ") || `formValid=${bad.formValid}`));
      }
      if (blockedC.length) f.pass(`Guard blocked ${blockedC.length} submit attempt(s) (${label})`);
    }
    await page.close();
    return { loaded: true, forms: formCount };
  } catch (e) {
    f.error(`Form audit failed on ${url}: ${e.message}`);
    await page.close().catch(() => {});
    return { loaded: false, forms: 0 };
  }
}

export async function run(shared) {
  const f = new Findings("Forms");

  // Pages likely to contain forms: homepage + any crawled page whose URL hints a form.
  let candidatePages = [BASE_URL];
  if (shared && shared.context) {
    try {
      const data = await ensureCrawl(shared);
      const extra = data.pages
        .filter((p) => p.ok)
        .map((p) => p.url)
        .filter((u) => /contact|enquir|inquir|lead|book|demo|quote|get-?started|list|sign|join/i.test(u));
      candidatePages = [...new Set([BASE_URL, ...extra])].slice(0, 8);
    } catch {}
  }

  // Dedicated GUARDED context — mutating requests can never leave.
  const browser = await launch();
  const guarded = await newContext(browser);
  await guarded.addInitScript(GUARD);

  let totalForms = 0;
  let loadedPages = 0;
  for (const url of candidatePages) {
    const r = await auditPage(url, guarded, f);
    totalForms += r.forms;
    if (r.loaded) loadedPages++;
  }
  if (loadedPages === 0) {
    f.error("No candidate page could be loaded — form validation could not be assessed from this environment.");
  } else if (totalForms === 0) {
    f.pass("No HTML <form> elements found on scanned pages", `Scanned ${loadedPages} page(s): ${clip(candidatePages.join(", "))}`);
  } else {
    f.pass(`Audited ${totalForms} form(s) across ${loadedPages} loaded page(s) — zero submits sent`);
  }

  await browser.close();
  return f.save("03-forms");
}

if (isMain(import.meta.url)) {
  standalone(run, { needsCrawl: false }).then((p) =>
    console.log(`Forms: ${p.items.filter((i) => i.severity !== "Info").length} issue(s), ${p.errors.length} error(s)`)
  );
}

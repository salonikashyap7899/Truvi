import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "../config/db";
import { users, payments, subscriptions, IUser } from "../db/schema";
import { getEnv } from "../config/env";
import { sendEmail } from "./emailService";

/**
 * Lifecycle emails — automated onboarding mail sent as Truvi Ventures.
 *
 *  1. Welcome email — sent exactly once, the moment an account becomes fully
 *     verified (email + phone OTP confirmed). Role-aware "next steps".
 *  2. "Finish your setup" reminder — a throttled nudge for accounts that still
 *     have something pending: unverified account, CP/Ambassador KYC not done,
 *     or a developer with no active plan. Lists every pending step in one mail.
 *
 * Both are best-effort and never block the request path — callers fire-and-
 * forget and swallow errors so a mail hiccup can't fail a signup/verify.
 */

const BRAND = "#7C5CFF";
const SUPPORT_WHATSAPP = process.env.SUPPORT_WHATSAPP || "";

function appUrl(): string {
  const env = getEnv();
  return (env.clientUrl || env.publicUrl || "https://truviventures.com").replace(/\/$/, "");
}

/** Wrap body content in the shared Truvi Ventures branded shell. */
function shell(title: string, bodyHtml: string, cta?: { label: string; href: string }): string {
  const button = cta
    ? `<div style="margin:28px 0 8px">
         <a href="${cta.href}" style="display:inline-block;background:${BRAND};color:#fff;text-decoration:none;
            font-weight:700;font-size:15px;padding:13px 26px;border-radius:12px">${cta.label}</a>
       </div>`
    : "";
  const support = SUPPORT_WHATSAPP
    ? `<p style="color:#94a3b8;font-size:12.5px;margin-top:22px">Need help? Message us on WhatsApp at ${SUPPORT_WHATSAPP}.</p>`
    : "";
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#f1f5f9;padding:28px 12px">
    <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:18px;overflow:hidden;border:1px solid #e2e8f0">
      <div style="background:linear-gradient(135deg,#7C5CFF,#A855F7);padding:22px 28px">
        <div style="color:#fff;font-size:20px;font-weight:800;letter-spacing:.3px">Truvi Ventures</div>
      </div>
      <div style="padding:26px 28px 30px">
        <h2 style="color:#0f172a;margin:0 0 12px;font-size:19px">${title}</h2>
        ${bodyHtml}
        ${button}
        ${support}
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:26px 0 14px" />
        <p style="color:#94a3b8;font-size:12px;margin:0">You're receiving this because you have a Truvi Ventures account. This is an automated message from truviventures@gmail.com.</p>
      </div>
    </div>
  </div>`;
}

const li = (s: string) => `<li style="margin:6px 0">${s}</li>`;

/** Role-specific "what to do next" lines shown in the welcome email. */
function welcomeNextSteps(role: IUser["role"]): string[] {
  switch (role) {
    case "CP":
      return [
        "Complete your <b>KYC</b> (Aadhaar + PAN + a live selfie) — your dashboard unlocks the moment an admin approves it.",
        "Start sharing listings and adding leads to earn commission — Truvi keeps 0% of your earnings.",
      ];
    case "AMBASSADOR":
      return [
        "Finish your <b>onboarding & KYC</b> to activate your ambassador dashboard.",
        "Grab your referral code and start inviting developers and channel partners.",
      ];
    case "DEVELOPER":
      return [
        "List your first project and complete its details for verification.",
        "Activate a plan to unlock the <b>Verified Developer</b> badge, CRM, AI tools and 3D mapping.",
      ];
    case "BUYER":
      return [
        "Browse verified projects and save your favourites.",
        "Compare properties and raise an enquiry — a channel partner will reach out.",
      ];
    default:
      return ["Explore your dashboard to get started."];
  }
}

/**
 * Send the one-time welcome email. Stamps `welcomeEmailSentAt` first so a retry
 * or a double verify-account call can never send it twice. Safe to call on
 * every "account fully verified" transition.
 */
export async function sendWelcomeEmailOnce(user: Pick<IUser, "_id" | "name" | "email" | "role" | "welcomeEmailSentAt">): Promise<void> {
  if (user.welcomeEmailSentAt) return;
  const db = getDb();
  // Claim the send atomically — only proceed if we flip a NULL to now().
  const claimed = await db
    .update(users)
    .set({ welcomeEmailSentAt: new Date() })
    .where(and(eq(users._id, String(user._id)), isNullWelcome()))
    .returning({ _id: users._id });
  if (claimed.length === 0) return; // someone else already sent it

  try {
    const steps = welcomeNextSteps(user.role);
    const body = `
      <p style="color:#475569;font-size:14.5px;line-height:1.6">Hi ${escapeHtml(user.name)},</p>
      <p style="color:#475569;font-size:14.5px;line-height:1.6">Welcome to <b>Truvi Ventures</b> — your account (<b>${escapeHtml(user.email)}</b>) is verified and ready. Here's how to get the most out of it:</p>
      <ul style="color:#334155;font-size:14px;line-height:1.5;padding-left:20px">${steps.map(li).join("")}</ul>`;
    await sendEmail(
      user.email,
      "Welcome to Truvi Ventures 🎉",
      shell("Your account is ready", body, { label: "Open your dashboard", href: `${appUrl()}/login` }),
    );
  } catch (err) {
    // Roll the stamp back so a later run can retry the welcome mail.
    await db.update(users).set({ welcomeEmailSentAt: null }).where(eq(users._id, String(user._id)));
    console.warn("sendWelcomeEmailOnce failed:", err instanceof Error ? err.message : err);
  }
}

// drizzle helper: users.welcomeEmailSentAt IS NULL
const isNullWelcome = () => sql`${users.welcomeEmailSentAt} is null`;

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

/* ============================================================ reminders */

export interface PendingStep {
  text: string;
  cta: { label: string; href: string };
}

const REMINDER_COOLDOWN_MS = 3 * 24 * 60 * 60 * 1000; // 3 days
const GRACE_AFTER_SIGNUP_MS = 6 * 60 * 60 * 1000; // don't nag in the first 6h

/**
 * Compute the outstanding onboarding steps for one account. Returns [] when the
 * account is fully set up for its role (nothing to remind about).
 */
export function pendingStepsFor(user: IUser, hasActivePlan: boolean): PendingStep[] {
  const url = appUrl();
  const steps: PendingStep[] = [];

  // 1. Account verification (blocks login for everyone).
  if (!user.emailVerified || !user.phoneVerified) {
    steps.push({
      text: "Your account isn't verified yet — confirm the codes sent to your email and phone to finish signing up.",
      cta: { label: "Verify my account", href: `${url}/login` },
    });
    // Nothing else matters until they can log in.
    return steps;
  }

  // 2. Role-specific setup.
  if (user.role === "CP" || user.role === "AMBASSADOR") {
    const kyc = user.onboardingChecks?.kycStatus;
    // PENDING means it's already with an admin — don't nag. Nudge when it was
    // never submitted or was rejected.
    if (!user.onboardingVerified && kyc !== "PENDING") {
      steps.push({
        text: kyc === "REJECTED"
          ? "Your KYC was rejected. Please re-submit your Aadhaar, PAN and selfie so we can verify you."
          : "You still need to complete your KYC (Aadhaar + PAN + a live selfie) to unlock your dashboard.",
        cta: { label: "Complete my KYC", href: `${url}/login` },
      });
    }
  } else if (user.role === "DEVELOPER") {
    if (!hasActivePlan) {
      steps.push({
        text: "Activate a plan to get your Verified Developer badge and unlock CRM, AI tools and 3D mapping for your listings.",
        cta: { label: "See plans", href: `${url}/developer/dashboard` },
      });
    }
  }

  return steps;
}

/** Send one consolidated reminder listing every pending step. */
async function sendReminderEmail(user: IUser, steps: PendingStep[]): Promise<void> {
  const items = steps.map((s) => li(s.text)).join("");
  const primary = steps[0].cta;
  const body = `
    <p style="color:#475569;font-size:14.5px;line-height:1.6">Hi ${escapeHtml(user.name)},</p>
    <p style="color:#475569;font-size:14.5px;line-height:1.6">You're almost set up on <b>Truvi Ventures</b>. A few things are still pending on your account (<b>${escapeHtml(user.email)}</b>):</p>
    <ul style="color:#334155;font-size:14px;line-height:1.5;padding-left:20px">${items}</ul>
    <p style="color:#475569;font-size:14.5px;line-height:1.6">Finish these to get full access.</p>`;
  await sendEmail(
    user.email,
    "Finish setting up your Truvi Ventures account",
    shell("A few steps left", body, primary),
  );
}

/**
 * Scan all accounts and email a reminder to anyone with pending onboarding
 * steps, respecting the per-account cooldown. Returns how many were sent.
 * Safe to run on a schedule; also exposed via an admin endpoint.
 */
export async function runLifecycleReminders(): Promise<{ scanned: number; sent: number }> {
  const db = getDb();
  const now = Date.now();
  const all = await db.select().from(users);
  const candidates = all.filter((u) => !u.disabled && u.approvalStatus === "APPROVED");

  // Which developers have an active plan? Batch-load PAID payments + ACTIVE
  // subscriptions once instead of per-user.
  const devIds = candidates.filter((u) => u.role === "DEVELOPER").map((u) => String(u._id));
  const paidUserIds = new Set<string>();
  if (devIds.length > 0) {
    const [pays, subs] = await Promise.all([
      db.select({ userId: payments.userId }).from(payments).where(and(eq(payments.status, "PAID"), inArray(payments.userId, devIds))),
      db.select({ userId: subscriptions.userId }).from(subscriptions).where(and(eq(subscriptions.status, "ACTIVE"), inArray(subscriptions.userId, devIds))),
    ]);
    for (const p of pays) if (p.userId) paidUserIds.add(String(p.userId));
    for (const s of subs) if (s.userId) paidUserIds.add(String(s.userId));
  }

  let sent = 0;
  for (const u of candidates) {
    // Give fresh signups a grace window and honour the cooldown.
    if (now - new Date(u.createdAt).getTime() < GRACE_AFTER_SIGNUP_MS) continue;
    if (u.lastReminderAt && now - new Date(u.lastReminderAt).getTime() < REMINDER_COOLDOWN_MS) continue;
    if (!u.email) continue;

    const steps = pendingStepsFor(u, paidUserIds.has(String(u._id)));
    if (steps.length === 0) continue;

    try {
      await sendReminderEmail(u, steps);
      await db.update(users).set({ lastReminderAt: new Date() }).where(eq(users._id, String(u._id)));
      sent++;
    } catch (err) {
      console.warn(`lifecycle reminder failed for ${u.email}:`, err instanceof Error ? err.message : err);
    }
  }
  return { scanned: candidates.length, sent };
}

/**
 * Start the daily reminder sweep. A single long-lived interval in the API
 * process (managed by pm2) — runs a first pass shortly after boot, then daily.
 */
export function startLifecycleReminderScheduler(): void {
  const DAY = 24 * 60 * 60 * 1000;
  const run = () => {
    runLifecycleReminders()
      .then((r) => { if (r.sent > 0) console.log(`[lifecycle] reminders sent: ${r.sent}/${r.scanned}`); })
      .catch((err) => console.warn("[lifecycle] reminder sweep failed:", err instanceof Error ? err.message : err));
  };
  setTimeout(run, 60_000).unref(); // first pass ~1 min after boot
  setInterval(run, DAY).unref();
}

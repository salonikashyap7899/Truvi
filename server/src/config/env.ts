import dotenv from "dotenv";
import { DEV_JWT_ACCESS_DEFAULT, DEV_JWT_REFRESH_DEFAULT } from "../lib/jwt";

dotenv.config();

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function getEnv() {
  return {
    databaseUrl: process.env.DATABASE_URL || "",
    jwtAccessSecret: process.env.JWT_ACCESS_SECRET || "",
    jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || "",
    nodeEnv: process.env.NODE_ENV || "development",
    port: Number(process.env.PORT || 3001),
    host: process.env.HOST || "0.0.0.0",
    clientUrl: process.env.CLIENT_URL || "",
    publicUrl: process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || "",
    uploadDir: process.env.UPLOAD_DIR || "",
    // ── Razorpay ──────────────────────────────────────────────────────────
    razorpayKeyId: process.env.RAZORPAY_KEY_ID || "",
    razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET || "",
    razorpayWebhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || "",
    // ── Telephony / masked calling (CPaaS) ────────────────────────────────────
    // Modular: swap the provider by changing TELEPHONY_PROVIDER + its creds; no
    // app code changes. Exotel is the default India-supported provider (virtual
    // numbers, call masking + bridging, recording, status webhooks).
    telephony: {
      provider: (process.env.TELEPHONY_PROVIDER || "exotel").toLowerCase(),
      // Shared secret appended to the provider status-callback URL so only the
      // provider's webhooks are accepted.
      webhookToken: process.env.TELEPHONY_WEBHOOK_TOKEN || "",
      exotel: {
        sid: process.env.EXOTEL_SID || "",
        apiKey: process.env.EXOTEL_API_KEY || "",
        apiToken: process.env.EXOTEL_API_TOKEN || "",
        subdomain: process.env.EXOTEL_SUBDOMAIN || "api.exotel.com",
        // The ExoPhone / virtual number both parties see (real numbers stay hidden).
        callerId: process.env.EXOTEL_CALLER_ID || "",
        record: /^(1|true|yes|on)$/i.test(String(process.env.EXOTEL_RECORD ?? "true")),
      },
    },
    // GST added on top of every price. Configurable; India default is 18%.
    // parseFloat tolerates values like "18%" or "18 " and we fall back to 18
    // on anything non-numeric so a stray character can never make amounts NaN.
    gstPercent: (() => {
      const g = parseFloat(String(process.env.GST_PERCENT ?? "18"));
      return Number.isFinite(g) ? g : 18;
    })(),
    // ── Developer OS test access ─────────────────────────────────────────────
    // Unlock every paid developer tool for ALL developers (staging/test deploy).
    devUnlockAll: /^(1|true|yes|on)$/i.test(String(process.env.DEV_UNLOCK_ALL ?? "")),
    // Unlock every paid developer tool for specific developer accounts (by email,
    // comma-separated) — designate test "developer admin" accounts without payment.
    devUnlockEmails: String(process.env.DEV_UNLOCK_EMAILS ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
    // ── Founder (CEO OS) accounts ────────────────────────────────────────────
    // Truvi's two founders — Sandeep & Meraj — are provisioned as ADMIN-role
    // accounts on boot so the CEO OS is reachable on a fresh deploy without the
    // destructive seed. Names, emails and passwords are env-overridable. Each
    // founder can have their own password (FOUNDER1_PASSWORD / FOUNDER2_PASSWORD);
    // FOUNDER_PASSWORD is a shared fallback for both.
    founderPassword: process.env.FOUNDER_PASSWORD?.trim() || "",
    founders: [
      {
        name: process.env.FOUNDER1_NAME?.trim() || "Sandeep",
        email: (process.env.FOUNDER1_EMAIL?.trim() || "sandeep@truviventures.com").toLowerCase(),
        password: process.env.FOUNDER1_PASSWORD?.trim() || "",
      },
      {
        name: process.env.FOUNDER2_NAME?.trim() || "Meraj",
        email: (process.env.FOUNDER2_EMAIL?.trim() || "meraj@truviventures.com").toLowerCase(),
        password: process.env.FOUNDER2_PASSWORD?.trim() || "",
      },
    ],
  };
}

/**
 * Strong built-in Founder password used only when FOUNDER_PASSWORD is not set.
 * Intentionally long and mixed-class (upper/lower/digits/symbols) and built
 * from both founders' names — Sandeep & Meeraj. Production deploys should
 * override it via FOUNDER_PASSWORD and rotate after first login.
 */
export const DEFAULT_FOUNDER_PASSWORD = "Sandeep@Meeraj#Truvi2026!";

/**
 * Founder accounts recognised for CEO-OS routing beyond the two provisioned
 * founders — the legacy `founder@truvi.app` placeholder and any owner accounts
 * that must always land on /founder/dashboard. Additional emails can also be
 * supplied at runtime via FOUNDER_EMAILS (comma-separated) without a code change.
 */
const BUILTIN_FOUNDER_EMAILS = new Set(
  [
    "founder@truvi.app",
    "isalonikashyap@gmail.com",
    ...String(process.env.FOUNDER_EMAILS ?? "").split(","),
  ]
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
);

/**
 * True when the given email belongs to a Truvi founder (the accounts that land
 * on the full CEO OS at /founder/dashboard rather than the operational admin
 * panel). Server-authoritative so routing never depends on the client build
 * carrying a matching email allowlist. Case-insensitive.
 */
export function isFounderEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const e = email.trim().toLowerCase();
  if (BUILTIN_FOUNDER_EMAILS.has(e)) return true;
  return getEnv().founders.some((f) => f.email === e);
}

/** True only when both Razorpay keys are configured. */
export function isRazorpayConfigured(): boolean {
  const env = getEnv();
  return Boolean(env.razorpayKeyId && env.razorpayKeySecret);
}

/**
 * Boot-time security guard. Fails closed: the app refuses to start in any
 * environment that is not an explicit local `development`/`test` run unless the
 * JWT signing secrets and the database URL are set to real, non-default values.
 *
 * This deliberately does NOT key off `NODE_ENV === "production"` alone. A common
 * production misconfiguration is a process manager that never sets
 * `NODE_ENV=production`; previously that silently skipped these checks and let
 * the app sign tokens with the public dev-default secret (full auth bypass). Now
 * anything other than an explicit `development`/`test` run is treated as live
 * and must carry real secrets.
 *
 * Local development keeps working: run with `NODE_ENV=development` (the `dev`
 * script sets it) or `test` to use the built-in dev fallbacks.
 */
export function assertRequiredEnvForProduction(): void {
  // Read NODE_ENV raw (not getEnv().nodeEnv, which defaults an UNSET value to
  // "development"). An unset/blank NODE_ENV must be treated as live and fail
  // closed — that unset case on the VPS is the exact misconfiguration this
  // guard exists to catch. Only an explicit "development"/"test" is local.
  const nodeEnv = (process.env.NODE_ENV || "").trim().toLowerCase();
  const isLocalDevOrTest = nodeEnv === "development" || nodeEnv === "test";
  if (isLocalDevOrTest) return;

  const accessSecret = requireEnv("JWT_ACCESS_SECRET");
  const refreshSecret = requireEnv("JWT_REFRESH_SECRET");
  requireEnv("DATABASE_URL");

  if (accessSecret === DEV_JWT_ACCESS_DEFAULT || refreshSecret === DEV_JWT_REFRESH_DEFAULT) {
    throw new Error(
      "Refusing to start: JWT_ACCESS_SECRET / JWT_REFRESH_SECRET are still set to the built-in development defaults. " +
        "Set them to long random secrets (e.g. `openssl rand -hex 32`) before running outside local development.",
    );
  }
  if (accessSecret === refreshSecret) {
    throw new Error("Refusing to start: JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different values.");
  }
}

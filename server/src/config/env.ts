import dotenv from "dotenv";

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
    // ── Default Founder account ──────────────────────────────────────────────
    // A Founder (ADMIN-role) account is provisioned on boot so the CEO OS is
    // reachable on a fresh deploy without running the destructive seed. Override
    // any of these via the environment; always set FOUNDER_PASSWORD in prod.
    founderName: process.env.FOUNDER_NAME?.trim() || "Truvi Founder",
    founderEmail: (process.env.FOUNDER_EMAIL?.trim() || "founder@truvi.app").toLowerCase(),
    founderPassword: process.env.FOUNDER_PASSWORD?.trim() || "",
  };
}

/**
 * Strong built-in Founder password used only when FOUNDER_PASSWORD is not set.
 * It is intentionally long and mixed-class; production deploys should override
 * it via the environment and rotate after first login.
 */
export const DEFAULT_FOUNDER_PASSWORD = "Truvi@Founder!2026#OS";

/** True only when both Razorpay keys are configured. */
export function isRazorpayConfigured(): boolean {
  const env = getEnv();
  return Boolean(env.razorpayKeyId && env.razorpayKeySecret);
}

export function assertRequiredEnvForProduction(): void {
  if (getEnv().nodeEnv !== "production") return;

  requireEnv("JWT_ACCESS_SECRET");
  requireEnv("JWT_REFRESH_SECRET");
  requireEnv("DATABASE_URL");
}

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
  const nodeEnv = process.env.NODE_ENV || "development";
  const isProd = nodeEnv === "production";

  // Refresh-cookie policy. The cross-origin Render+Vercel split needs
  // SameSite=None; Secure. A single-origin deploy (e.g. one VPS serving both
  // the API and the built frontend) should use "lax", which also works before
  // TLS is set up. Overridable so one build serves both topologies.
  const cookieSameSite = (process.env.COOKIE_SAMESITE || (isProd ? "none" : "lax")).toLowerCase() as
    | "lax"
    | "none"
    | "strict";
  // SameSite=None mandates Secure; otherwise default to Secure only in prod.
  const cookieSecure =
    process.env.COOKIE_SECURE !== undefined
      ? process.env.COOKIE_SECURE === "true"
      : cookieSameSite === "none" || isProd;

  return {
    databaseUrl: process.env.DATABASE_URL || "",
    jwtAccessSecret: process.env.JWT_ACCESS_SECRET || "",
    jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || "",
    nodeEnv,
    port: Number(process.env.PORT || 3001),
    host: process.env.HOST || "0.0.0.0",
    clientUrl: process.env.CLIENT_URL || "",
    publicUrl: process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || "",
    uploadDir: process.env.UPLOAD_DIR || "",
    cookieSameSite,
    cookieSecure,
  };
}

export function assertRequiredEnvForProduction(): void {
  if (getEnv().nodeEnv !== "production") return;

  requireEnv("DATABASE_URL");
  requireEnv("JWT_ACCESS_SECRET");
  requireEnv("JWT_REFRESH_SECRET");
}

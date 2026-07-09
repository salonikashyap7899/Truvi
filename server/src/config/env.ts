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
  };
}

export function assertRequiredEnvForProduction(): void {
  if (getEnv().nodeEnv !== "production") return;

  requireEnv("MONGO_URI");
  requireEnv("JWT_ACCESS_SECRET");
  requireEnv("JWT_REFRESH_SECRET");
}

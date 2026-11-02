import "dotenv/config";
import { createServer } from "http";
import { createApp } from "./app";
import { connectDB, disconnectDB } from "./config/db";
import { FounderProvisioningConfigError } from "./db/bootstrapFounder";
import { initSocket } from "./sockets";
import { assertRequiredEnvForProduction, getEnv } from "./config/env";
import { startLifecycleReminderScheduler } from "./services/lifecycleEmails";
import { startNotificationReminderScheduler } from "./services/notificationReminders";
import { startPropertyRequirementBackgroundWorkers } from "./services/propertyRequirementMatching";
import { isAiSensyEnabled, isWhatsAppEnabled } from "./services/whatsappService";
import { startHabitatPayoutScheduler } from "./routes/habitatFinance";

// Last-line safety net: a single stray async error (an unawaited promise, a
// driver-level throw) must never take the whole API process down — that is what
// surfaces as a 502 Bad Gateway at the edge for EVERY user. Express already
// routes request errors to the error handler; these catch anything that escapes
// it. We log loudly and keep serving; the process manager still restarts the
// process on a genuinely fatal exit.
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection (kept alive):", reason);
});
process.on("uncaughtException", (err) => {
  console.error("Uncaught exception (kept alive):", err);
});

let shuttingDown = false;

async function connectDatabaseWithRetry(databaseUrl: string): Promise<boolean> {
  if (!databaseUrl.trim()) {
    console.error("[startup] DATABASE_URL is missing; database-backed API routes will remain unavailable.");
    return false;
  }

  let attempt = 0;
  while (!shuttingDown) {
    try {
      if (await connectDB(databaseUrl)) {
        console.log("[startup] Database initialization completed.");
        return true;
      }
    } catch (error) {
      console.error("[startup] Database initialization failed:", error);
      // This is a configuration issue, not a transient DB outage. Repeated
      // retries cannot add missing founder credentials to the running process.
      if (error instanceof FounderProvisioningConfigError) return false;
    }

    const delayMs = Math.min(30_000, 2_000 * (2 ** Math.min(attempt, 4)));
    console.warn(`[startup] Database is not ready; retrying in ${Math.round(delayMs / 1000)} seconds.`);
    await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
    attempt += 1;
  }

  return false;
}

async function main() {
  assertRequiredEnvForProduction();

  const env = getEnv();
  const PORT = env.port;
  const HOST = env.host;
  const DATABASE_URL = env.databaseUrl;

  // Bind the HTTP port before slow database/schema initialization. The public
  // SPA can then be served during startup; /health and /api return 503 until
  // connectDB finishes, allowing the deploy health check to wait for readiness.
  const app = createApp();
  const httpServer = createServer(app);
  initSocket(httpServer);

  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => reject(error);
    httpServer.once("error", onError);
    httpServer.listen(PORT, HOST, () => {
      httpServer.off("error", onError);
      console.log(`Truvi HTTP server listening on ${HOST}:${PORT}; database initialization starting.`);
      const waMode = isAiSensyEnabled() ? "AiSensy" : isWhatsAppEnabled() ? "Meta Cloud API" : "disabled";
      console.log(`[whatsapp] provider: ${waMode}`);
      resolve();
    });
  });

  // Install shutdown handlers before the retry loop so deploys/reboots can
  // stop the server even if the database is temporarily unavailable.
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`${signal} received, shutting down gracefully`);
    httpServer.close(async () => {
      await disconnectDB();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  const databaseReady = await connectDatabaseWithRetry(DATABASE_URL);
  if (!databaseReady) {
    console.error("[startup] Database is not ready. The website shell remains online; API routes and /health stay in startup/unavailable mode until the configuration or database issue is fixed.");
    return;
  }

  // Start DB-dependent background work only after the schema and database are ready.
  startLifecycleReminderScheduler();
  startNotificationReminderScheduler();
  startPropertyRequirementBackgroundWorkers();
  startHabitatPayoutScheduler();
}
main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});

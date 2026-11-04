import "./instrument";
import * as Sentry from "@sentry/node";
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

// An uncaught exception or unhandled rejection leaves process state unknown.
// Stop accepting traffic, close active connections, flush monitoring, release
// the DB pool, and exit non-zero so PM2/systemd can restart a clean process.
let shuttingDown = false;
let httpServer: ReturnType<typeof createServer> | null = null;

async function finishShutdown(exitCode: number, reason: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.error(`[shutdown] ${reason}; exiting with code ${exitCode}.`);

  const forceExit = setTimeout(() => {
    console.error("[shutdown] Graceful shutdown timed out; forcing process exit.");
    process.exit(exitCode);
  }, 10_000);

  try {
    if (httpServer?.listening) {
      httpServer.closeIdleConnections?.();
      await new Promise<void>((resolve) => httpServer!.close(() => resolve()));
    }
  } catch (error) {
    console.error("[shutdown] HTTP server close failed:", error);
  }

  try {
    await disconnectDB();
  } catch (error) {
    console.error("[shutdown] Database disconnect failed:", error);
  }

  try {
    await Sentry.flush(2_000);
  } catch {
    // Monitoring must never prevent process termination.
  }

  clearTimeout(forceExit);
  process.exit(exitCode);
}

process.on("unhandledRejection", (reason) => {
  const error = reason instanceof Error ? reason : new Error(String(reason ?? "Unhandled promise rejection"));
  Sentry.captureException(error, { tags: { process_failure: "unhandled_rejection" } });
  void finishShutdown(1, "Unhandled promise rejection");
});

process.on("uncaughtException", (error) => {
  Sentry.captureException(error, { tags: { process_failure: "uncaught_exception" } });
  void finishShutdown(1, "Uncaught exception");
});

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
  httpServer = createServer(app);
  const server = httpServer;
  initSocket(server);

  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => reject(error);
    server.once("error", onError);
    server.listen(PORT, HOST, () => {
      server.off("error", onError);
      console.log(`Truvi HTTP server listening on ${HOST}:${PORT}; database initialization starting.`);
      const waMode = isAiSensyEnabled() ? "AiSensy" : isWhatsAppEnabled() ? "Meta Cloud API" : "disabled";
      console.log(`[whatsapp] provider: ${waMode}`);
      resolve();
    });
  });

  // Deploys and reboots use a graceful zero-exit shutdown; fatal errors use
  // the same drain path but exit non-zero so the process manager restarts us.
  process.on("SIGTERM", () => void finishShutdown(0, "SIGTERM received"));
  process.on("SIGINT", () => void finishShutdown(0, "SIGINT received"));

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
  Sentry.captureException(err, { tags: { process_failure: "startup" } });
  void finishShutdown(1, "Server startup failed");
});

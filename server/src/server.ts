import "dotenv/config";
import { createServer } from "http";
import { createApp } from "./app";
import { connectDB, disconnectDB } from "./config/db";
import { initSocket } from "./sockets";
import { assertRequiredEnvForProduction, getEnv } from "./config/env";

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

async function main() {
  assertRequiredEnvForProduction();

  const env = getEnv();
  const PORT = env.port;
  const HOST = env.host;
  const DATABASE_URL = env.databaseUrl;

  await connectDB(DATABASE_URL);

  const app = createApp();
  const httpServer = createServer(app);
  initSocket(httpServer);

  httpServer.listen(PORT, HOST, () => {
    console.log(`Truvi API listening on ${HOST}:${PORT}`);
  });

  // Most PaaS/VPS process managers send SIGTERM before killing the process on
  // every redeploy/restart — close the HTTP server and DB connection cleanly
  // instead of dropping in-flight requests.
  const shutdown = (signal: string) => {
    console.log(`${signal} received, shutting down gracefully`);
    httpServer.close(async () => {
      await disconnectDB();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});

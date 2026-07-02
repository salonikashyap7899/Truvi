import "dotenv/config";
import { createServer } from "http";
import { createApp } from "./app";
import { connectDB, disconnectDB } from "./config/db";
import { initSocket } from "./sockets";
import { assertRequiredEnvForProduction, getEnv } from "./config/env";

async function main() {
  assertRequiredEnvForProduction();

  const env = getEnv();
  const PORT = env.port;
  const HOST = env.host;
  const MONGO_URI = env.mongoUri || "mongodb://localhost:27017/truvi";

  await connectDB(MONGO_URI);

  const app = createApp();
  const httpServer = createServer(app);
  initSocket(httpServer);

  httpServer.listen(PORT, HOST, () => {
    console.log(`Truvi API listening on ${HOST}:${PORT}`);
  });

  // Render (and most PaaS) send SIGTERM before killing the process on every
  // redeploy/restart — close the HTTP server and DB connection cleanly
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

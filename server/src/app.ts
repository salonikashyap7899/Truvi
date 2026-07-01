import express from "express";
import cors from "cors";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import fs from "fs";
import path from "path";

import authRoutes from "./routes/auth";
import adminRoutes from "./routes/admin";
import projectRoutes from "./routes/projects";
import unitRoutes from "./routes/units";
import leadRoutes from "./routes/leads";
import siteVisitRoutes from "./routes/siteVisits";
import commissionRoutes from "./routes/commissions";
import marketplaceRoutes from "./routes/marketplace";
import premiumRoutes from "./routes/premium";
import uploadRoutes from "./routes/uploads";
import revenueRoutes from "./routes/revenue";
import notificationRoutes from "./routes/notifications";
import leaderboardRoutes from "./routes/leaderboard";

import { errorHandler, notFoundHandler } from "./middleware/errorHandler";

export function createApp() {
  const app = express();
  const uploadsDir = path.resolve(__dirname, "../../uploads");
  const clientDistDir = path.resolve(__dirname, "../../client/dist");

  app.use(cors({ origin: process.env.CLIENT_URL || "http://localhost:5173", credentials: true }));
  app.use(express.json());
  app.use(cookieParser());
  app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

  // Static file serving for uploaded brochures/price lists/site-visit photos.
  app.use("/uploads", express.static(uploadsDir));

  app.get("/health", (_req, res) => res.json({ status: "ok" }));

  app.use("/api/auth", authRoutes);
  app.use("/api/admin", adminRoutes);
  app.use("/api/projects", projectRoutes);
  app.use("/api/units", unitRoutes);
  app.use("/api/leads", leadRoutes);
  app.use("/api/site-visits", siteVisitRoutes);
  app.use("/api/commissions", commissionRoutes);
  app.use("/api/marketplace", marketplaceRoutes);
  app.use("/api/premium", premiumRoutes);
  app.use("/api/uploads", uploadRoutes);
  app.use("/api/revenue", revenueRoutes);
  app.use("/api/notifications", notificationRoutes);
  app.use("/api/leaderboard", leaderboardRoutes);

  if (fs.existsSync(clientDistDir)) {
    app.use(express.static(clientDistDir));
    app.get(/^\/(?!api|uploads|health).*/, (_req, res) => {
      res.sendFile(path.join(clientDistDir, "index.html"));
    });
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

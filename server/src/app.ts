import express from "express";
import cors from "cors";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import fs from "fs";
import path from "path";
import { getEnv } from "./config/env";

import authRoutes from "./routes/auth";
import adminRoutes from "./routes/admin";
import buyerRoutes from "./routes/buyer";
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
import documentRoutes from "./routes/documents";
import investmentRoutes from "./routes/investments";
import loanCheckRoutes from "./routes/loanChecks";
import aiChatRoutes from "./routes/aiChat";
import connectRoutes from "./routes/connect";
import academyRoutes from "./routes/academy";
import inventoryRoutes from "./routes/inventory";
import enquiryRoutes from "./routes/enquiries";
import presentationRoutes from "./routes/presentation";

import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import { getAllowedOrigins } from "./config/origins";

export function createApp() {
  const app = express();
  const env = getEnv();
  const uploadsDir = env.uploadDir
    ? path.resolve(env.uploadDir)
    : path.resolve(__dirname, "../../uploads");
  const clientDistDir = path.resolve(__dirname, "../../client/dist");

  // Render (and most PaaS) terminate TLS at a proxy in front of the app —
  // trust the first hop so req.secure/req.ip and secure cookies work.
  app.set("trust proxy", 1);

  app.use(cors({ origin: getAllowedOrigins(), credentials: true }));
  app.use(express.json());
  app.use(cookieParser());
  app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

  // Static file serving for uploaded brochures/price lists/site-visit photos.
  app.use("/uploads", express.static(uploadsDir));

  app.get("/health", (_req, res) => res.json({ status: "ok" }));

  app.use("/api/auth", authRoutes);
  app.use("/api/admin", adminRoutes);
  app.use("/api/buyer", buyerRoutes);
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
  app.use("/api/documents", documentRoutes);
  app.use("/api/investments", investmentRoutes);
  app.use("/api/loan-checks", loanCheckRoutes);
  app.use("/api/ai/chat", aiChatRoutes);
  app.use("/api/connect", connectRoutes);
  app.use("/api/academy", academyRoutes);
  app.use("/api/inventory", inventoryRoutes);
  app.use("/api/enquiries", enquiryRoutes);
  app.use("/api/presentation", presentationRoutes);

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

import express from "express";
import { getDb } from "./config/db";
import { buyerDocuments } from "./db/schema";

// Cache the exact filenames that legacy buyer-document rows still reference.
// New uploads use private storage; this avoids a database scan on every public
// image request while ensuring old identity documents are not served publicly.
let legacyBuyerUploadNamesPromise: Promise<Set<string>> | undefined;

function legacyBuyerUploadName(storedUrl: string): string | null {
  try {
    const pathname = storedUrl.startsWith("http") ? new URL(storedUrl).pathname : storedUrl;
    const marker = "/uploads/";
    const at = pathname.indexOf(marker);
    if (at < 0) return null;
    const name = path.basename(decodeURIComponent(pathname.slice(at + marker.length)));
    return name && name !== "." && name !== ".." ? name : null;
  } catch {
    return null;
  }
}

function getLegacyBuyerUploadNames(): Promise<Set<string>> {
  if (!legacyBuyerUploadNamesPromise) {
    legacyBuyerUploadNamesPromise = getDb()
      .select({ fileUrl: buyerDocuments.fileUrl })
      .from(buyerDocuments)
      .then((rows) => new Set(rows.map((row) => legacyBuyerUploadName(row.fileUrl)).filter((name): name is string => Boolean(name))))
      .catch((error) => {
        legacyBuyerUploadNamesPromise = undefined;
        throw error;
      });
  }
  return legacyBuyerUploadNamesPromise;
}
import cors from "cors";
import compression from "compression";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import fs from "fs";
import path from "path";
import { getEnv } from "./config/env";

import authRoutes from "./routes/auth";
import adminRoutes from "./routes/admin";
import buyerRoutes from "./routes/buyer";
import requirementRoutes from "./routes/requirements";
import projectRoutes from "./routes/projects";
import unitRoutes from "./routes/units";
import leadRoutes from "./routes/leads";
import leadManagementRoutes from "./routes/leadManagement";
import offerRoutes from "./routes/offers";
import meetingRoutes from "./routes/meetings";
import siteVisitRoutes from "./routes/siteVisits";
import commissionRoutes from "./routes/commissions";
import marketplaceRoutes from "./routes/marketplace";
import premiumRoutes from "./routes/premium";
import marketingRoutes, { adminRouter as marketingAdminRoutes } from "./routes/marketing";
import crmRoutes from "./routes/crm";
import developerRoutes from "./routes/developer";
import uploadRoutes from "./routes/uploads";
import revenueRoutes from "./routes/revenue";
import notificationRoutes from "./routes/notifications";
import leaderboardRoutes from "./routes/leaderboard";
import documentRoutes, { buyerDocFileHandler } from "./routes/documents";
import { PRIVATE_UPLOAD_DIR } from "./services/privateFiles";
import investmentRoutes from "./routes/investments";
import loanCheckRoutes from "./routes/loanChecks";
import aiChatRoutes from "./routes/aiChat";
import connectRoutes from "./routes/connect";
import onboardingRoutes from "./routes/onboarding";
import academyRoutes from "./routes/academy";
import publicRoutes from "./routes/public";
import vaultRoutes from "./routes/vault";
import founderModuleRoutes from "./routes/founderModules";
import commandFinanceRoutes from "./routes/commandFinance";
import employerRoutes from "./routes/employers";
import employeeRoutes from "./routes/employees";
import inventoryRoutes from "./routes/inventory";
import enquiryRoutes from "./routes/enquiries";
import investRoutes from "./routes/invest";
import ambassadorKnowledgeRoutes from "./routes/ambassadorKnowledge";
import presentationRoutes from "./routes/presentation";
import brochureRoutes from "./routes/brochure";
import callRoutes from "./routes/calls";
import voucherRoutes from "./routes/vouchers";
import commentRoutes from "./routes/comments";
import ambassadorTaskRoutes from "./routes/ambassadorTasks";
import ambassadorOperatingSystemRoutes from "./routes/ambassadorOperatingSystem";
import legalRoutes from "./routes/legal";
import paymentRoutes, { razorpayWebhookHandler } from "./routes/payments";
import { resendWebhookHandler } from "./routes/resendWebhook";
import financeRoutes from "./routes/finance";
import verificationRoutes from "./routes/verification";
import ingestRoutes from "./routes/ingest";
import verificationAdminRoutes from "./routes/verificationAdmin";
import askRoutes from "./routes/ask";
import habitatRoutes from "./routes/habitat";
import habitatFinanceRoutes, { habitatRazorpayWebhook } from "./routes/habitatFinance";
import { securityHeaders, setUploadHeaders } from "./middleware/security";
import { requestIdMiddleware } from "./middleware/requestId";
import clientTelemetryRoutes from "./routes/clientTelemetry";

import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import { getAllowedOrigins } from "./config/origins";
import { redactUrlForLogs } from "./lib/redactUrlForLogs";
import { protectUnverifiedLegalFiles } from "./services/protectedLegalFiles";

// Redact short-lived signed links and webhook credentials before access logging.
morgan.token("safe-url", (req) => {
  const request = req as import("express").Request;
  return redactUrlForLogs(request.originalUrl || request.url);
});
morgan.token("safe-referrer", (req) => redactUrlForLogs((req as import("express").Request).get("referer")));

export function createApp() {
  const app = express();
  const env = getEnv();
  const uploadsDir = env.uploadDir
    ? path.resolve(env.uploadDir)
    : path.resolve(__dirname, "../../uploads");
  const clientDistDir = path.resolve(__dirname, "../../client/dist");

  // Private documents must never sit inside a statically served directory, or
  // /uploads (or the SPA host) would hand them out publicly. Fail closed on
  // that misconfiguration (e.g. UPLOAD_DIR pointed at a parent folder).
  for (const servedDir of [uploadsDir, clientDistDir]) {
    if (PRIVATE_UPLOAD_DIR === servedDir || PRIVATE_UPLOAD_DIR.startsWith(servedDir + path.sep)) {
      throw new Error(
        `Refusing to start: PRIVATE_UPLOAD_DIR (${PRIVATE_UPLOAD_DIR}) is inside a publicly served directory (${servedDir}). Move it outside.`,
      );
    }
  }

  // Render (and most PaaS) terminate TLS at a proxy in front of the app —
  // trust the first hop so req.secure/req.ip and secure cookies work.
  app.set("trust proxy", 1);

  // Attach a correlation ID before any middleware can reject a request. This
  // lets support correlate a browser error with server logs without collecting
  // identity-document contents or other KYC personal data.
  app.use(requestIdMiddleware);
  app.use(securityHeaders);

  // Gzip/brotli-style compression for every response (JSON API payloads, the
  // HTML shell, and any uncached static file). Cuts typical response sizes by
  // ~70–80%, so the app and website paint faster — especially on mobile data.
  // Clients that don't send Accept-Encoding simply receive the response
  // uncompressed, so this is fully backward-compatible.
  app.use(compression());

  app.use(cors({
    origin: getAllowedOrigins(),
    credentials: true,
    exposedHeaders: ["X-Request-ID"],
  }));

  // Razorpay webhook must see the RAW request body to verify the signature, so
  // it is mounted with express.raw BEFORE the global JSON parser.
  app.post("/api/payments/webhook", express.raw({ type: "*/*" }), razorpayWebhookHandler);
  app.post("/api/habitat/webhook", express.raw({ type: "*/*" }), habitatRazorpayWebhook);
  app.post("/api/webhooks/resend", express.raw({ type: "application/json", limit: "256kb" }), resendWebhookHandler);

  // Private buyer documents are opened through short-lived signed links (a
  // plain link can't carry a Bearer token). Registered before every /api
  // router because several of them apply `authenticate` to all requests that
  // reach them; the signed link itself is the authorization here.
  app.get("/api/documents/file/:id", buyerDocFileHandler);

  app.use(express.json());
  app.use(cookieParser());
  app.use("/api/telemetry", clientTelemetryRoutes);
  const requestLogFormat = process.env.NODE_ENV === "production"
    ? ':remote-addr - :remote-user [:date[clf]] ":method :safe-url HTTP/:http-version" :status :res[content-length] ":safe-referrer" ":user-agent"'
    : ':method :safe-url :status :response-time ms';
  app.use(morgan(requestLogFormat));

  // Static file serving for uploaded brochures/price lists/site-visit photos.
  // Uploaded files are content-stable (a new upload gets a new filename), so we
  // let browsers and any CDN (Cloudflare) cache them for a year instead of
  // re-downloading every image on every screen. This is the single biggest win
  // for perceived app speed on repeat views. `immutable` tells the browser it
  // never needs to revalidate a cached file within that window.
  // Identity documents must never be publicly reachable. The legacy Aadhaar
  // upload route that wrote into /uploads/aadhaar has been removed; this also
  // stops any files it left behind from being served (or cached by a CDN).
  app.use("/uploads/aadhaar", (_req, res) => {
    res.status(404).end();
  });

  // Pending legal uploads are not public. This check preserves their files in
  // place and requires an authenticated API-issued signed URL until verified.
  app.use("/uploads", protectUnverifiedLegalFiles);

  // Defense in depth during migration: if a public upload URL is still
  // referenced by a buyerDocuments record, do not serve it from /uploads.
  // The migration script can still read the file directly from disk.
  app.use("/uploads", async (req, res, next) => {
    const filename = path.basename(req.path);
    if (!filename || filename === "." || filename === "..") return next();
    try {
      const legacyNames = await getLegacyBuyerUploadNames();
      if (legacyNames.has(filename)) return res.status(404).end();
      return next();
    } catch (error) {
      // Fail closed if the server cannot confirm that the file is public.
      return next(error);
    }
  });

  app.use(
    "/uploads",
    express.static(uploadsDir, {
      maxAge: "365d",
      immutable: true,
      setHeaders: (res, filePath) => {
        const response = res as import("express").Response;
        const isPendingLegalFile = Boolean(response.locals?.truviProtectedLegalFile);
        const isVerifiedLegalFile = Boolean(response.locals?.truviVerifiedLegalFile);
        if (isPendingLegalFile) {
          // The signature is a temporary capability. Never persist it in a
          // browser or intermediate proxy cache.
          res.setHeader("Cache-Control", "private, no-store");
          res.setHeader("CDN-Cache-Control", "no-store");
          res.setHeader("Surrogate-Control", "no-store");
        } else if (isVerifiedLegalFile || filePath.includes(path.sep + "legal" + path.sep)) {
          // Verified legal documents can still be opened publicly, but are not
          // immutable-cache objects because admins may revoke verification.
          res.setHeader("Cache-Control", "public, max-age=300");
        } else {
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        }
        setUploadHeaders(res, filePath);
      },
    }),
  );

  app.get("/health", (_req, res) => res.json({ status: "ok" }));

  app.use("/api/auth", authRoutes);
  // Brochure routes are mounted at /api and define their own /admin/... and
  // /projects/... paths — registered before the generic admin/project routers
  // so those specific brochure endpoints win.
  app.use("/api", brochureRoutes);
  app.use("/api", callRoutes);
  app.use("/api", voucherRoutes);
  app.use("/api/admin", adminRoutes);
  app.use("/api/buyer", buyerRoutes);
  app.use("/api/requirements", requirementRoutes);
  app.use("/api/projects", projectRoutes);
  app.use("/api/units", unitRoutes);
  app.use("/api/leads", leadManagementRoutes); // /from-inventory, /mine, /admin/* (before /:id)
  app.use("/api/leads", leadRoutes);
  app.use("/api/offers", offerRoutes);
  app.use("/api/meetings", meetingRoutes);
  app.use("/api/site-visits", siteVisitRoutes);
  app.use("/api/commissions", commissionRoutes);
  app.use("/api/marketplace", marketplaceRoutes);
  app.use("/api/premium", premiumRoutes);
  app.use("/api/crm", crmRoutes);
  app.use("/api/developer", developerRoutes);
  app.use("/api/uploads", uploadRoutes);
  app.use("/api/revenue", revenueRoutes);
  app.use("/api/notifications", notificationRoutes);
  app.use("/api/leaderboard", leaderboardRoutes);
  app.use("/api/documents", documentRoutes);
  app.use("/api/investments", investmentRoutes);
  app.use("/api/loan-checks", loanCheckRoutes);
  app.use("/api/ai/chat", aiChatRoutes);
  app.use("/api/connect", connectRoutes);
  app.use("/api/onboarding", onboardingRoutes);
  app.use("/api/academy", academyRoutes);
  app.use("/api/public", publicRoutes);
  app.use("/api/vault", vaultRoutes);
  app.use("/api/founder", founderModuleRoutes);
  app.use("/api/command-finance", commandFinanceRoutes);
  app.use("/api/employers", employerRoutes);
  app.use("/api/employees", employeeRoutes);
  app.use("/api/inventory", inventoryRoutes);
  app.use("/api/enquiries", enquiryRoutes);
  app.use("/api/invest", investRoutes);
  app.use("/api/ambassador-knowledge", ambassadorKnowledgeRoutes);
  app.use("/api/presentation", presentationRoutes);
  app.use("/api/comments", commentRoutes);
  app.use("/api/ambassador-tasks", ambassadorTaskRoutes);
  app.use("/api/ambassador-os", ambassadorOperatingSystemRoutes);
  app.use("/api/legal", legalRoutes);
  app.use("/api/payments", paymentRoutes);
  app.use("/api/finance", financeRoutes);
  app.use("/api/marketing", marketingRoutes);
  app.use("/api/admin/marketing", marketingAdminRoutes);
  app.use("/api", verificationRoutes); // /api/verify/:id, /api/verification/:id, /api/property/:id
  app.use("/api/ingest", ingestRoutes);
  app.use("/api/admin", verificationAdminRoutes); // /checks, /fraud-rules, /prompts, /thresholds, /audit-logs
  app.use("/api", askRoutes); // /api/ask, /api/chat/:sessionId
  app.use("/api/habitat", habitatRoutes);
  app.use("/api/habitat", habitatFinanceRoutes);

  if (fs.existsSync(clientDistDir)) {
    // Content-hashed build assets never change for a given URL → cache hard.
    app.use(
      "/assets",
      express.static(path.join(clientDistDir, "assets"), { immutable: true, maxAge: "365d" }),
    );
    // index.html (and other root files) must NOT be cached, or a phone keeps a
    // stale index that points at chunk files a new deploy has replaced — which
    // surfaces as "Unable to preload CSS / failed to load chunk". Revalidating
    // index.html means every load gets the current chunk names.
    app.use(
      express.static(clientDistDir, {
        setHeaders: (res, filePath) => {
          if (filePath.endsWith("index.html")) res.setHeader("Cache-Control", "no-cache");
        },
      }),
    );
    // Keep SPA navigation fallback away from missing API and file requests.
    // A missing hashed JS/CSS file must be a 404, never index.html with status 200.
    app.get(/^\/(?!(?:api|uploads|health|assets)(?:\/|$)|.*\.[^/]+$).*/, (_req, res) => {
      res.setHeader("Cache-Control", "no-cache");
      res.sendFile(path.join(clientDistDir, "index.html"));
    });
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

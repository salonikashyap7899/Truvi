import { Router } from "express";
import multer from "multer";
import Papa from "papaparse";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { getDb } from "../config/db";
import { projects } from "../db/schema";
import { CATEGORY_TABLES, DATA_CATEGORIES, projectDataUploads } from "../db/verificationSchema";
import { isValidId } from "../lib/ids";
import { authenticate, requireRole, AuthedRequest } from "../middleware/auth";
import { ingestLimiter } from "../middleware/security";
import { logAudit } from "../services/audit";
import { runVerification } from "../services/verification/engine";
import { runFraudDetection } from "../services/fraud/detector";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });
const router = Router();
router.use(authenticate);

// Base columns the category tables understand; everything else → raw_data.
const KNOWN = new Set(["project_id", "projectid", "data_key", "datakey", "label", "source_type", "sourcetype", "source_date", "sourcedate", "verified", "lat", "lng", "latitude", "longitude"]);

interface ParsedRow {
  [k: string]: unknown;
}

/** Turn an uploaded file (CSV / JSON / GeoJSON) into plain row objects. */
function parseUpload(buf: Buffer, name: string): ParsedRow[] {
  const lower = name.toLowerCase();
  if (lower.endsWith(".csv")) {
    const out = Papa.parse<ParsedRow>(buf.toString("utf8"), { header: true, skipEmptyLines: true });
    return out.data;
  }
  const json = JSON.parse(buf.toString("utf8"));
  // GeoJSON FeatureCollection → flatten properties + geometry
  if (json && json.type === "FeatureCollection" && Array.isArray(json.features)) {
    return json.features.map((f: any) => ({ ...(f.properties ?? {}), geometry: f.geometry }));
  }
  if (Array.isArray(json)) return json;
  return [json];
}

function num(v: unknown): number | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * POST /api/ingest/:category — bulk-load a data category from CSV/JSON/GeoJSON.
 * Rows are upserted by (project_id, data_key); unknown columns are preserved in
 * raw_data, so admins can add fields without a code change. Per-row errors are
 * collected, not fatal. After a successful load, re-verification is queued for
 * each affected project.
 */
// Project options for the Admin / Verifier data-ingestion and archive screens.
router.get("/projects", requireRole("ADMIN", "VERIFIER"), async (_req: AuthedRequest, res) => {
  const db = getDb();
  const rows = await db
    .select({ _id: projects._id, name: projects.name, city: projects.city })
    .from(projects)
    .orderBy(asc(projects.name));
  res.json({ projects: rows });
});

// List archived source JSON/GeoJSON uploads without returning large payloads.
router.get("/uploads", requireRole("ADMIN", "VERIFIER"), async (req: AuthedRequest, res) => {
  const db = getDb();
  const conditions: any[] = [];
  const projectId = typeof req.query.projectId === "string" ? req.query.projectId.trim() : "";
  const category = typeof req.query.category === "string" ? req.query.category.trim() : "";

  if (projectId) {
    if (!isValidId(projectId)) return res.status(400).json({ error: "Invalid projectId" });
    conditions.push(sql`(
      ${projectDataUploads.projectId} = ${projectId}::uuid
      OR ${projectDataUploads.projectIds} @> ${JSON.stringify([projectId])}::jsonb
    )`);
  }
  if (category) {
    if (!(DATA_CATEGORIES as readonly string[]).includes(category)) {
      return res.status(400).json({ error: "Unknown data category" });
    }
    conditions.push(eq(projectDataUploads.category, category));
  }

  const rows = await db
    .select({
      _id: projectDataUploads._id,
      projectId: projectDataUploads.projectId,
      projectIds: projectDataUploads.projectIds,
      category: projectDataUploads.category,
      fileName: projectDataUploads.fileName,
      mimeType: projectDataUploads.mimeType,
      fileSizeBytes: projectDataUploads.fileSizeBytes,
      rowCount: projectDataUploads.rowCount,
      successCount: projectDataUploads.successCount,
      failedCount: projectDataUploads.failedCount,
      uploadedById: projectDataUploads.uploadedById,
      uploaderName: users.name,
      createdAt: projectDataUploads.createdAt,
    })
    .from(projectDataUploads)
    .leftJoin(users, eq(projectDataUploads.uploadedById, users._id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(projectDataUploads.createdAt))
    .limit(200);

  res.json({ uploads: rows });
});

// Download one archived source payload. Access is limited to Admin / Verifier.
router.get("/uploads/:id/download", requireRole("ADMIN", "VERIFIER"), async (req: AuthedRequest, res) => {
  if (!isValidId(req.params.id)) return res.status(404).json({ error: "Upload not found" });
  const db = getDb();
  const [row] = await db
    .select({
      fileName: projectDataUploads.fileName,
      mimeType: projectDataUploads.mimeType,
      sourcePayload: projectDataUploads.sourcePayload,
    })
    .from(projectDataUploads)
    .where(eq(projectDataUploads._id, req.params.id))
    .limit(1);
  if (!row) return res.status(404).json({ error: "Upload not found" });

  const safeName = row.fileName.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^\.+/, "") || "project-data.json";
  const downloadName = /\.(json|geojson)$/i.test(safeName)
    ? safeName
    : safeName.replace(/\.[^.]+$/, "") + ".json";
  const contentType = downloadName.toLowerCase().endsWith(".geojson")
    ? "application/geo+json; charset=utf-8"
    : "application/json; charset=utf-8";
  res.setHeader("Content-Type", contentType);
  res.setHeader("Content-Disposition", `attachment; filename="${downloadName}"`);
  res.setHeader("Cache-Control", "private, no-store");
  res.send(JSON.stringify(row.sourcePayload, null, 2));
});

router.post("/:category", ingestLimiter, requireRole("ADMIN", "VERIFIER"), upload.single("file"), async (req: AuthedRequest, res) => {
  const category = req.params.category as keyof typeof CATEGORY_TABLES;
  const table = CATEGORY_TABLES[category];
  if (!table) return res.status(400).json({ error: `Unknown category "${req.params.category}"` });
  if (!req.file) return res.status(400).json({ error: "No file uploaded (field name: file)" });

  let rows: ParsedRow[];
  try {
    rows = parseUpload(req.file.buffer, req.file.originalname);
  } catch (err) {
    return res.status(400).json({ error: `Could not parse file: ${err instanceof Error ? err.message : String(err)}` });
  }

  const db = getDb();
  const errors: { row: number; error: string }[] = [];
  const affected = new Set<string>();
  let successCount = 0;

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    try {
      const projectId = String(r.project_id ?? r.projectId ?? "").trim();
      const dataKey = String(r.data_key ?? r.dataKey ?? "").trim();
      if (!isValidId(projectId)) throw new Error("missing/invalid project_id");
      if (!dataKey) throw new Error("missing data_key");

      // Only accept rows for a project that exists.
      const [proj] = await db.select({ _id: projects._id }).from(projects).where(eq(projects._id, projectId));
      if (!proj) throw new Error(`project_id ${projectId} not found`);

      const rawData: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(r)) {
        if (!KNOWN.has(k.toLowerCase())) rawData[k] = v;
      }

      const sourceDateRaw = r.source_date ?? r.sourceDate;
      const values: Record<string, unknown> = {
        projectId,
        dataKey,
        label: String(r.label ?? dataKey),
        sourceType: r.source_type ?? r.sourceType ?? null,
        sourceDate: sourceDateRaw ? new Date(String(sourceDateRaw)) : null,
        verified: String(r.verified ?? "").toLowerCase() === "true",
        lat: num(r.lat ?? r.latitude),
        lng: num(r.lng ?? r.longitude),
        rawData,
      };

      await db
        .insert(table as any)
        .values(values as any)
        .onConflictDoUpdate({
          target: [(table as any).projectId, (table as any).dataKey],
          set: {
            label: values.label,
            sourceType: values.sourceType,
            sourceDate: values.sourceDate,
            verified: values.verified,
            lat: values.lat,
            lng: values.lng,
            rawData,
            updatedAt: new Date(),
          },
        });

      affected.add(projectId);
      successCount++;
    } catch (err) {
      errors.push({ row: i + 1, error: err instanceof Error ? err.message : String(err) });
    }
  }

  await logAudit({
    userId: req.user!.userId,
    action: "ingest",
    resourceType: "category",
    resourceId: String(req.params.category),
    metadata: { successCount, failCount: errors.length, affected: affected.size },
  });

  // Queue re-verification for each affected project (fire-and-forget; RAG
  // embeddings are wired in a later phase).
  for (const pid of affected) {
    void runVerification(pid).catch(() => {});
    void runFraudDetection(pid).catch(() => {});
  }

  // Archive the original JSON/GeoJSON payload after at least one row is ingested.
  // CSV ingestion remains unchanged and does not create a JSON archive record.
  const archiveApplicable = /\.(json|geojson)$/i.test(req.file.originalname);
  let archiveSaved = false;
  let archiveWarning: string | null = null;
  if (successCount > 0 && archiveApplicable) {
    try {
      const sourcePayload = JSON.parse(req.file.buffer.toString("utf8"));
      const projectIds = [...affected];
      await db.insert(projectDataUploads).values({
        projectId: projectIds.length === 1 ? projectIds[0] : null,
        projectIds,
        category,
        fileName: req.file.originalname,
        mimeType: req.file.mimetype || "application/json",
        fileSizeBytes: req.file.size,
        rowCount: rows.length,
        successCount,
        failedCount: errors.length,
        sourcePayload,
        uploadedById: req.user!.userId,
      });
      archiveSaved = true;
    } catch (archiveError) {
      archiveWarning = "Data was ingested, but the original JSON snapshot could not be archived.";
      console.error("[ingest] Failed to archive source JSON upload:", archiveError);
    }
  }

  res.status(errors.length && !successCount ? 422 : 200).json({
    successCount,
    failCount: errors.length,
    errors,
    archiveApplicable,
    archiveSaved,
    archiveWarning,
  });
});

export default router;

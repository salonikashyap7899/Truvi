import { Router } from "express";
import multer from "multer";
import Papa from "papaparse";
import { eq } from "drizzle-orm";
import { getDb } from "../config/db";
import { projects } from "../db/schema";
import { CATEGORY_TABLES } from "../db/verificationSchema";
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

  res.status(errors.length && !successCount ? 422 : 200).json({ successCount, failCount: errors.length, errors });
});

export default router;

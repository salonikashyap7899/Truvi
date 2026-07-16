import { Router } from "express";
import { z } from "zod";
import { and, desc, eq, ne } from "drizzle-orm";
import { getDb } from "../config/db";
import {
  verificationChecks,
  fraudRules,
  aiPrompts,
  scoreThresholds,
  auditLogs,
  DATA_CATEGORIES,
} from "../db/verificationSchema";
import { isValidId } from "../lib/ids";
import { authenticate, requireRole, AuthedRequest } from "../middleware/auth";
import { adminLimiter } from "../middleware/security";
import { logAudit } from "../services/audit";

const router = Router();
router.use(authenticate, adminLimiter, requireRole("ADMIN"));

const audit = (req: AuthedRequest, action: string, resourceType: string, resourceId?: string, metadata?: Record<string, unknown>) =>
  logAudit({ userId: req.user!.userId, action, resourceType, resourceId, metadata });

// ── Verification checks ─────────────────────────────────────────────────────
const checkSchema = z.object({
  name: z.string().min(2),
  category: z.enum(DATA_CATEGORIES as unknown as [string, ...string[]]),
  weight: z.number().int().min(0).max(100),
  enabled: z.boolean().optional(),
  logicType: z.enum(["exists", "compare", "range", "absence", "sql"]).optional(),
  sqlQuery: z.string().min(10),
  thresholdConfig: z.record(z.string(), z.unknown()).optional(),
  description: z.string().optional(),
});

router.get("/checks", async (_req, res) => {
  res.json({ checks: await getDb().select().from(verificationChecks).orderBy(desc(verificationChecks.createdAt)) });
});

router.post("/checks", async (req: AuthedRequest, res) => {
  const p = checkSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Validation failed", issues: p.error.flatten() });
  const [row] = await getDb().insert(verificationChecks).values(p.data as any).returning();
  await audit(req, "check.create", "verification_check", row._id, { name: row.name });
  res.status(201).json({ check: row });
});

router.put("/checks/:id", async (req: AuthedRequest, res) => {
  if (!isValidId(req.params.id)) return res.status(404).json({ error: "Not found" });
  const p = checkSchema.partial().safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Validation failed", issues: p.error.flatten() });
  const [row] = await getDb().update(verificationChecks).set(p.data as any).where(eq(verificationChecks._id, req.params.id)).returning();
  if (!row) return res.status(404).json({ error: "Not found" });
  await audit(req, "check.update", "verification_check", row._id);
  res.json({ check: row });
});

router.delete("/checks/:id", async (req: AuthedRequest, res) => {
  if (!isValidId(req.params.id)) return res.status(404).json({ error: "Not found" });
  await getDb().delete(verificationChecks).where(eq(verificationChecks._id, req.params.id));
  await audit(req, "check.delete", "verification_check", req.params.id);
  res.json({ ok: true });
});

// ── Fraud rules ─────────────────────────────────────────────────────────────
const ruleSchema = z.object({
  name: z.string().min(2),
  enabled: z.boolean().optional(),
  sqlQuery: z.string().min(10),
  severity: z.enum(["low", "medium", "high"]).optional(),
  description: z.string().optional(),
});

router.get("/fraud-rules", async (_req, res) => {
  res.json({ rules: await getDb().select().from(fraudRules).orderBy(desc(fraudRules.createdAt)) });
});

router.post("/fraud-rules", async (req: AuthedRequest, res) => {
  const p = ruleSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Validation failed", issues: p.error.flatten() });
  const [row] = await getDb().insert(fraudRules).values(p.data as any).returning();
  await audit(req, "fraud_rule.create", "fraud_rule", row._id, { name: row.name });
  res.status(201).json({ rule: row });
});

router.put("/fraud-rules/:id", async (req: AuthedRequest, res) => {
  if (!isValidId(req.params.id)) return res.status(404).json({ error: "Not found" });
  const p = ruleSchema.partial().safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Validation failed", issues: p.error.flatten() });
  const [row] = await getDb().update(fraudRules).set(p.data as any).where(eq(fraudRules._id, req.params.id)).returning();
  if (!row) return res.status(404).json({ error: "Not found" });
  await audit(req, "fraud_rule.update", "fraud_rule", row._id);
  res.json({ rule: row });
});

router.delete("/fraud-rules/:id", async (req: AuthedRequest, res) => {
  if (!isValidId(req.params.id)) return res.status(404).json({ error: "Not found" });
  await getDb().delete(fraudRules).where(eq(fraudRules._id, req.params.id));
  await audit(req, "fraud_rule.delete", "fraud_rule", req.params.id);
  res.json({ ok: true });
});

// ── AI prompts (only one active at a time) ──────────────────────────────────
const promptSchema = z.object({
  name: z.string().min(2),
  systemPrompt: z.string().min(20),
  active: z.boolean().optional(),
  version: z.number().int().min(1).optional(),
});

router.get("/prompts", async (_req, res) => {
  res.json({ prompts: await getDb().select().from(aiPrompts).orderBy(desc(aiPrompts.createdAt)) });
});

router.post("/prompts", async (req: AuthedRequest, res) => {
  const p = promptSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Validation failed", issues: p.error.flatten() });
  const db = getDb();
  const [row] = await db.insert(aiPrompts).values(p.data as any).returning();
  if (row.active) await db.update(aiPrompts).set({ active: false }).where(ne(aiPrompts._id, row._id));
  await audit(req, "prompt.create", "ai_prompt", row._id, { name: row.name, active: row.active });
  res.status(201).json({ prompt: row });
});

router.put("/prompts/:id", async (req: AuthedRequest, res) => {
  if (!isValidId(req.params.id)) return res.status(404).json({ error: "Not found" });
  const p = promptSchema.partial().safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Validation failed", issues: p.error.flatten() });
  const db = getDb();
  const [row] = await db.update(aiPrompts).set(p.data as any).where(eq(aiPrompts._id, req.params.id)).returning();
  if (!row) return res.status(404).json({ error: "Not found" });
  if (p.data.active) await db.update(aiPrompts).set({ active: false }).where(ne(aiPrompts._id, row._id));
  await audit(req, "prompt.update", "ai_prompt", row._id);
  res.json({ prompt: row });
});

router.delete("/prompts/:id", async (req: AuthedRequest, res) => {
  if (!isValidId(req.params.id)) return res.status(404).json({ error: "Not found" });
  await getDb().delete(aiPrompts).where(eq(aiPrompts._id, req.params.id));
  await audit(req, "prompt.delete", "ai_prompt", req.params.id);
  res.json({ ok: true });
});

// ── Score thresholds (single row) ───────────────────────────────────────────
const thresholdSchema = z.object({
  verifiedMin: z.number().int().min(0).max(100),
  pendingMin: z.number().int().min(0).max(100),
});

router.put("/thresholds", async (req: AuthedRequest, res) => {
  const p = thresholdSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Validation failed", issues: p.error.flatten() });
  if (p.data.pendingMin > p.data.verifiedMin) return res.status(400).json({ error: "pendingMin must be ≤ verifiedMin" });
  const db = getDb();
  const [existing] = await db.select().from(scoreThresholds).limit(1);
  const [row] = existing
    ? await db.update(scoreThresholds).set(p.data).where(eq(scoreThresholds._id, existing._id)).returning()
    : await db.insert(scoreThresholds).values(p.data).returning();
  await audit(req, "thresholds.update", "score_thresholds", row._id, p.data);
  res.json({ thresholds: row });
});

// ── Audit log viewer ────────────────────────────────────────────────────────
router.get("/audit-logs", async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  const rows = await getDb().select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(limit);
  res.json({ logs: rows });
});

export default router;

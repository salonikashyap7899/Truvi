import { Router } from "express";
import { z } from "zod";
import { asc, eq } from "drizzle-orm";
import { getDb } from "../config/db";
import { ambassadorKnowledgeTopics, ambassadorKnowledgeMaterials, ambassadorKnowledgeConfig } from "../db/schema";
import { isValidId } from "../lib/ids";
import { authenticate, requireRole, AuthedRequest } from "../middleware/auth";
import { uploadMedia, fileUrl } from "../services/uploadService";
import { logAudit } from "../services/audit";

const router = Router();
router.use(authenticate);

const DEFAULT_TOPICS = [
  { title: "What is Truvi?", description: "An introduction to Truvi and what we do." },
  { title: "How to Get Leads", description: "Find and generate quality leads for Truvi." },
  { title: "How to Get a Developer / Channel Partner", description: "Onboard developers and channel partners." },
  { title: "How to Onboard on Truvi", description: "Step-by-step onboarding on the Truvi platform." },
];
const DEFAULT_HELP_CONTACT = "7054280101";

async function getOrSeed(db: ReturnType<typeof getDb>) {
  const topics = await db.select().from(ambassadorKnowledgeTopics).orderBy(asc(ambassadorKnowledgeTopics.sortOrder), asc(ambassadorKnowledgeTopics.createdAt));
  if (topics.length === 0) {
    await db.insert(ambassadorKnowledgeTopics).values(DEFAULT_TOPICS.map((t, i) => ({ ...t, sortOrder: i })));
    return db.select().from(ambassadorKnowledgeTopics).orderBy(asc(ambassadorKnowledgeTopics.sortOrder), asc(ambassadorKnowledgeTopics.createdAt));
  }
  return topics;
}

async function getConfig(db: ReturnType<typeof getDb>) {
  const [cfg] = await db.select().from(ambassadorKnowledgeConfig).limit(1);
  if (cfg) return cfg;
  const [created] = await db.insert(ambassadorKnowledgeConfig).values({ helpContact: DEFAULT_HELP_CONTACT, helpText: "In case you want to know how to do it, contact us." }).returning();
  return created;
}

// GET /api/ambassador-knowledge — the full hub (Ambassadors + Admin).
router.get("/", requireRole("AMBASSADOR", "ADMIN"), async (_req, res) => {
  const db = getDb();
  const topics = await getOrSeed(db);
  const materials = await db.select().from(ambassadorKnowledgeMaterials).orderBy(asc(ambassadorKnowledgeMaterials.sortOrder), asc(ambassadorKnowledgeMaterials.createdAt));
  const cfg = await getConfig(db);
  const byTopic = new Map<string, typeof materials>();
  for (const m of materials) {
    const k = String(m.topicId);
    if (!byTopic.has(k)) byTopic.set(k, []);
    byTopic.get(k)!.push(m);
  }
  res.json({
    topics: topics.map((t) => ({ ...t, materials: byTopic.get(String(t._id)) ?? [] })),
    help: { contact: cfg.helpContact, text: cfg.helpText },
  });
});

// ── Admin management ────────────────────────────────────────────────────────
const topicSchema = z.object({ title: z.string().min(1).max(160), description: z.string().max(1000).optional().nullable(), sortOrder: z.coerce.number().int().optional() });

router.post("/admin/topics", requireRole("ADMIN"), async (req: AuthedRequest, res) => {
  const parsed = topicSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Validation failed", issues: parsed.error.flatten() });
  const db = getDb();
  const [row] = await db.insert(ambassadorKnowledgeTopics).values({ title: parsed.data.title, description: parsed.data.description ?? null, sortOrder: parsed.data.sortOrder ?? 0 }).returning();
  await logAudit({ userId: req.user!.userId, action: "ambassador.knowledge.topic.create", resourceType: "ambassador_knowledge_topic", resourceId: String(row._id) });
  res.status(201).json({ topic: row });
});

router.patch("/admin/topics/:id", requireRole("ADMIN"), async (req: AuthedRequest, res) => {
  if (!isValidId(req.params.id)) return res.status(404).json({ error: "Topic not found" });
  const parsed = topicSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Validation failed" });
  const db = getDb();
  const [row] = await db.update(ambassadorKnowledgeTopics).set({ ...parsed.data, updatedAt: new Date() }).where(eq(ambassadorKnowledgeTopics._id, req.params.id)).returning();
  if (!row) return res.status(404).json({ error: "Topic not found" });
  res.json({ topic: row });
});

router.delete("/admin/topics/:id", requireRole("ADMIN"), async (req: AuthedRequest, res) => {
  if (!isValidId(req.params.id)) return res.status(404).json({ error: "Topic not found" });
  const db = getDb();
  await db.delete(ambassadorKnowledgeMaterials).where(eq(ambassadorKnowledgeMaterials.topicId, req.params.id));
  await db.delete(ambassadorKnowledgeTopics).where(eq(ambassadorKnowledgeTopics._id, req.params.id));
  res.json({ ok: true });
});

const materialSchema = z.object({
  kind: z.enum(["VIDEO", "DOC"]),
  title: z.string().min(1).max(200),
  url: z.string().url().optional(),
  sortOrder: z.coerce.number().int().optional(),
});

// POST /admin/topics/:id/materials — add a material (uploaded file or a URL).
router.post(
  "/admin/topics/:id/materials",
  requireRole("ADMIN"),
  (req, res, next) => uploadMedia.single("file")(req, res, (err) => (err ? res.status(400).json({ error: err instanceof Error ? err.message : "Upload failed" }) : next())),
  async (req: AuthedRequest, res) => {
    if (!isValidId(req.params.id)) return res.status(404).json({ error: "Topic not found" });
    const parsed = materialSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Validation failed", issues: parsed.error.flatten() });
    const url = req.file ? fileUrl(req.file.filename) : parsed.data.url;
    if (!url) return res.status(400).json({ error: "Provide a file upload or a URL." });

    const db = getDb();
    const [topic] = await db.select({ _id: ambassadorKnowledgeTopics._id }).from(ambassadorKnowledgeTopics).where(eq(ambassadorKnowledgeTopics._id, req.params.id));
    if (!topic) return res.status(404).json({ error: "Topic not found" });

    const [row] = await db.insert(ambassadorKnowledgeMaterials).values({
      topicId: req.params.id,
      kind: parsed.data.kind,
      title: parsed.data.title,
      url,
      fileName: req.file?.originalname ?? null,
      sortOrder: parsed.data.sortOrder ?? 0,
      createdById: req.user!.userId,
    }).returning();
    await logAudit({ userId: req.user!.userId, action: "ambassador.knowledge.material.create", resourceType: "ambassador_knowledge_material", resourceId: String(row._id), metadata: { kind: parsed.data.kind } });
    res.status(201).json({ material: row });
  }
);

router.patch(
  "/admin/materials/:id",
  requireRole("ADMIN"),
  (req, res, next) => uploadMedia.single("file")(req, res, (err) => (err ? res.status(400).json({ error: err instanceof Error ? err.message : "Upload failed" }) : next())),
  async (req: AuthedRequest, res) => {
    if (!isValidId(req.params.id)) return res.status(404).json({ error: "Material not found" });
    const parsed = materialSchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Validation failed" });
    const patch: Record<string, unknown> = { ...parsed.data };
    if (req.file) { patch.url = fileUrl(req.file.filename); patch.fileName = req.file.originalname; }
    const db = getDb();
    const [row] = await db.update(ambassadorKnowledgeMaterials).set(patch).where(eq(ambassadorKnowledgeMaterials._id, req.params.id)).returning();
    if (!row) return res.status(404).json({ error: "Material not found" });
    res.json({ material: row });
  }
);

router.delete("/admin/materials/:id", requireRole("ADMIN"), async (req: AuthedRequest, res) => {
  if (!isValidId(req.params.id)) return res.status(404).json({ error: "Material not found" });
  const db = getDb();
  await db.delete(ambassadorKnowledgeMaterials).where(eq(ambassadorKnowledgeMaterials._id, req.params.id));
  res.json({ ok: true });
});

const configSchema = z.object({ helpContact: z.string().max(60).nullable().optional(), helpText: z.string().max(300).nullable().optional() });
router.put("/admin/config", requireRole("ADMIN"), async (req: AuthedRequest, res) => {
  const parsed = configSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Validation failed" });
  const db = getDb();
  const cfg = await getConfig(db);
  const [row] = await db.update(ambassadorKnowledgeConfig).set({ ...parsed.data, updatedAt: new Date() }).where(eq(ambassadorKnowledgeConfig._id, cfg._id)).returning();
  res.json({ help: { contact: row.helpContact, text: row.helpText } });
});

export default router;

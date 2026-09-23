import { Router } from "express";
import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { getDb } from "../config/db";
import { calls, projects, users, CallStatus } from "../db/schema";
import { authenticate, requireRole, AuthedRequest } from "../middleware/auth";
import { isValidId } from "../lib/ids";
import { getEnv } from "../config/env";
import { getTelephonyProvider } from "../services/telephony";

const router = Router();

function callbackUrl(): string {
  const base = getEnv().publicUrl || process.env.PUBLIC_URL || "http://localhost:5000";
  const token = getEnv().telephony.webhookToken;
  return `${base}/api/calls/webhook/exotel${token ? `?token=${encodeURIComponent(token)}` : ""}`;
}

// ── CP initiates a masked call to the listing's developer ───────────────────
// POST /api/projects/:projectId/call-developer
router.post(
  "/projects/:projectId/call-developer",
  authenticate,
  requireRole("CP", "ADMIN"),
  async (req: AuthedRequest, res) => {
    const { projectId } = req.params;
    if (!isValidId(projectId)) return res.status(400).json({ error: "Invalid project id" });

    const db = getDb();
    const [project] = await db
      .select({ _id: projects._id, name: projects.name, developerId: projects.developerId })
      .from(projects)
      .where(eq(projects._id, projectId));
    if (!project) return res.status(404).json({ error: "Project not found" });

    // Both real numbers are looked up here on the server and NEVER returned.
    const [cp] = await db.select({ _id: users._id, phone: users.phone }).from(users).where(eq(users._id, req.user!.userId));
    const [dev] = await db.select({ _id: users._id, phone: users.phone }).from(users).where(eq(users._id, project.developerId));

    if (!cp?.phone) return res.status(400).json({ error: "Add a verified phone number to your profile to place a call." });
    if (!dev?.phone) return res.status(409).json({ error: "This developer hasn't added a contact number yet." });

    const provider = getTelephonyProvider();
    if (!provider.isConfigured()) {
      return res.status(503).json({ error: "Calling is not available right now. Please try again later." });
    }

    const callerId = getEnv().telephony.exotel.callerId;
    let providerCallId: string | null = null;
    let status: CallStatus = "INITIATED";
    try {
      const result = await provider.connect({
        firstNumber: cp.phone,
        secondNumber: dev.phone,
        callerId,
        statusCallbackUrl: callbackUrl(),
        record: getEnv().telephony.exotel.record,
      });
      providerCallId = result.providerCallId;
      status = result.status;
    } catch (err) {
      console.warn("Masked call failed:", err instanceof Error ? err.message : err);
      // Log the failed attempt for the admin call list, then report a clean error.
      await db.insert(calls).values({
        projectId, cpId: cp._id, developerId: dev._id, provider: provider.name,
        virtualNumber: callerId, status: "FAILED",
      }).catch(() => {});
      // 400 (not 5xx): the provider rejected the request (e.g. a number that is
      // invalid or not yet verified with the trial account), so a gateway proxy
      // won't swallow the body and the real reason reaches the caller.
      return res.status(400).json({
        error: "Couldn't connect the call. Please check that both phone numbers are valid and verified with the calling provider, then try again.",
      });
    }

    const [row] = await db
      .insert(calls)
      .values({
        projectId,
        cpId: cp._id,
        developerId: dev._id,
        provider: provider.name,
        providerCallId,
        virtualNumber: callerId,
        status,
        startedAt: new Date(),
      })
      .returning({ _id: calls._id, status: calls.status });

    // No phone numbers in the response — the provider bridges the call.
    res.status(201).json({
      callId: row._id,
      status: row.status,
      message: "Connecting your call — your phone will ring shortly. Numbers stay private and the call may be recorded.",
    });
  },
);

// ── Provider status/recording webhook (public, token-guarded) ───────────────
// POST /api/calls/webhook/:provider?token=...
router.post("/calls/webhook/:provider", async (req, res) => {
  const token = getEnv().telephony.webhookToken;
  if (token && req.query.token !== token) return res.status(401).json({ error: "Unauthorized" });

  try {
    const provider = getTelephonyProvider();
    const update = provider.parseWebhook({ ...req.body, ...req.query });
    if (update.providerCallId) {
      const db = getDb();
      const patch: Record<string, unknown> = { updatedAt: new Date() };
      if (update.status) patch.status = update.status;
      if (update.durationSec != null) patch.durationSec = update.durationSec;
      if (update.recordingUrl) patch.recordingUrl = update.recordingUrl;
      if (update.recordingId) patch.recordingId = update.recordingId;
      if (update.startedAt) patch.startedAt = update.startedAt;
      if (update.endedAt) patch.endedAt = update.endedAt;
      await db.update(calls).set(patch).where(eq(calls.providerCallId, update.providerCallId));
    }
  } catch (err) {
    console.warn("Call webhook error:", err instanceof Error ? err.message : err);
  }
  // Always 200 so the provider doesn't retry-storm.
  res.json({ ok: true });
});

// ── Admin: list calls with filters ──────────────────────────────────────────
// GET /api/admin/calls?projectId=&developerId=&cpId=&status=&from=&to=&page=
router.get("/admin/calls", authenticate, requireRole("ADMIN"), async (req: AuthedRequest, res) => {
  const db = getDb();
  const q = req.query;
  const conds = [] as any[];
  if (typeof q.projectId === "string" && isValidId(q.projectId)) conds.push(eq(calls.projectId, q.projectId));
  if (typeof q.developerId === "string" && isValidId(q.developerId)) conds.push(eq(calls.developerId, q.developerId));
  if (typeof q.cpId === "string" && isValidId(q.cpId)) conds.push(eq(calls.cpId, q.cpId));
  if (typeof q.status === "string" && q.status) conds.push(eq(calls.status, q.status as CallStatus));
  if (typeof q.from === "string" && q.from) { const d = new Date(q.from); if (!isNaN(d.getTime())) conds.push(gte(calls.createdAt, d)); }
  if (typeof q.to === "string" && q.to) { const d = new Date(q.to); if (!isNaN(d.getTime())) { d.setHours(23, 59, 59, 999); conds.push(lte(calls.createdAt, d)); } }

  const where = conds.length ? and(...conds) : undefined;
  const limit = Math.min(Number(q.limit) || 50, 200);
  const page = Math.max(Number(q.page) || 1, 1);

  const rows = await db
    .select()
    .from(calls)
    .where(where)
    .orderBy(desc(calls.createdAt))
    .limit(limit)
    .offset((page - 1) * limit);

  // Resolve display names in batch (never any phone numbers).
  const projectIds = [...new Set(rows.map((r) => r.projectId))];
  const userIds = [...new Set(rows.flatMap((r) => [r.developerId, r.cpId]))];
  const projectRows = projectIds.length ? await db.select({ _id: projects._id, name: projects.name }).from(projects).where(inArray(projects._id, projectIds)) : [];
  const userRows = userIds.length ? await db.select({ _id: users._id, name: users.name }).from(users).where(inArray(users._id, userIds)) : [];
  const projName = new Map(projectRows.map((p) => [String(p._id), p.name]));
  const userName = new Map(userRows.map((u) => [String(u._id), u.name]));

  const [{ count } = { count: 0 }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(calls)
    .where(where);

  res.json({
    calls: rows.map((c) => ({
      ...serializeCall(c),
      projectName: projName.get(String(c.projectId)) ?? null,
      developerName: userName.get(String(c.developerId)) ?? null,
      cpName: userName.get(String(c.cpId)) ?? null,
    })),
    total: Number(count),
    page,
    limit,
  });
});

// ── Admin: one call ─────────────────────────────────────────────────────────
router.get("/admin/calls/:callId", authenticate, requireRole("ADMIN"), async (req: AuthedRequest, res) => {
  const { callId } = req.params;
  if (!isValidId(callId)) return res.status(400).json({ error: "Invalid call id" });
  const db = getDb();
  const [row] = await db.select().from(calls).where(eq(calls._id, callId));
  if (!row) return res.status(404).json({ error: "Call not found" });
  res.json({ call: serializeCall(row) });
});

// ── Admin: stream a call recording (proxied — provider URL never exposed) ────
router.get("/admin/calls/:callId/recording", authenticate, requireRole("ADMIN"), async (req: AuthedRequest, res) => {
  const { callId } = req.params;
  if (!isValidId(callId)) return res.status(400).json({ error: "Invalid call id" });
  const db = getDb();
  const [row] = await db.select().from(calls).where(eq(calls._id, callId));
  if (!row || !row.recordingUrl) return res.status(404).json({ error: "No recording available" });

  try {
    const e = getEnv().telephony.exotel;
    const headers: Record<string, string> = {};
    // Exotel recording URLs sit behind API auth; other providers may be public.
    if (row.provider === "exotel" && e.apiKey && e.apiToken) {
      headers.Authorization = `Basic ${Buffer.from(`${e.apiKey}:${e.apiToken}`).toString("base64")}`;
    }
    const upstream = await fetch(row.recordingUrl, { headers });
    if (!upstream.ok || !upstream.body) return res.status(502).json({ error: "Couldn't fetch the recording" });
    res.setHeader("Content-Type", upstream.headers.get("content-type") || "audio/mpeg");
    res.setHeader("Cache-Control", "private, no-store");
    const buf = Buffer.from(await upstream.arrayBuffer());
    res.end(buf);
  } catch {
    res.status(502).json({ error: "Couldn't fetch the recording" });
  }
});

/** Call row shaped for the admin UI — never includes any real phone number. */
function serializeCall(c: typeof calls.$inferSelect) {
  return {
    id: c._id,
    projectId: c.projectId,
    cpId: c.cpId,
    developerId: c.developerId,
    provider: c.provider,
    virtualNumber: c.virtualNumber,
    status: c.status,
    startedAt: c.startedAt ? c.startedAt.toISOString() : null,
    endedAt: c.endedAt ? c.endedAt.toISOString() : null,
    durationSec: c.durationSec,
    hasRecording: !!c.recordingUrl,
    createdAt: c.createdAt ? c.createdAt.toISOString() : null,
  };
}

export default router;

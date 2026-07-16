import { Router } from "express";
import { z } from "zod";
import { authenticate, AuthedRequest } from "../middleware/auth";
import { askLimiter } from "../middleware/security";
import { isValidId } from "../lib/ids";
import { askAI, getChatHistory, sessionOwnedBy } from "../services/ai/askAI";
import { logAudit } from "../services/audit";

const router = Router();
router.use(authenticate);

const askSchema = z.object({
  question: z.string().min(2).max(2000),
  propertyId: z.string().optional(),
  sessionId: z.string().optional(),
});

/** POST /api/ask — RAG answer over verified data (10/min per user). */
router.post("/ask", askLimiter, async (req: AuthedRequest, res) => {
  const p = askSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Validation failed", issues: p.error.flatten() });
  if (p.data.propertyId && !isValidId(p.data.propertyId)) return res.status(400).json({ error: "Invalid propertyId" });

  try {
    const result = await askAI({
      question: p.data.question,
      projectId: p.data.propertyId,
      sessionId: p.data.sessionId,
      userId: req.user!.userId,
    });
    await logAudit({ userId: req.user!.userId, action: "ai.ask", resourceType: "chat_session", resourceId: result.sessionId });
    res.json(result);
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : "AI request failed" });
  }
});

/** GET /api/chat/:sessionId — history (owner or admin only). */
router.get("/chat/:sessionId", async (req: AuthedRequest, res) => {
  const sessionId = req.params.sessionId;
  if (!isValidId(sessionId)) return res.status(404).json({ error: "Session not found" });
  const isAdmin = req.user!.role === "ADMIN";
  if (!isAdmin && !(await sessionOwnedBy(sessionId, req.user!.userId))) {
    return res.status(403).json({ error: "Not your session" });
  }
  res.json({ messages: await getChatHistory(sessionId) });
});

export default router;

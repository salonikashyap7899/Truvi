import type { Response } from "express";
import { Router } from "express";
import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../config/db";
import { CURRENT_POLICY_VERSIONS } from "../config/compliance";
import {
  investorConversations,
  investorConversationMessages,
  projects,
  users,
} from "../db/schema";
import { isValidId } from "../lib/ids";
import {
  authenticate,
  optionalAuthenticate,
  requireRole,
  type AuthedRequest,
} from "../middleware/auth";
import { adminLimiter, askLimiter, enquiryLimiter } from "../middleware/security";
import { emitToRole } from "../sockets";

const router = Router();
const COOKIE_PREFIX = "truvi_investor_chat_";
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60 * 1000;

const topicSchema = z.enum([
  "Explore a Truvi project",
  "Discuss investment opportunities",
  "Understand the project structure",
  "Land acquisition or joint venture",
  "Funding or development partnership",
  "Arrange a private meeting",
]);

const startConversationSchema = z.object({
  investorName: z.string().trim().min(2).max(120),
  investorEmail: z.string().trim().email().max(254),
  investorPhone: z.string().trim().regex(/^\\+?[0-9][0-9\\s()-]{7,18}$/, "Enter a valid phone number"),
  topic: topicSchema,
  projectId: z.string().uuid().optional().nullable(),
  firstMessage: z.string().trim().min(1).max(2000),
  privacyNoticeAcknowledged: z.preprocess(
    (value) => value === true || value === "true",
    z.literal(true),
  ),
});

const messageSchema = z.object({
  body: z.string().trim().min(1).max(2000),
});

const statusSchema = z.object({
  status: z.enum(["WAITING_OWNER", "WAITING_INVESTOR", "CLOSED"]),
});

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

function safeConversation(row: typeof investorConversations.$inferSelect) {
  const { accessTokenHash: _secret, ...safe } = row;
  return safe;
}

function readCookie(req: AuthedRequest, name: string): string | null {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const entry of header.split(";")) {
    const separator = entry.indexOf("=");
    if (separator < 0) continue;
    const key = entry.slice(0, separator).trim();
    if (key !== name) continue;
    const value = entry.slice(separator + 1).trim();
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }
  return null;
}

function hasConversationAccess(req: AuthedRequest, id: string, tokenHash: string): boolean {
  const token = readCookie(req, COOKIE_PREFIX + id);
  if (!token || token.length < 32) return false;
  const actual = Buffer.from(sha256(token), "hex");
  const expected = Buffer.from(tokenHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function notifyAdmins(event: string, data: unknown) {
  try {
    emitToRole("ADMIN", event, data);
  } catch (error) {
    console.warn("[investor-chat] real-time admin event skipped:", error instanceof Error ? error.message : error);
  }
}

async function findConversation(id: string) {
  if (!isValidId(id)) return null;
  const [conversation] = await getDb()
    .select()
    .from(investorConversations)
    .where(eq(investorConversations._id, id))
    .limit(1);
  return conversation ?? null;
}

function setConversationCookie(res: Response, id: string, token: string) {
  const production = process.env.NODE_ENV === "production";
  res.cookie(COOKIE_PREFIX + id, token, {
    httpOnly: true,
    secure: production,
    sameSite: production ? "none" : "lax",
    path: `/api/investor-conversations/${id}`,
    maxAge: COOKIE_MAX_AGE,
  });
}

router.post("/", enquiryLimiter, optionalAuthenticate, async (req: AuthedRequest, res) => {
  const parsed = startConversationSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || "Check your conversation details." });
  }

  const input = parsed.data;
  let projectName: string | null = null;
  if (input.projectId) {
    const [project] = await getDb()
      .select({ _id: projects._id, name: projects.name })
      .from(projects)
      .where(and(eq(projects._id, input.projectId), eq(projects.approvalStatus, "APPROVED")))
      .limit(1);
    if (!project) return res.status(400).json({ error: "That project is no longer available for public discussion." });
    projectName = project.name;
  }

  const accessToken = randomBytes(32).toString("base64url");
  const accessTokenHash = sha256(accessToken);
  const publicCode = "TRV-IC-" + randomBytes(4).toString("hex").toUpperCase();
  const now = new Date();
  const firstMessage = input.firstMessage.trim();
  const db = getDb();

  const conversation = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(investorConversations)
      .values({
        publicCode,
        investorUserId: req.user?.userId ?? null,
        investorName: input.investorName.trim(),
        investorEmail: input.investorEmail.trim().toLowerCase(),
        investorPhone: input.investorPhone.replace(/\\s/g, ""),
        topic: input.topic,
        projectId: input.projectId ?? null,
        projectName,
        status: "WAITING_OWNER",
        accessTokenHash,
        lastMessagePreview: firstMessage.slice(0, 220),
        unreadOwnerCount: 1,
        unreadInvestorCount: 0,
        privacyNoticeVersion: CURRENT_POLICY_VERSIONS.PRIVACY_NOTICE,
        privacyNoticeAcknowledgedAt: now,
        lastMessageAt: now,
        updatedAt: now,
      })
      .returning();

    await tx.insert(investorConversationMessages).values({
      conversationId: created._id,
      senderType: "INVESTOR",
      senderUserId: req.user?.userId ?? null,
      senderName: input.investorName.trim(),
      body: firstMessage,
    });
    return created;
  });

  setConversationCookie(res, conversation._id, accessToken);
  res.setHeader("Cache-Control", "no-store");
  notifyAdmins("investor-conversation:new", {
    id: conversation._id,
    publicCode: conversation.publicCode,
    investorName: conversation.investorName,
    investorEmail: conversation.investorEmail,
    investorPhone: conversation.investorPhone,
    topic: conversation.topic,
    projectName: conversation.projectName,
    lastMessagePreview: conversation.lastMessagePreview,
    unreadOwnerCount: 1,
    status: conversation.status,
    lastMessageAt: conversation.lastMessageAt,
  });
  return res.status(201).json({
    conversation: safeConversation(conversation),
    message: "Your private conversation has started.",
  });
});

router.get("/:id/messages", async (req: AuthedRequest, res) => {
  const conversation = await findConversation(req.params.id);
  if (!conversation || !hasConversationAccess(req, conversation._id, conversation.accessTokenHash)) {
    return res.status(404).json({ error: "This conversation could not be found on this device." });
  }
  const db = getDb();
  const messages = await db
    .select()
    .from(investorConversationMessages)
    .where(eq(investorConversationMessages.conversationId, conversation._id))
    .orderBy(investorConversationMessages.createdAt);

  await db.update(investorConversations)
    .set({ unreadInvestorCount: 0, updatedAt: new Date() })
    .where(eq(investorConversations._id, conversation._id));

  res.setHeader("Cache-Control", "no-store");
  return res.json({ conversation: safeConversation(conversation), messages });
});

router.post("/:id/messages", askLimiter, async (req: AuthedRequest, res) => {
  const parsed = messageSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Write a message before sending." });

  const conversation = await findConversation(req.params.id);
  if (!conversation || !hasConversationAccess(req, conversation._id, conversation.accessTokenHash)) {
    return res.status(404).json({ error: "This conversation could not be found on this device." });
  }
  if (conversation.status === "CLOSED") {
    return res.status(409).json({ error: "This conversation is closed. Start a new conversation with Truvi to continue." });
  }

  const body = parsed.data.body;
  const [message] = await getDb().insert(investorConversationMessages).values({
    conversationId: conversation._id,
    senderType: "INVESTOR",
    senderUserId: conversation.investorUserId,
    senderName: conversation.investorName,
    body,
  }).returning();

  const now = new Date();
  const [updated] = await getDb().update(investorConversations)
    .set({
      status: "WAITING_OWNER",
      lastMessagePreview: body.slice(0, 220),
      lastMessageAt: now,
      unreadOwnerCount: conversation.unreadOwnerCount + 1,
      updatedAt: now,
    })
    .where(eq(investorConversations._id, conversation._id))
    .returning();

  notifyAdmins("investor-conversation:message", {
    conversationId: updated._id,
    publicCode: updated.publicCode,
    message,
    unreadOwnerCount: updated.unreadOwnerCount,
    status: updated.status,
    lastMessageAt: updated.lastMessageAt,
  });
  res.setHeader("Cache-Control", "no-store");
  return res.status(201).json({ message, conversation: safeConversation(updated) });
});

router.get("/admin", authenticate, requireRole("ADMIN"), async (_req: AuthedRequest, res) => {
  const conversations = await getDb()
    .select()
    .from(investorConversations)
    .orderBy(desc(investorConversations.lastMessageAt))
    .limit(150);
  res.setHeader("Cache-Control", "no-store");
  return res.json({ conversations: conversations.map(safeConversation) });
});

router.get("/admin/:id/messages", authenticate, requireRole("ADMIN"), async (req: AuthedRequest, res) => {
  const conversation = await findConversation(req.params.id);
  if (!conversation) return res.status(404).json({ error: "Conversation not found." });

  const db = getDb();
  const messages = await db
    .select()
    .from(investorConversationMessages)
    .where(eq(investorConversationMessages.conversationId, conversation._id))
    .orderBy(investorConversationMessages.createdAt);

  await db.update(investorConversations)
    .set({ unreadOwnerCount: 0, updatedAt: new Date() })
    .where(eq(investorConversations._id, conversation._id));

  res.setHeader("Cache-Control", "no-store");
  return res.json({ conversation: safeConversation({ ...conversation, unreadOwnerCount: 0 }), messages });
});

router.post("/admin/:id/messages", authenticate, requireRole("ADMIN"), adminLimiter, async (req: AuthedRequest, res) => {
  const parsed = messageSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Write a reply before sending." });

  const conversation = await findConversation(req.params.id);
  if (!conversation) return res.status(404).json({ error: "Conversation not found." });

  const [owner] = await getDb()
    .select({ name: users.name })
    .from(users)
    .where(eq(users._id, req.user!.userId))
    .limit(1);
  const senderName = owner?.name || "Truvi Owner";
  const body = parsed.data.body;
  const [message] = await getDb().insert(investorConversationMessages).values({
    conversationId: conversation._id,
    senderType: "OWNER",
    senderUserId: req.user!.userId,
    senderName,
    body,
  }).returning();

  const now = new Date();
  const [updated] = await getDb().update(investorConversations)
    .set({
      status: "WAITING_INVESTOR",
      lastMessagePreview: body.slice(0, 220),
      lastMessageAt: now,
      unreadInvestorCount: conversation.unreadInvestorCount + 1,
      updatedAt: now,
    })
    .where(eq(investorConversations._id, conversation._id))
    .returning();

  notifyAdmins("investor-conversation:message", {
    conversationId: updated._id,
    publicCode: updated.publicCode,
    message,
    unreadOwnerCount: updated.unreadOwnerCount,
    status: updated.status,
    lastMessageAt: updated.lastMessageAt,
  });
  return res.status(201).json({ message, conversation: safeConversation(updated) });
});

router.patch("/admin/:id/status", authenticate, requireRole("ADMIN"), adminLimiter, async (req: AuthedRequest, res) => {
  const parsed = statusSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Choose a valid conversation status." });
  const conversation = await findConversation(req.params.id);
  if (!conversation) return res.status(404).json({ error: "Conversation not found." });

  const [updated] = await getDb().update(investorConversations)
    .set({ status: parsed.data.status, updatedAt: new Date() })
    .where(eq(investorConversations._id, conversation._id))
    .returning();
  notifyAdmins("investor-conversation:update", safeConversation(updated));
  return res.json({ conversation: safeConversation(updated) });
});

export default router;

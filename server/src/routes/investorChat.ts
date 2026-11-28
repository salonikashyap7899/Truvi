import { Router } from "express";
import crypto from "crypto";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../config/db";
import { CURRENT_POLICY_VERSIONS } from "../config/compliance";
import {
  investorConversations,
  investorConversationMessages,
  enquiries,
  projects,
  users,
} from "../db/schema";
import { isValidId } from "../lib/ids";
import { zodMessage } from "../lib/validationError";
import { authenticate, requireRole, type AuthedRequest } from "../middleware/auth";
import { enquiryLimiter } from "../middleware/security";
import { emitToRole } from "../sockets";
import { notifyRole } from "../services/notificationService";

const router = Router();
const COOKIE_NAME = "truvi_investor_conversation";
const SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const TOPICS = [
  "Discuss a specific project",
  "Explore investment opportunities",
  "Understand project structure and participation",
  "Land acquisition or joint venture",
  "Funding or development partnership",
  "Arrange a private meeting with the owner",
] as const;

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/api/investor-chat",
  maxAge: SESSION_TTL_MS,
};

const startSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254),
  phone: z.string().trim().regex(/^(?:\+?91[-\s]?)?[6-9]\d{9}$/, "Enter a valid Indian mobile number."),
  topic: z.enum(TOPICS),
  projectId: z.string().trim().optional().or(z.literal("")),
  message: z.string().trim().min(2).max(4000),
  privacyNoticeAcknowledged: z.preprocess((value) => value === true || value === "true", z.literal(true)),
});

const messageSchema = z.object({
  message: z.string().trim().min(1).max(4000),
});

function hashVisitorToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function publicConversation(row: typeof investorConversations.$inferSelect) {
  const safe = { ...row };
  delete (safe as Partial<typeof safe>).visitorTokenHash;
  return safe;
}

async function visitorConversation(req: AuthedRequest) {
  const raw = req.cookies?.[COOKIE_NAME];
  if (typeof raw !== "string" || raw.length !== 64) return null;
  const [conversation] = await getDb()
    .select()
    .from(investorConversations)
    .where(eq(investorConversations.visitorTokenHash, hashVisitorToken(raw)))
    .limit(1);
  if (!conversation || conversation.expiresAt.getTime() <= Date.now()) return null;
  return conversation;
}

function markPrivate(res: import("express").Response) {
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  res.setHeader("Pragma", "no-cache");
}

function messageDto(row: typeof investorConversationMessages.$inferSelect) {
  return {
    _id: row._id,
    senderRole: row.senderRole,
    senderName: row.senderName,
    body: row.body,
    readAt: row.readAt,
    createdAt: row.createdAt,
  };
}

// Start a guest conversation. The raw bearer secret is only placed in an
// HttpOnly, same-site cookie; only its SHA-256 hash is stored in PostgreSQL.
router.post("/start", enquiryLimiter, async (req, res) => {
  markPrivate(res);
  const parsed = startSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: zodMessage(parsed.error) });

  const existing = await visitorConversation(req as AuthedRequest);
  if (existing) {
    const messages = await getDb()
      .select()
      .from(investorConversationMessages)
      .where(eq(investorConversationMessages.conversationId, existing._id))
      .orderBy(investorConversationMessages.createdAt);
    return res.status(200).json({ conversation: publicConversation(existing), messages: messages.map(messageDto), resumed: true });
  }

  let project: { _id: string; name: string } | undefined;
  if (parsed.data.projectId) {
    if (!isValidId(parsed.data.projectId)) return res.status(400).json({ error: "The selected project is invalid." });
    const [found] = await getDb()
      .select({ _id: projects._id, name: projects.name, approvalStatus: projects.approvalStatus })
      .from(projects)
      .where(eq(projects._id, parsed.data.projectId))
      .limit(1);
    if (!found || found.approvalStatus !== "APPROVED") {
      return res.status(400).json({ error: "That project is no longer available for public discussion." });
    }
    project = { _id: found._id, name: found.name };
  }

  const rawToken = crypto.randomBytes(32).toString("hex");
  const now = new Date();
  const normalizedPhone = parsed.data.phone.replace(/[^\d]/g, "").replace(/^([6-9])/, "91$1");
  const projectName = project?.name ?? null;
  const result = await getDb().transaction(async (tx) => {
    const [conversation] = await tx
      .insert(investorConversations)
      .values({
        visitorTokenHash: hashVisitorToken(rawToken),
        visitorName: parsed.data.name,
        visitorEmail: parsed.data.email.toLowerCase(),
        visitorPhone: normalizedPhone,
        topic: parsed.data.topic,
        projectId: project?._id ?? null,
        projectName,
        status: "OPEN",
        ownerUnread: 1,
        investorUnread: 0,
        privacyNoticeVersion: CURRENT_POLICY_VERSIONS.PRIVACY_NOTICE,
        privacyAcknowledgedAt: now,
        expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
        lastMessageAt: now,
      })
      .returning();

    const [firstMessage] = await tx
      .insert(investorConversationMessages)
      .values({
        conversationId: conversation._id,
        senderRole: "INVESTOR",
        senderName: parsed.data.name,
        body: parsed.data.message,
        createdAt: now,
      })
      .returning();

    // Retain a searchable enquiry record in the existing admin enquiry ledger.
    await tx.insert(enquiries).values({
      name: parsed.data.name,
      email: parsed.data.email.toLowerCase(),
      phone: normalizedPhone,
      purposeType: "GUEST",
      message: "[TRUVI INVESTOR CLUB — EXPRESSION OF INTEREST]\nLive conversation opened.\nTopic: " + parsed.data.topic + "\n" + parsed.data.message,
      privacyNoticeVersion: CURRENT_POLICY_VERSIONS.PRIVACY_NOTICE,
      privacyNoticeAcknowledgedAt: now,
      projectId: project?._id ?? undefined,
      projectName: projectName ?? undefined,
    });

    return { conversation, firstMessage };
  });

  res.cookie(COOKIE_NAME, rawToken, cookieOptions);
  const summary = {
    _id: result.conversation._id,
    visitorName: result.conversation.visitorName,
    visitorEmail: result.conversation.visitorEmail,
    visitorPhone: result.conversation.visitorPhone,
    topic: result.conversation.topic,
    projectName: result.conversation.projectName,
    status: result.conversation.status,
    ownerUnread: result.conversation.ownerUnread,
    investorUnread: result.conversation.investorUnread,
    lastMessageAt: result.conversation.lastMessageAt,
    createdAt: result.conversation.createdAt,
  };
  emitToRole("ADMIN", "investor-chat:new", summary);
  void notifyRole("ADMIN", {
    type: "investor_conversation",
    title: "New investor conversation",
    message: parsed.data.name + " started a private Investor Club conversation" + (projectName ? " about " + projectName : "") + ".",
    data: { href: "/admin/enquiries?view=investor-chats&conversation=" + result.conversation._id },
  }).catch(() => {});

  return res.status(201).json({
    conversation: publicConversation(result.conversation),
    messages: [messageDto(result.firstMessage)],
    resumed: false,
  });
});

// End the current guest session without deleting its conversation history.
router.post("/session/close", async (req, res) => {
  const conversation = await visitorConversation(req as AuthedRequest);
  if (conversation && conversation.status === "OPEN") {
    await getDb().update(investorConversations)
      .set({ status: "CLOSED", updatedAt: new Date() })
      .where(eq(investorConversations._id, conversation._id));
  }
  res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: undefined });
  return res.json({ ok: true });
});

// Restore a guest's private thread on a page revisit and return its messages.
router.get("/session", async (req, res) => {
  markPrivate(res);
  const conversation = await visitorConversation(req as AuthedRequest);
  if (!conversation) {
    res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: undefined });
    return res.json({ conversation: null, messages: [] });
  }

  await getDb().transaction(async (tx) => {
    await tx.update(investorConversations)
      .set({ investorUnread: 0, updatedAt: new Date() })
      .where(eq(investorConversations._id, conversation._id));
    await tx.update(investorConversationMessages)
      .set({ readAt: new Date() })
      .where(and(
        eq(investorConversationMessages.conversationId, conversation._id),
        eq(investorConversationMessages.senderRole, "OWNER"),
        isNull(investorConversationMessages.readAt),
      ));
  });

  const messages = await getDb()
    .select()
    .from(investorConversationMessages)
    .where(eq(investorConversationMessages.conversationId, conversation._id))
    .orderBy(investorConversationMessages.createdAt)
    .limit(300);
  return res.json({ conversation: publicConversation({ ...conversation, investorUnread: 0 }), messages: messages.map(messageDto) });
});

router.post("/messages", enquiryLimiter, async (req, res) => {
  markPrivate(res);
  const parsed = messageSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: zodMessage(parsed.error) });
  const conversation = await visitorConversation(req as AuthedRequest);
  if (!conversation) return res.status(401).json({ error: "Your private conversation has expired. Please start a new conversation." });
  if (conversation.status !== "OPEN") return res.status(409).json({ error: "This conversation is closed. Please start a new one if you need further assistance." });

  const now = new Date();
  const [message] = await getDb().transaction(async (tx) => {
    const [created] = await tx.insert(investorConversationMessages).values({
      conversationId: conversation._id,
      senderRole: "INVESTOR",
      senderName: conversation.visitorName,
      body: parsed.data.message,
      createdAt: now,
    }).returning();
    await tx.update(investorConversations)
      .set({
        ownerUnread: sql`${investorConversations.ownerUnread} + 1`,
        lastMessageAt: now,
        updatedAt: now,
      })
      .where(eq(investorConversations._id, conversation._id));
    return [created];
  });

  emitToRole("ADMIN", "investor-chat:message", {
    conversationId: conversation._id,
    message: messageDto(message),
  });
  return res.status(201).json({ message: messageDto(message) });
});

// Owner/admin inbox: never expose the guest cookie hash or public token.
router.get("/admin", authenticate, requireRole("ADMIN"), async (_req: AuthedRequest, res) => {
  markPrivate(res);
  const rows = await getDb()
    .select()
    .from(investorConversations)
    .orderBy(desc(investorConversations.lastMessageAt))
    .limit(200);
  return res.json({
    conversations: rows.map((row) => {
      const safe = publicConversation(row);
      return safe;
    }),
  });
});

router.get("/admin/:id/messages", authenticate, requireRole("ADMIN"), async (req: AuthedRequest, res) => {
  markPrivate(res);
  const id = String(req.params.id);
  if (!isValidId(id)) return res.status(404).json({ error: "Conversation not found." });
  const [conversation] = await getDb()
    .select()
    .from(investorConversations)
    .where(eq(investorConversations._id, id))
    .limit(1);
  if (!conversation) return res.status(404).json({ error: "Conversation not found." });

  await getDb().transaction(async (tx) => {
    await tx.update(investorConversations)
      .set({ ownerUnread: 0, updatedAt: new Date() })
      .where(eq(investorConversations._id, id));
    await tx.update(investorConversationMessages)
      .set({ readAt: new Date() })
      .where(and(
        eq(investorConversationMessages.conversationId, id),
        eq(investorConversationMessages.senderRole, "INVESTOR"),
        isNull(investorConversationMessages.readAt),
      ));
  });

  const messages = await getDb()
    .select()
    .from(investorConversationMessages)
    .where(eq(investorConversationMessages.conversationId, id))
    .orderBy(investorConversationMessages.createdAt)
    .limit(500);
  return res.json({
    conversation: publicConversation({ ...conversation, ownerUnread: 0 }),
    messages: messages.map(messageDto),
  });
});

router.post("/admin/:id/messages", authenticate, requireRole("ADMIN"), async (req: AuthedRequest, res) => {
  markPrivate(res);
  const id = String(req.params.id);
  if (!isValidId(id)) return res.status(404).json({ error: "Conversation not found." });
  const parsed = messageSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: zodMessage(parsed.error) });

  const [conversation] = await getDb()
    .select()
    .from(investorConversations)
    .where(eq(investorConversations._id, id))
    .limit(1);
  if (!conversation) return res.status(404).json({ error: "Conversation not found." });
  if (conversation.status !== "OPEN") return res.status(409).json({ error: "This conversation is closed." });

  const [owner] = await getDb()
    .select({ name: users.name })
    .from(users)
    .where(eq(users._id, req.user!.userId))
    .limit(1);
  const now = new Date();
  const [message] = await getDb().transaction(async (tx) => {
    const [created] = await tx.insert(investorConversationMessages).values({
      conversationId: id,
      senderRole: "OWNER",
      senderUserId: req.user!.userId,
      senderName: owner?.name || "Truvi Owner",
      body: parsed.data.message,
      createdAt: now,
    }).returning();
    await tx.update(investorConversations)
      .set({
        investorUnread: sql`${investorConversations.investorUnread} + 1`,
        lastMessageAt: now,
        updatedAt: now,
      })
      .where(eq(investorConversations._id, id));
    return [created];
  });

  return res.status(201).json({ message: messageDto(message) });
});

router.patch("/admin/:id/close", authenticate, requireRole("ADMIN"), async (req: AuthedRequest, res) => {
  const id = String(req.params.id);
  if (!isValidId(id)) return res.status(404).json({ error: "Conversation not found." });
  const [updated] = await getDb().update(investorConversations)
    .set({ status: "CLOSED", updatedAt: new Date() })
    .where(eq(investorConversations._id, id))
    .returning();
  if (!updated) return res.status(404).json({ error: "Conversation not found." });
  return res.json({ conversation: publicConversation(updated) });
});

export default router;

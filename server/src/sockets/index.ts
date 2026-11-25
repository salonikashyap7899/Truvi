import { Server as HTTPServer } from "http";
import { Server as SocketIOServer, Socket } from "socket.io";
import { verifyAccessToken } from "../lib/jwt";
import { getAllowedOrigins } from "../config/origins";
import { getDb } from "../config/db";
import { projects } from "../db/schema";
import { eq, inArray } from "drizzle-orm";

let io: SocketIOServer | null = null;

export function initSocket(httpServer: HTTPServer): SocketIOServer {
  io = new SocketIOServer(httpServer, {
    cors: { origin: getAllowedOrigins(), credentials: true },
  });

  io.use((socket: Socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error("Not authenticated"));
    try {
      const payload = verifyAccessToken(token);
      (socket as any).user = payload;
      next();
    } catch {
      next(new Error("Invalid token"));
    }
  });

  io.on("connection", (socket: Socket) => {
    const user = (socket as any).user;
    // Personal room for direct notifications, plus a role room for
    // broadcast-style updates (e.g. "a unit was just locked" to all CPs).
    socket.join(`user:${user.userId}`);
    socket.join(`role:${user.role}`);

    socket.on("disconnect", () => {});
  });

  return io;
}

function getIO(): SocketIOServer {
  if (!io) throw new Error("Socket.io not initialized — call initSocket first");
  return io;
}

// --- Typed emit helpers, used by route handlers after a successful write ---

export function emitUnitUpdate(projectId: string, unit: unknown) {
  // Never broadcast inventory to every connected role. Approved inventory is
  // shared with CPs/buyers; admins and the owning developer can also receive
  // events for pending/unapproved projects.
  void (async () => {
    try {
      const db = getDb();
      const [project] = await db
        .select({ developerId: projects.developerId, approvalStatus: projects.approvalStatus })
        .from(projects)
        .where(eq(projects._id, projectId))
        .limit(1);
      if (!project) return;

      const rooms = new Set<string>(["role:ADMIN", `user:${project.developerId}`]);
      if (project.approvalStatus === "APPROVED") {
        rooms.add("role:CP");
        rooms.add("role:BUYER");
      }

      // A unit update does not need to disclose the identity of the CP holding it.
      const raw = unit && typeof unit === "object" ? unit as Record<string, unknown> : {};
      const safeUnit = { ...raw };
      delete safeUnit.lockedByCPId;
      getIO().to([...rooms]).emit("unit:update", { projectId, unit: safeUnit });
    } catch (error) {
      // Event delivery is best-effort; failed lookups must never trigger a global broadcast.
      console.error("Unit update broadcast skipped:", error instanceof Error ? error.message : error);
    }
  })();
}

/**
 * A lead carries a client's name, phone and notes, so it is pushed only to
 * the people already allowed to see it: its CP(s), the project's developer
 * (passed in by the caller) and admins — never broadcast to every socket.
 */
export function emitLeadUpdate(
  lead: {
    _id?: string;
    projectId?: string | { _id?: string } | null;
    assignedToId?: string | null;
    submittedById?: string | null;
    contactConsent?: boolean;
    clientName?: string;
    clientPhone?: string;
    clientEmail?: string | null;
    notes?: string | null;
    followUpNotes?: string | null;
    additionalRequirements?: string | null;
    requirement?: string | null;
  },
  developerId?: string | null,
) {
  // Admins and the CP(s) assigned/submitting the lead retain their existing
  // access. Developer delivery is separated so it can follow the same
  // project-level + buyer-consent gate as the HTTP endpoints.
  const rooms = new Set<string>(["role:ADMIN"]);
  for (const id of [lead.assignedToId, lead.submittedById]) {
    if (id && id !== developerId) rooms.add(`user:${id}`);
  }
  getIO().to([...rooms]).emit("lead:update", lead);

  if (!developerId) return;
  void (async () => {
    try {
      const projectId = typeof lead.projectId === "string" ? lead.projectId : lead.projectId?._id;
      const [project] = projectId
        ? await getDb().select({ developerLeadDetailsEnabled: projects.developerLeadDetailsEnabled })
            .from(projects).where(eq(projects._id, projectId)).limit(1)
        : [];
      const canShowContact = project?.developerLeadDetailsEnabled === true && lead.contactConsent === true;
      const developerLead = {
        ...(canShowContact ? lead : {
          ...lead,
          clientName: "Buyer details hidden",
          clientPhone: "",
          clientEmail: null,
          notes: null,
          followUpNotes: null,
          additionalRequirements: null,
          requirement: null,
        }),
        contactDetailsVisible: canShowContact,
      };
      getIO().to(`user:${developerId}`).emit("lead:update", developerLead);
    } catch (error) {
      // On lookup failure fail closed: no contact data is sent to developers.
      const safeLead = {
        ...lead,
        clientName: "Buyer details hidden",
        clientPhone: "",
        clientEmail: null,
        notes: null,
        followUpNotes: null,
        additionalRequirements: null,
        requirement: null,
        contactDetailsVisible: false,
      };
      try { getIO().to(`user:${developerId}`).emit("lead:update", safeLead); } catch { /* non-fatal */ }
      console.error("Developer lead update was redacted after permission lookup failed:", error instanceof Error ? error.message : error);
    }
  })();
}

/** Notify only project owners that aggregate Buyer CRM counts may have changed. */
export function emitBuyerCrmProjectLeadCountUpdate(projectIds: Array<string | null | undefined> | string | null | undefined) {
  const ids = [...new Set((Array.isArray(projectIds) ? projectIds : [projectIds]).filter((id): id is string => Boolean(id)))];
  if (!ids.length) return;
  void (async () => {
    try {
      const affectedProjects = await getDb()
        .select({ _id: projects._id, developerId: projects.developerId })
        .from(projects)
        .where(inArray(projects._id, ids));
      for (const project of affectedProjects) {
        getIO().to(`user:${project.developerId}`).emit("buyer-crm:project-leads:update", { projectId: project._id });
      }
    } catch (error) {
      console.error("Buyer CRM lead count update could not be delivered:", error instanceof Error ? error.message : error);
    }
  })();
}

export function emitNotification(userId: string, notification: unknown) {
  getIO().to(`user:${userId}`).emit("notification:new", notification);
}

export function emitCommissionUpdate(cpId: string, commission: unknown) {
  getIO().to(`user:${cpId}`).emit("commission:update", commission);
}

export function emitToRole(role: string, event: string, data: unknown) {
  getIO().to(`role:${role}`).emit(event, data);
}

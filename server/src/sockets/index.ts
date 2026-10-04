import { Server as HTTPServer } from "http";
import { Server as SocketIOServer, Socket } from "socket.io";
import { verifyAccessToken } from "../lib/jwt";
import { getAllowedOrigins } from "../config/origins";

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
  getIO().emit("unit:update", { projectId, unit });
}

/**
 * A lead carries a client's name, phone and notes, so it is pushed only to
 * the people already allowed to see it: its CP(s), the project's developer
 * (passed in by the caller) and admins — never broadcast to every socket.
 */
export function emitLeadUpdate(
  lead: { assignedToId?: string | null; submittedById?: string | null },
  developerId?: string | null,
) {
  const rooms = new Set<string>(["role:ADMIN"]);
  for (const id of [lead.assignedToId, lead.submittedById, developerId]) {
    if (id) rooms.add(`user:${id}`);
  }
  getIO().to([...rooms]).emit("lead:update", lead);
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

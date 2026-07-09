import { Router } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "../config/db";
import { users } from "../db/schema";
import { authenticate } from "../middleware/auth";

const router = Router();
router.use(authenticate);

// Any authenticated role can view the CP leaderboard — it's meant to be
// motivational/competitive, not sensitive. Only non-sensitive fields are
// selected (no email, phone, or password).
router.get("/", async (_req, res) => {
  const db = getDb();
  const cps = await db
    .select({ _id: users._id, name: users.name, cpTier: users.cpTier, cpProfile: users.cpProfile })
    .from(users)
    .where(and(eq(users.role, "CP"), eq(users.approvalStatus, "APPROVED")))
    .orderBy(desc(sql`coalesce((${users.cpProfile}->>'totalBookings')::int, 0)`))
    .limit(10);

  res.json({ leaderboard: cps });
});

export default router;

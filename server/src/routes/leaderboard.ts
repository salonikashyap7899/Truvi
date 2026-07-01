import { Router } from "express";
import { User } from "../models/User";
import { authenticate } from "../middleware/auth";

const router = Router();
router.use(authenticate);

// Any authenticated role can view the CP leaderboard — it's meant to be
// motivational/competitive, not sensitive. Only non-sensitive fields are
// selected (no email, phone, or password).
router.get("/", async (_req, res) => {
  const cps = await User.find({ role: "CP", approvalStatus: "APPROVED" })
    .select("name cpTier cpProfile")
    .sort({ "cpProfile.totalBookings": -1 })
    .limit(10);

  res.json({ leaderboard: cps });
});

export default router;

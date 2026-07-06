import { Router } from "express";
import { Project } from "../models/Project";

const router = Router();

// GET /api/inventory — public, no auth, returns all approved projects
// sorted: Prime Listing first, then Featured, then Standard
router.get("/", async (_req, res) => {
  const projects = await Project.find({ approvalStatus: "APPROVED" })
    .populate("developerId", "name")
    .sort({ isPrimeListing: -1, listingTier: 1, createdAt: -1 });

  res.json({ projects });
});

export default router;

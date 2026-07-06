import { Router } from "express";
import { isValidObjectId } from "mongoose";
import { Project } from "../models/Project";
import { buildIntelligenceProfile } from "../services/intelligenceService";

const router = Router();

// GET /api/inventory — public, no auth, returns all approved projects
// sorted: Prime Listing first, then Featured, then Standard
router.get("/", async (_req, res) => {
  const projects = await Project.find({ approvalStatus: "APPROVED" })
    .populate("developerId", "name")
    .sort({ isPrimeListing: -1, listingTier: 1, createdAt: -1 });

  res.json({ projects });
});

// GET /api/inventory/:id/intelligence — public. Full Raw Data Sources &
// AI Intelligence profile for one listing: every data point with the
// source it came from and its verification status.
router.get("/:id/intelligence", async (req, res) => {
  if (!isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: "Invalid listing id" });
  }
  const project = await Project.findOne({ _id: req.params.id, approvalStatus: "APPROVED" });
  if (!project) return res.status(404).json({ error: "Listing not found" });

  res.json({ intelligence: buildIntelligenceProfile(project) });
});

export default router;

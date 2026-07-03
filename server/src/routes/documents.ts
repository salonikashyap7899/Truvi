import { Router } from "express";
import { z } from "zod";
import mongoose from "mongoose";
import path from "path";
import { authenticate, requireRole, AuthedRequest } from "../middleware/auth";
import { upload, fileUrl } from "../services/uploadService";
import { SharedDocument } from "../models/SharedDocument";
import { BuyerDocument } from "../models/BuyerDocument";
import { Project } from "../models/Project";

const router = Router();
router.use(authenticate);

// ─── Shared Documents ─────────────────────────────────────────────────────────

/**
 * GET /api/documents/shared
 * Returns all SharedDocument records for APPROVED projects, plus brochure/price-list
 * entries synthesised from the Project records themselves (backward-compatible).
 * Available to BUYER role.
 */
router.get("/shared", requireRole("BUYER"), async (_req: AuthedRequest, res) => {
  const [docs, projects] = await Promise.all([
    SharedDocument.find()
      .populate("projectId", "name approvalStatus")
      .populate("uploadedById", "name role")
      .sort({ createdAt: -1 })
      .lean(),
    Project.find({ approvalStatus: "APPROVED" })
      .select("name brochureUrl priceListUrl")
      .lean(),
  ]);

  // Filter to docs whose project is still APPROVED
  const approved = docs.filter(
    (d) => (d.projectId as any)?.approvalStatus === "APPROVED"
  );

  // Synthesise legacy brochure / price-list URLs already stored on projects
  const synthetic: object[] = [];
  for (const p of projects) {
    if (p.brochureUrl) {
      synthetic.push({
        _id: `legacy-brochure-${p._id}`,
        projectId: { _id: p._id, name: p.name },
        fileName: "Brochure",
        fileUrl: p.brochureUrl,
        fileType: "BROCHURE",
        createdAt: null,
      });
    }
    if (p.priceListUrl) {
      synthetic.push({
        _id: `legacy-pricelist-${p._id}`,
        projectId: { _id: p._id, name: p.name },
        fileName: "Price List",
        fileUrl: p.priceListUrl,
        fileType: "PRICE_LIST",
        createdAt: null,
      });
    }
  }

  res.json({ documents: [...approved, ...synthetic] });
});

/**
 * POST /api/documents/shared
 * Developer or Admin uploads a document and attaches it to a project.
 */
router.post(
  "/shared",
  requireRole("DEVELOPER", "ADMIN"),
  upload.single("file"),
  async (req: AuthedRequest, res) => {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const parsed = z
      .object({
        projectId: z.string().min(1),
        fileType: z
          .enum(["BROCHURE", "FLOOR_PLAN", "PRICE_LIST", "LEGAL", "OTHER"])
          .optional()
          .default("OTHER"),
        description: z.string().optional(),
      })
      .safeParse(req.body);

    if (!parsed.success)
      return res.status(400).json({ error: "Validation failed", issues: parsed.error.flatten() });

    if (!mongoose.isValidObjectId(parsed.data.projectId))
      return res.status(400).json({ error: "Invalid projectId" });

    const project = await Project.findById(parsed.data.projectId).lean();
    if (!project) return res.status(404).json({ error: "Project not found" });

    const doc = await SharedDocument.create({
      projectId:    parsed.data.projectId,
      uploadedById: req.user!.userId,
      fileName:     req.file.originalname || path.basename(req.file.filename),
      fileUrl:      fileUrl(req.file.filename),
      fileType:     parsed.data.fileType,
      description:  parsed.data.description,
    });

    res.status(201).json({ document: doc });
  }
);

// ─── Buyer (KYC) Documents ───────────────────────────────────────────────────

/**
 * GET /api/documents/my
 * Returns all KYC documents uploaded by the authenticated buyer.
 */
router.get("/my", requireRole("BUYER"), async (req: AuthedRequest, res) => {
  const docs = await BuyerDocument.find({ buyerId: req.user!.userId })
    .sort({ createdAt: -1 })
    .lean();
  res.json({ documents: docs });
});

const docTypeSchema = z.enum(["ID_PROOF", "ADDRESS_PROOF", "INCOME_PROOF"]);

/**
 * POST /api/documents/my
 * Buyer uploads a KYC document. Field name must be "file", body must include "docType".
 */
router.post(
  "/my",
  requireRole("BUYER"),
  upload.single("file"),
  async (req: AuthedRequest, res) => {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const parsed = docTypeSchema.safeParse(req.body.docType);
    if (!parsed.success)
      return res.status(400).json({
        error: "Invalid docType. Must be ID_PROOF, ADDRESS_PROOF, or INCOME_PROOF.",
      });

    const doc = await BuyerDocument.create({
      buyerId:  req.user!.userId,
      docType:  parsed.data,
      fileName: req.file.originalname || path.basename(req.file.filename),
      fileUrl:  fileUrl(req.file.filename),
      status:   "UPLOADED",
    });

    res.status(201).json({ document: doc });
  }
);

/**
 * DELETE /api/documents/my/:id
 * Buyer deletes one of their own KYC documents.
 */
router.delete("/my/:id", requireRole("BUYER"), async (req: AuthedRequest, res) => {
  if (!mongoose.isValidObjectId(req.params.id))
    return res.status(400).json({ error: "Invalid document id" });

  const doc = await BuyerDocument.findOne({
    _id: req.params.id,
    buyerId: req.user!.userId,
  });
  if (!doc) return res.status(404).json({ error: "Document not found" });

  await doc.deleteOne();
  res.json({ success: true });
});

export default router;

import { Router, Request, Response } from "express";
import { zodMessage } from "../lib/validationError";
import { z } from "zod";
import fs from "fs";
import path from "path";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../config/db";
import { buyerDocuments, projects, sharedDocuments, users } from "../db/schema";
import { authenticate, requireRole, AuthedRequest } from "../middleware/auth";
import { upload, fileUrl } from "../services/uploadService";
import {
  privateUpload,
  privateRef,
  privateFilePath,
  presentBuyerDocUrl,
  verifyBuyerDocSignature,
} from "../services/privateFiles";
import { isValidId } from "../lib/ids";

/**
 * GET /api/documents/file/:id?exp=…&sig=… — stream one privately-stored buyer
 * document. The signed, expiring link is the authorization: it is only ever
 * issued to the document's owner (GET /my) or an admin. Mounted in app.ts
 * ahead of the authenticated routers because a plain link can't carry a Bearer
 * token. Never cached (`private, no-store`).
 */
export async function buyerDocFileHandler(req: Request, res: Response) {
  const id = String(req.params.id);
  if (!isValidId(id) || !verifyBuyerDocSignature(id, String(req.query.exp ?? ""), String(req.query.sig ?? ""))) {
    return res.status(403).json({ error: "This document link is invalid or has expired. Open it again from your documents list." });
  }

  const db = getDb();
  const [doc] = await db
    .select({ fileUrl: buyerDocuments.fileUrl, fileName: buyerDocuments.fileName })
    .from(buyerDocuments)
    .where(eq(buyerDocuments._id, id));
  const full = doc ? privateFilePath(doc.fileUrl) : null;
  if (!doc || !full || !fs.existsSync(full)) return res.status(404).json({ error: "Document not found" });

  const safeName = (doc.fileName || "document").replace(/[^\w.\- ]+/g, "_").slice(0, 100);
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Content-Disposition", `inline; filename="${safeName}"`);
  res.sendFile(full, { dotfiles: "deny" }, (err) => {
    if (err && !res.headersSent) res.status(404).json({ error: "Document not found" });
  });
}

const router = Router();
router.use(authenticate);

router.get("/shared", requireRole("BUYER"), async (_req: AuthedRequest, res) => {
  const db = getDb();
  const rows = await db
    .select({
      doc: sharedDocuments,
      project: { _id: projects._id, name: projects.name, approvalStatus: projects.approvalStatus },
      uploader: { _id: users._id, name: users.name, role: users.role },
    })
    .from(sharedDocuments)
    .leftJoin(projects, eq(sharedDocuments.projectId, projects._id))
    .leftJoin(users, eq(sharedDocuments.uploadedById, users._id))
    .orderBy(desc(sharedDocuments.createdAt));

  const approved = rows
    .filter((row) => row.project?.approvalStatus === "APPROVED")
    .map((row) => ({
      ...row.doc,
      projectId: row.project ? { _id: row.project._id, name: row.project.name, approvalStatus: row.project.approvalStatus } : null,
      uploadedById: row.uploader ? { _id: row.uploader._id, name: row.uploader.name, role: row.uploader.role } : null,
    }));

  const synthetic: object[] = [];
  const approvedProjects = await db.select({ _id: projects._id, name: projects.name, brochureUrl: projects.brochureUrl, priceListUrl: projects.priceListUrl }).from(projects).where(eq(projects.approvalStatus, "APPROVED"));
  for (const p of approvedProjects) {
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
        fileType: "PRICE_LIST",
        fileUrl: p.priceListUrl,
        fileName: "Price List",
        createdAt: null,
      });
    }
  }

  res.json({ documents: [...approved, ...synthetic] });
});

router.post(
  "/shared",
  requireRole("DEVELOPER", "ADMIN"),
  upload.single("file"),
  async (req: AuthedRequest, res) => {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const parsed = z
      .object({
        projectId: z.string().min(1),
        fileType: z.enum(["BROCHURE", "FLOOR_PLAN", "PRICE_LIST", "LEGAL", "OTHER"]).optional().default("OTHER"),
        description: z.string().optional(),
      })
      .safeParse(req.body);

    if (!parsed.success) return res.status(400).json({ error: zodMessage(parsed.error), issues: parsed.error.flatten() });
    if (!isValidId(parsed.data.projectId)) return res.status(400).json({ error: "Invalid projectId" });

    const db = getDb();
    const [project] = await db.select().from(projects).where(eq(projects._id, parsed.data.projectId));
    if (!project) return res.status(404).json({ error: "Project not found" });

    const [doc] = await db
      .insert(sharedDocuments)
      .values({
        projectId: parsed.data.projectId,
        uploadedById: req.user!.userId,
        fileName: req.file.originalname || path.basename(req.file.filename),
        fileUrl: fileUrl(req.file.filename),
        fileType: parsed.data.fileType,
        description: parsed.data.description,
      })
      .returning();

    res.status(201).json({ document: doc });
  }
);

router.get("/my", requireRole("BUYER"), async (req: AuthedRequest, res) => {
  const db = getDb();
  const docs = await db.select().from(buyerDocuments).where(eq(buyerDocuments.buyerId, req.user!.userId)).orderBy(desc(buyerDocuments.createdAt));
  // Private files get a fresh signed link; legacy public files keep their URL.
  res.json({ documents: docs.map((d) => ({ ...d, fileUrl: presentBuyerDocUrl(d._id, d.fileUrl) })) });
});

const docTypeSchema = z.enum(["ID_PROOF", "ADDRESS_PROOF", "INCOME_PROOF"]);

router.post(
  "/my",
  requireRole("BUYER"),
  // Identity / address / income proofs are stored privately — never under the
  // public, CDN-cached /uploads path.
  privateUpload.single("file"),
  async (req: AuthedRequest, res) => {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const parsed = docTypeSchema.safeParse(req.body.docType);
    if (!parsed.success) {
      // Don't leave an orphaned private file behind on a rejected request.
      fs.promises.unlink(req.file.path).catch(() => {});
      return res.status(400).json({ error: "Invalid docType. Must be ID_PROOF, ADDRESS_PROOF, or INCOME_PROOF." });
    }

    const db = getDb();
    const [doc] = await db
      .insert(buyerDocuments)
      .values({
        buyerId: req.user!.userId,
        docType: parsed.data,
        fileName: req.file.originalname || path.basename(req.file.filename),
        fileUrl: privateRef(req.file.filename),
        status: "UPLOADED",
      })
      .returning();

    res.status(201).json({ document: { ...doc, fileUrl: presentBuyerDocUrl(doc._id, doc.fileUrl) } });
  }
);

router.delete("/my/:id", requireRole("BUYER"), async (req: AuthedRequest, res) => {
  if (!isValidId(req.params.id)) return res.status(400).json({ error: "Invalid document id" });

  const db = getDb();
  const [doc] = await db.delete(buyerDocuments).where(and(eq(buyerDocuments._id, req.params.id), eq(buyerDocuments.buyerId, req.user!.userId))).returning();

  if (!doc) return res.status(404).json({ error: "Document not found" });
  // Remove the stored file too, so a deleted identity document is really gone.
  const full = privateFilePath(doc.fileUrl);
  if (full) fs.promises.unlink(full).catch(() => {});
  res.json({ success: true });
});

export default router;

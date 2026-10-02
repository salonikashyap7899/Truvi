import { Router } from "express";
import { desc, eq, inArray } from "drizzle-orm";
import { getDb } from "../config/db";
import {
  academyContent, commissions, leads, legalDocuments, projectAssets, projects, sharedDocuments, users,
} from "../db/schema";
import { authenticate, AuthedRequest } from "../middleware/auth";

/**
 * Document Vault — one place for every document a user is allowed to see.
 * Role-scoped:
 *   ADMIN     → all legal docs, all project assets, all shared docs,
 *               all commission invoices, all academy PDFs.
 *   DEVELOPER → docs belonging to their own projects + academy PDFs.
 *   CP        → shared docs on approved projects, their own commission
 *               invoices + academy PDFs.
 * Private KYC identity images are deliberately excluded — they are
 * data-retention-minimised and never surfaced through the vault.
 */
const router = Router();
router.use(authenticate);

export interface VaultDoc {
  id: string;
  category: "LEGAL" | "PROJECT_ASSET" | "SHARED" | "INVOICE" | "LEARNING";
  title: string;
  fileName?: string | null;
  url: string;
  project?: string | null;
  verified?: boolean | null;
  uploadedAt: string;
}

router.get("/", async (req: AuthedRequest, res) => {
  const user = req.user!;
  const db = getDb();
  const docs: VaultDoc[] = [];

  // Resolve which projects this user can see documents for.
  let projectScope: { _id: string; name: string }[] = [];
  if (user.role === "ADMIN") {
    projectScope = await db.select({ _id: projects._id, name: projects.name }).from(projects);
  } else if (user.role === "DEVELOPER") {
    projectScope = await db
      .select({ _id: projects._id, name: projects.name })
      .from(projects)
      .where(eq(projects.developerId, user.userId));
  } else {
    // CPs (and other roles) see docs on approved, live projects only.
    projectScope = await db
      .select({ _id: projects._id, name: projects.name })
      .from(projects)
      .where(eq(projects.approvalStatus, "APPROVED"));
  }
  const projectIds = projectScope.map((p) => p._id);
  const nameById = new Map(projectScope.map((p) => [String(p._id), p.name]));

  if (projectIds.length > 0) {
    // Legal documents. Non-admins only see verified ones.
    const legal = await db
      .select()
      .from(legalDocuments)
      .where(inArray(legalDocuments.projectId, projectIds))
      .orderBy(desc(legalDocuments.createdAt));
    for (const d of legal) {
      if (user.role !== "ADMIN" && !d.verified) continue;
      docs.push({
        id: `legal-${d._id}`,
        category: "LEGAL",
        title: d.title,
        fileName: d.fileName,
        url: d.fileUrl,
        project: nameById.get(String(d.projectId)) ?? null,
        verified: d.verified,
        uploadedAt: d.createdAt.toISOString(),
      });
    }

    // Project assets (brochures, floor plans, approvals…). Same verified gate.
    const assets = await db
      .select()
      .from(projectAssets)
      .where(inArray(projectAssets.projectId, projectIds))
      .orderBy(desc(projectAssets.createdAt));
    for (const a of assets) {
      if (user.role !== "ADMIN" && !a.verified) continue;
      docs.push({
        id: `asset-${a._id}`,
        category: "PROJECT_ASSET",
        title: a.title,
        fileName: a.fileName,
        url: a.fileUrl,
        project: nameById.get(String(a.projectId)) ?? null,
        verified: a.verified,
        uploadedAt: a.createdAt.toISOString(),
      });
    }

    // Shared documents (price lists, brochures shared with partners).
    const shared = await db
      .select()
      .from(sharedDocuments)
      .where(inArray(sharedDocuments.projectId, projectIds))
      .orderBy(desc(sharedDocuments.createdAt));
    for (const s of shared) {
      docs.push({
        id: `shared-${s._id}`,
        category: "SHARED",
        title: s.description || s.fileName,
        fileName: s.fileName,
        url: s.fileUrl,
        project: nameById.get(String(s.projectId)) ?? null,
        uploadedAt: s.createdAt.toISOString(),
      });
    }
  }

  // Commission invoices — admin sees all; CP sees own; developer sees own projects'.
  const invoiceRows = await db
    .select({ commission: commissions, lead: leads, cp: { name: users.name } })
    .from(commissions)
    .leftJoin(leads, eq(commissions.leadId, leads._id))
    .leftJoin(users, eq(commissions.cpId, users._id))
    .orderBy(desc(commissions.createdAt));
  for (const { commission: c, lead, cp } of invoiceRows) {
    if (!c.invoiceUrl) continue;
    if (user.role === "CP" && String(c.cpId) !== user.userId) continue;
    if (user.role === "DEVELOPER" && (!lead || !nameById.has(String(lead.projectId)))) continue;
    docs.push({
      id: `invoice-${c._id}`,
      category: "INVOICE",
      title: `Invoice — ${lead?.clientName ?? "booking"}${cp?.name ? ` (CP: ${cp.name})` : ""}`,
      url: c.invoiceUrl,
      project: lead ? nameById.get(String(lead.projectId)) ?? null : null,
      uploadedAt: c.createdAt.toISOString(),
    });
  }

  // Learning PDFs — available to every authenticated role.
  const learning = await db
    .select()
    .from(academyContent)
    .where(eq(academyContent.type, "PDF"))
    .orderBy(desc(academyContent.createdAt));
  for (const l of learning) {
    docs.push({
      id: `learning-${l._id}`,
      category: "LEARNING",
      title: l.title,
      url: l.url,
      project: null,
      uploadedAt: l.createdAt.toISOString(),
    });
  }

  docs.sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
  res.json({ docs });
});

export default router;

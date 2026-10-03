/**
 * One-time migration: move buyer documents (ID / address / income proofs)
 * uploaded BEFORE private storage existed off the public /uploads path and into
 * the private, signed-link-only store.
 *
 * DRY RUN by default — it only reports what it would do. Nothing changes until
 * you re-run with --apply:
 *
 *   cd server
 *   npm run db:private-docs              # dry run: list what would move
 *   npm run db:private-docs -- --apply   # actually move the files
 *
 * Per document, in a crash-safe order: copy the file into private storage →
 * point the DB row at the private copy → only then delete the public original
 * (plus any `.thumb.` sibling the thumbnail job made). If the DB update fails,
 * the private copy is removed and the original is left untouched. Safe to
 * re-run: rows already moved are skipped.
 *
 * AFTER --apply: purge the Cloudflare cache for /uploads/ (the old URLs were
 * served with a one-year public cache, so edge copies can outlive the files).
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { eq, not, like } from "drizzle-orm";
import { connectDb, closeDb } from "../db/index";
import { buyerDocuments } from "../db/schema";
import { PRIVATE_UPLOAD_DIR, privateRef } from "../services/privateFiles";

const APPLY = process.argv.includes("--apply");

// Same resolution as services/uploadService.ts, where these files were written.
const PUBLIC_UPLOAD_DIR = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.resolve(__dirname, "../../uploads");

const SAFE_EXT: Record<string, string> = { ".pdf": ".pdf", ".jpg": ".jpg", ".jpeg": ".jpg", ".png": ".png", ".webp": ".webp" };

/** The bare filename a legacy `…/uploads/<name>` URL points at, or null. */
function legacyFilename(url: string): string | null {
  try {
    const pathname = url.startsWith("http") ? new URL(url).pathname : url;
    const idx = pathname.indexOf("/uploads/");
    if (idx === -1) return null;
    const name = path.basename(decodeURIComponent(pathname.slice(idx + "/uploads/".length)));
    return name && !name.startsWith(".") ? name : null;
  } catch {
    return null;
  }
}

function thumbSibling(fullPath: string): string {
  const ext = path.extname(fullPath);
  return fullPath.slice(0, fullPath.length - ext.length) + ".thumb" + ext;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required (set it in server/.env).");
  const db = connectDb(url);

  console.log(`Mode: ${APPLY ? "APPLY (files will be moved)" : "DRY RUN (no changes — add --apply to migrate)"}`);
  console.log(`Public uploads dir : ${PUBLIC_UPLOAD_DIR}`);
  console.log(`Private storage dir: ${PRIVATE_UPLOAD_DIR}\n`);

  const rows = await db
    .select({ _id: buyerDocuments._id, fileUrl: buyerDocuments.fileUrl })
    .from(buyerDocuments)
    .where(not(like(buyerDocuments.fileUrl, "private:%")));

  let moved = 0;
  let missing = 0;
  let skipped = 0;

  for (const row of rows) {
    const name = legacyFilename(row.fileUrl);
    const source = name ? path.join(PUBLIC_UPLOAD_DIR, name) : null;
    if (!name || !source || !source.startsWith(PUBLIC_UPLOAD_DIR + path.sep)) {
      skipped++;
      console.log(`  skip    ${row._id}  (not a /uploads URL)`);
      continue;
    }
    if (!fs.existsSync(source)) {
      missing++;
      console.log(`  missing ${row._id}  (file not on disk: ${name})`);
      continue;
    }

    const ext = SAFE_EXT[path.extname(name).toLowerCase()] ?? "";
    const newName = `${crypto.randomUUID()}${ext}`;
    const dest = path.join(PRIVATE_UPLOAD_DIR, newName);

    if (!APPLY) {
      moved++;
      console.log(`  would move ${row._id}  ${name} → private`);
      continue;
    }

    fs.copyFileSync(source, dest, fs.constants.COPYFILE_EXCL);
    try {
      await db.update(buyerDocuments).set({ fileUrl: privateRef(newName) }).where(eq(buyerDocuments._id, row._id));
    } catch (err) {
      fs.rmSync(dest, { force: true });
      console.log(`  FAILED  ${row._id}  (DB update failed; original left in place): ${err instanceof Error ? err.message : err}`);
      continue;
    }
    fs.rmSync(source, { force: true });
    fs.rmSync(thumbSibling(source), { force: true });
    moved++;
    console.log(`  moved   ${row._id}  ${name} → private`);
  }

  console.log(
    `\n${APPLY ? "Moved" : "Would move"}: ${moved}   Missing on disk: ${missing}   Skipped: ${skipped}   (of ${rows.length} legacy rows)`,
  );
  if (APPLY && moved > 0) {
    console.log("\nNext: purge the Cloudflare cache for /uploads/ so edge copies of the old public URLs are dropped too.");
  }
}

main()
  .catch((err) => {
    console.error("Migration failed:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());

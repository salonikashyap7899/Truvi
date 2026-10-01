/**
 * One-off batch generator for thumbnails of images already on disk.
 *
 * New uploads get a thumbnail automatically (services/media/thumbnail.ts), but
 * images uploaded before this feature have none. This walks the uploads folder
 * and creates the small sibling `NAME.thumb.ext` for every gallery image so the
 * listing/search cards load the light version.
 *
 *   /uploads/1790-123.jpeg  →  /uploads/1790-123.thumb.jpeg  (~800px, ~50-90 kB)
 *
 * Safe + idempotent:
 *   - Never touches or deletes the original image.
 *   - Skips files that are already thumbnails (*.thumb.ext).
 *   - Skips an image whose thumbnail already exists (pass --force to rebuild).
 *   - Any file that can't be processed is skipped and logged, never fatal.
 *
 * Usage (from the server/ folder):
 *     node scripts/generate-thumbnails.mjs ../uploads
 *     node scripts/generate-thumbnails.mjs ../uploads --force
 */
import fs from "fs";
import path from "path";
import sharp from "sharp";

const THUMB_MAX = 800;
const SUFFIX = ".thumb";
const RASTER = new Set([".jpg", ".jpeg", ".png", ".webp"]);

const args = process.argv.slice(2);
const force = args.includes("--force");
const argDir = args.find((a) => !a.startsWith("--"));

const candidates = [
  argDir,
  process.env.UPLOAD_DIR,
  path.resolve(process.cwd(), "../uploads"),
  path.resolve(process.cwd(), "uploads"),
].filter(Boolean);

const uploadsDir = candidates.find((d) => {
  try { return fs.statSync(d).isDirectory(); } catch { return false; }
});

if (!uploadsDir) {
  console.error("Could not find an uploads directory. Pass it explicitly:");
  console.error("  node scripts/generate-thumbnails.mjs /path/to/uploads");
  process.exit(1);
}

console.log(`Generating thumbnails in: ${uploadsDir}${force ? "  (force rebuild)" : ""}\n`);

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

function human(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} kB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function isThumb(file) {
  const ext = path.extname(file);
  return path.basename(file, ext).endsWith(SUFFIX);
}

function thumbPathFor(file) {
  const dir = path.dirname(file);
  const ext = path.extname(file);
  const base = path.basename(file, ext);
  return path.join(dir, `${base}${SUFFIX}${ext}`);
}

const files = walk(uploadsDir).filter(
  (f) => RASTER.has(path.extname(f).toLowerCase()) && !isThumb(f),
);
console.log(`Found ${files.length} source image(s).\n`);

let made = 0, skipped = 0, failed = 0, total = 0;

for (const file of files) {
  const out = thumbPathFor(file);
  if (!force && fs.existsSync(out)) { skipped++; continue; }

  const ext = path.extname(file).toLowerCase();
  try {
    let pipe = sharp(file, { failOn: "none" }).rotate()
      .resize({ width: THUMB_MAX, height: THUMB_MAX, fit: "inside", withoutEnlargement: true });
    if (ext === ".png") pipe = pipe.png({ compressionLevel: 9, palette: true });
    else if (ext === ".webp") pipe = pipe.webp({ quality: 70 });
    else pipe = pipe.jpeg({ quality: 70, mozjpeg: true });

    const buf = await pipe.toBuffer();
    if (buf.length > 0) {
      fs.writeFileSync(out, buf);
      made++;
      total += buf.length;
      console.log(`  ✓ ${path.basename(out)}  (${human(buf.length)})`);
    } else {
      failed++;
    }
  } catch (err) {
    failed++;
    console.warn(`  ! skipped ${path.basename(file)} — ${err?.message ?? err}`);
  }
}

console.log(`\nDone.`);
console.log(`  Thumbnails created: ${made}`);
console.log(`  Already had one (skipped): ${skipped}`);
console.log(`  Failed/skipped: ${failed}`);
if (made > 0) console.log(`  Total thumbnail size: ${human(total)} (avg ${human(Math.round(total / made))})`);

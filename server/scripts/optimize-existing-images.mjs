/**
 * One-off batch optimizer for images already on disk in the uploads directory.
 *
 * New uploads are optimized automatically (services/media/optimizeImage.ts),
 * but images uploaded BEFORE that was added are still full-size — which makes
 * listing pages download several MB and feel slow. This script walks the
 * uploads folder once and re-compresses every raster image in place:
 *   - resized to fit within 2000x2000 (never enlarged)
 *   - re-encoded at a sensible quality (JPEG q75 mozjpeg / PNG level 9 /
 *     WebP q78)
 *   - the file is overwritten ONLY if the result is actually smaller, so
 *     running it twice is safe and already-small images are left untouched.
 *
 * It is fail-safe: any file that can't be processed is skipped and logged,
 * never deleted or corrupted. SVGs and non-images are ignored.
 *
 * Usage (on the server, from the server/ folder):
 *     node scripts/optimize-existing-images.mjs <uploads-dir>
 *   e.g.
 *     node scripts/optimize-existing-images.mjs ../uploads
 *
 * If no path is given it tries ../uploads (the default location) and the
 * UPLOAD_DIR env var.
 */
import fs from "fs";
import path from "path";
import sharp from "sharp";

const MAX = 2000;
const RASTER = new Set([".jpg", ".jpeg", ".png", ".webp"]);

const argDir = process.argv[2];
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
  console.error("  node scripts/optimize-existing-images.mjs /path/to/uploads");
  process.exit(1);
}

console.log(`Optimizing images in: ${uploadsDir}\n`);

/** Recursively collect every file under a directory. */
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

const files = walk(uploadsDir).filter((f) => RASTER.has(path.extname(f).toLowerCase()));
console.log(`Found ${files.length} image(s).\n`);

let optimized = 0, skipped = 0, failed = 0, before = 0, after = 0;

for (const file of files) {
  const ext = path.extname(file).toLowerCase();
  let origSize;
  try {
    origSize = fs.statSync(file).size;
  } catch {
    failed++; continue;
  }

  try {
    let pipe = sharp(file, { failOn: "none" }).rotate();
    pipe = pipe.resize({ width: MAX, height: MAX, fit: "inside", withoutEnlargement: true });
    if (ext === ".png") pipe = pipe.png({ compressionLevel: 9, palette: true });
    else if (ext === ".webp") pipe = pipe.webp({ quality: 78 });
    else pipe = pipe.jpeg({ quality: 75, mozjpeg: true });

    const buf = await pipe.toBuffer();

    if (buf.length < origSize) {
      fs.writeFileSync(file, buf);
      optimized++;
      before += origSize;
      after += buf.length;
      console.log(`  ✓ ${path.basename(file)}  ${human(origSize)} → ${human(buf.length)}`);
    } else {
      skipped++; // already small enough
    }
  } catch (err) {
    failed++;
    console.warn(`  ! skipped ${path.basename(file)} — ${err?.message ?? err}`);
  }
}

console.log(`\nDone.`);
console.log(`  Optimized: ${optimized}`);
console.log(`  Already small (left as-is): ${skipped}`);
console.log(`  Failed/skipped: ${failed}`);
if (optimized > 0) {
  console.log(`  Saved: ${human(before - after)}  (${human(before)} → ${human(after)}, -${Math.round((1 - after / before) * 100)}%)`);
}

import fs from "fs";
import path from "path";

/**
 * Fail-safe, in-place image optimizer for freshly-uploaded photos.
 *
 * Property photos (gallery images, renders, project covers) are the single
 * biggest thing on the page and come straight off the VPS disk. This shrinks
 * them once, at upload time, so every later page load is smaller and faster —
 * without a CDN and without touching how images are stored or served.
 *
 * Design guarantees (so an existing upload can NEVER break):
 *  - Same file path / filename / extension → same public URL, same DB row.
 *  - Only JPEG / PNG / WebP are touched. PDFs, SVG, GIF, video, CAD, docs and
 *    everything else are left exactly as-is.
 *  - `sharp` is loaded lazily and optionally: if it isn't installed, or fails
 *    for any reason, the ORIGINAL file is kept untouched and we return quietly.
 *  - The image is fully decoded into a buffer before the original is
 *    overwritten, so there is no read/write race on the same path.
 */

const RASTER_EXT = new Set([".jpg", ".jpeg", ".png", ".webp"]);
// Big enough to stay crisp on a 4K/retina screen, small enough to cut most
// oversized phone-camera uploads (often 4000–6000px) down hard.
const MAX_WIDTH = 2000;
const MAX_HEIGHT = 2000;

function looksLikeImage(filePath: string, mimeType?: string): boolean {
  if (mimeType && !mimeType.startsWith("image/")) return false;
  return RASTER_EXT.has(path.extname(filePath).toLowerCase());
}

/**
 * Optimize an uploaded image in place. Best-effort: on any problem the original
 * file is preserved and we simply return. Never throws.
 * @returns the file's size in bytes after processing (or the original size).
 */
export async function optimizeUploadedImage(filePath: string, mimeType?: string): Promise<number> {
  const originalSize = safeSize(filePath);
  if (!looksLikeImage(filePath, mimeType)) return originalSize;

  let sharp: typeof import("sharp");
  try {
    // Lazy, optional require so the server still boots/builds if sharp is absent.
    sharp = (await import("sharp")).default as unknown as typeof import("sharp");
  } catch {
    return originalSize; // sharp not installed → leave the original file as-is
  }

  try {
    const ext = path.extname(filePath).toLowerCase();
    // `.rotate()` with no args bakes in EXIF orientation then strips it, so a
    // portrait phone photo is not shown sideways once metadata is dropped.
    let pipeline = sharp(filePath, { failOn: "none" })
      .rotate()
      .resize({ width: MAX_WIDTH, height: MAX_HEIGHT, fit: "inside", withoutEnlargement: true });

    // Re-encode in the SAME format the filename already advertises, so the URL
    // and extension the app stored stay valid.
    if (ext === ".png") {
      pipeline = pipeline.png({ compressionLevel: 9, palette: true });
    } else if (ext === ".webp") {
      pipeline = pipeline.webp({ quality: 80 });
    } else {
      pipeline = pipeline.jpeg({ quality: 80, mozjpeg: true });
    }

    const optimized = await pipeline.toBuffer();

    // Only overwrite when we actually saved space; never make a file bigger.
    if (optimized.length > 0 && optimized.length < originalSize) {
      await fs.promises.writeFile(filePath, optimized);
      return optimized.length;
    }
    return originalSize;
  } catch {
    // Corrupt image, unsupported variant, disk error — keep the original.
    return originalSize;
  }
}

function safeSize(filePath: string): number {
  try {
    return fs.statSync(filePath).size;
  } catch {
    return 0;
  }
}

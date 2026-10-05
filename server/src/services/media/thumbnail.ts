import fs from "fs";
import path from "path";

/**
 * Thumbnail generation for uploaded gallery images.
 *
 * Listing/search cards only need a small preview, but they were loading the
 * full-size image (hundreds of KB each). This creates a tiny sibling file next
 * to the original so the grid can request the light version and fall back to
 * the full image automatically if a thumbnail doesn't exist yet.
 *
 * Naming convention (shared with the client's `thumbUrl` helper):
 *     /uploads/1790-123.jpeg   →   /uploads/1790-123.thumb.jpeg
 * Same folder, same extension, so it's served and cached exactly like any
 * other upload and needs no API or schema change.
 *
 * Guarantees:
 *  - Only JPEG / PNG / WebP are thumbnailed. Everything else is ignored.
 *  - A file that is itself already a thumbnail (`*.thumb.ext`) is skipped, so
 *    we never make thumbnails of thumbnails.
 *  - `sharp` is loaded lazily; if it's missing or fails for any reason, we
 *    return quietly and the original image is untouched. Never throws.
 *  - The original image is never read-for-write or modified here.
 */

const RASTER_EXT = new Set([".jpg", ".jpeg", ".png", ".webp"]);
// Wide enough to look crisp on a retina listing card (cards render ~300–400px,
// 2x = ~800px), small enough to be ~50–90 KB.
const THUMB_MAX = 800;
export const THUMB_SUFFIX = ".thumb";

/** True when a filename is itself a generated thumbnail. */
export function isThumbName(filePath: string): boolean {
  const ext = path.extname(filePath);
  const base = path.basename(filePath, ext);
  return base.endsWith(THUMB_SUFFIX);
}

/** Map an original file path to its thumbnail sibling path. */
export function thumbPathFor(filePath: string): string {
  const dir = path.dirname(filePath);
  const ext = path.extname(filePath);
  const base = path.basename(filePath, ext);
  return path.join(dir, `${base}${THUMB_SUFFIX}${ext}`);
}

function looksLikeImage(filePath: string, mimeType?: string): boolean {
  if (mimeType && !mimeType.startsWith("image/")) return false;
  return RASTER_EXT.has(path.extname(filePath).toLowerCase());
}

/**
 * Generate (or overwrite) the thumbnail for an uploaded image. Best-effort:
 * on any problem nothing is written and no error is thrown.
 * @returns the thumbnail path when one was written, else null.
 */
export async function generateThumbnail(filePath: string, mimeType?: string): Promise<string | null> {
  if (!looksLikeImage(filePath, mimeType)) return null;
  if (isThumbName(filePath)) return null; // never thumbnail a thumbnail

  let sharp: typeof import("sharp").default;
  try {
    sharp = (await import("sharp")).default as unknown as typeof import("sharp").default;
  } catch {
    return null; // sharp not installed → skip quietly
  }

  try {
    const ext = path.extname(filePath).toLowerCase();
    let pipeline = sharp(filePath, { failOn: "none" })
      .rotate()
      .resize({ width: THUMB_MAX, height: THUMB_MAX, fit: "inside", withoutEnlargement: true });

    if (ext === ".png") pipeline = pipeline.png({ compressionLevel: 9, palette: true });
    else if (ext === ".webp") pipeline = pipeline.webp({ quality: 70 });
    else pipeline = pipeline.jpeg({ quality: 70, mozjpeg: true });

    const buf = await pipeline.toBuffer();
    if (buf.length <= 0) return null;

    const out = thumbPathFor(filePath);
    await fs.promises.writeFile(out, buf);
    return out;
  } catch {
    return null; // corrupt/unsupported/disk error — leave things as they are
  }
}

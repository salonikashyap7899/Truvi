/**
 * Derive the thumbnail URL for an uploaded image.
 *
 * The server writes a small sibling file next to each gallery image using the
 * convention `NAME.ext` → `NAME.thumb.ext` (see server/services/media/
 * thumbnail.ts). Listing/search cards request the thumbnail for a much lighter
 * page, and fall back to the full image (via the <img> onError handler) if a
 * thumbnail hasn't been generated yet.
 *
 * Only our own uploaded raster images are rewritten. External URLs, videos,
 * data URIs, and anything that isn't a /uploads image are returned unchanged,
 * so this is always safe to call.
 */
const RASTER = /\.(jpe?g|png|webp)(\?.*)?$/i;

export function thumbUrl(url: string | null | undefined): string {
  if (!url) return url ?? "";
  if (!url.includes("/uploads/")) return url; // not one of our uploaded files
  if (/\.thumb\.(jpe?g|png|webp)(\?.*)?$/i.test(url)) return url; // already a thumb
  if (!RASTER.test(url)) return url; // not a raster image (e.g. a video/pdf)
  // Insert ".thumb" right before the extension, preserving any ?query.
  // `ext` is captured without its dot (e.g. "jpeg"), so rebuild as ".thumb.jpeg".
  return url.replace(RASTER, (_m, ext: string, query?: string) => `.thumb.${ext}${query ?? ""}`);
}

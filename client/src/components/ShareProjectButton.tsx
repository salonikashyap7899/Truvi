import { Share2 } from "lucide-react";
import { toast } from "sonner";
import type { Project } from "@/types";

/**
 * Share a property listing. Uses the device's native share sheet
 * (navigator.share → WhatsApp, Telegram, Email, SMS, Facebook, X, Copy Link,
 * and any other installed app). Falls back to copy-to-clipboard, then WhatsApp,
 * on browsers without the Web Share API.
 */

/** Public presentation link for a listing. */
export function shareUrl(project: Project): string {
  return `${window.location.origin}/inventory/${project._id}/presentation`;
}

/** Buyer-friendly summary — headline facts only (no full spec sheet). */
function shareSummary(project: Project): string {
  const lines: string[] = [];
  lines.push(`🏡 *${project.name}*`);
  lines.push(`📍 ${project.location}, ${project.city}`);

  const devName = typeof project.developerId === "object" && project.developerId
    ? (project.developerId as { name?: string }).name
    : null;
  if (devName) lines.push(`🏗 By ${devName}`);

  if (project.isVerified) lines.push(`✅ Truvi Verified`);
  if (project.reraNumber) lines.push(`📄 RERA: ${project.reraNumber}`);
  if (project.minRate) lines.push(`💰 From ₹${project.minRate.toLocaleString("en-IN")}/sq ft`);
  if (typeof project.unitCount === "number" && project.unitCount > 0) {
    lines.push(`🔑 ${project.unitCount} unit${project.unitCount === 1 ? "" : "s"} available`);
  }
  return lines.join("\n");
}

/** Full text (summary + link) — used by the copy / WhatsApp fallbacks. */
export function buildProjectShareText(project: Project): string {
  return `${shareSummary(project)}\n\nView full details:\n${shareUrl(project)}`;
}

export function shareProjectOnWhatsApp(project: Project) {
  const url = `https://wa.me/?text=${encodeURIComponent(buildProjectShareText(project))}`;
  window.open(url, "_blank", "noopener,noreferrer");
}

/** Fetch the cover photo as a shareable File, or null if unavailable/unsupported. */
async function coverImageFile(project: Project): Promise<File | null> {
  if (!project.coverImageUrl || typeof navigator === "undefined" || typeof navigator.canShare !== "function") return null;
  try {
    const res = await fetch(project.coverImageUrl);
    if (!res.ok) return null;
    const blob = await res.blob();
    const ext = (blob.type.split("/")[1] || "jpg").split("+")[0];
    const file = new File([blob], `${project.name.replace(/[^\w]+/g, "-").slice(0, 40) || "property"}.${ext}`, { type: blob.type });
    return navigator.canShare({ files: [file] }) ? file : null;
  } catch {
    return null; // CORS / fetch / conversion failed → share text-only
  }
}

/** Open the native share sheet for a listing (with graceful fallbacks). */
export async function shareProject(project: Project) {
  const url = shareUrl(project);
  const text = shareSummary(project);
  if (typeof navigator !== "undefined" && navigator.share) {
    const file = await coverImageFile(project);
    try {
      await navigator.share(file ? { title: project.name, text, url, files: [file] } : { title: project.name, text, url });
      return;
    } catch (err) {
      // User dismissed the sheet — do nothing. Only fall back on real errors.
      if ((err as Error)?.name === "AbortError") return;
    }
  }
  try {
    await navigator.clipboard.writeText(buildProjectShareText(project));
    toast.success("Property details copied — paste to share anywhere");
  } catch {
    shareProjectOnWhatsApp(project);
  }
}

/** Share pill used on listing cards. */
export default function ShareProjectButton({ project, className }: { project: Project; className?: string }) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        shareProject(project);
      }}
      title="Share this property"
      className={
        className ??
        "group/btn flex w-full items-center justify-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-5 py-2.5 text-sm font-medium text-emerald-200 transition-all hover:border-emerald-400/60 hover:bg-emerald-500/20 hover:shadow-[0_0_24px_rgba(16,185,129,0.2)]"
      }
    >
      <Share2 size={15} />
      Share
    </button>
  );
}

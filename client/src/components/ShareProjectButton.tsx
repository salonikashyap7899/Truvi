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

/** Open the native share sheet for a listing (with graceful fallbacks). */
export async function shareProject(project: Project) {
  const url = shareUrl(project);
  if (typeof navigator !== "undefined" && navigator.share) {
    try {
      await navigator.share({ title: project.name, text: shareSummary(project), url });
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

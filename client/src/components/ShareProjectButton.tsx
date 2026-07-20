import type { Project } from "@/types";

/**
 * WhatsApp share for a project listing. Builds a short, buyer-friendly
 * summary — headline facts only, never the full spec sheet — plus a link
 * back to the project presentation page.
 */
export function buildProjectShareText(project: Project): string {
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

  lines.push("");
  lines.push(`View full details:`);
  lines.push(`${window.location.origin}/inventory/${project._id}/presentation`);
  return lines.join("\n");
}

export function shareProjectOnWhatsApp(project: Project) {
  const url = `https://wa.me/?text=${encodeURIComponent(buildProjectShareText(project))}`;
  window.open(url, "_blank", "noopener,noreferrer");
}

/** Small WhatsApp-green share pill used on listing cards. */
export default function ShareProjectButton({ project, className }: { project: Project; className?: string }) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        shareProjectOnWhatsApp(project);
      }}
      title="Share on WhatsApp"
      className={
        className ??
        "group/btn flex w-full items-center justify-between rounded-full border border-emerald-400/30 bg-emerald-500/10 px-5 py-2.5 text-sm font-medium text-emerald-200 transition-all hover:border-emerald-400/60 hover:bg-emerald-500/20 hover:shadow-[0_0_24px_rgba(16,185,129,0.2)]"
      }
    >
      <span className="flex items-center gap-2">
        <WhatsAppIcon />
        Share on WhatsApp
      </span>
    </button>
  );
}

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.52.149-.174.198-.298.297-.497.1-.198.05-.371-.025-.52-.074-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { X, Download, Maximize2, Loader2, FileText, ExternalLink } from "lucide-react";
import { toast } from "sonner";

/**
 * Embedded PDF brochure viewer. Streams the brochure from the authenticated
 * API as a blob and shows it in an in-app viewer (native scroll + zoom via the
 * browser's PDF engine), with fullscreen, download and close. The raw storage
 * URL is never exposed — the blob lives only in memory for this session.
 */
export default function BrochureViewer({
  projectId,
  projectName,
  onClose,
}: {
  projectId: string;
  projectName: string;
  onClose: () => void;
}) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Lock the page scroll behind the viewer.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Load the PDF as a blob (records a VIEW server-side).
  useEffect(() => {
    let revoked: string | null = null;
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .get(`/projects/${projectId}/brochure/view`, { responseType: "blob" })
      .then((res) => {
        if (cancelled) return;
        const url = URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
        revoked = url;
        setBlobUrl(url);
      })
      .catch((err: any) => {
        if (!cancelled) setError(err?.response?.status === 401 ? "Please sign in to view the brochure." : "Couldn't load the brochure.");
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => {
      cancelled = true;
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [projectId]);

  async function download() {
    setDownloading(true);
    try {
      const res = await api.get(`/projects/${projectId}/brochure/download`, { responseType: "blob" });
      const url = URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `Truvi_${(projectName || "Project").replace(/[^a-zA-Z0-9]+/g, "_")}_Brochure.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch {
      toast.error("Download failed. Please try again.");
    } finally {
      setDownloading(false);
    }
  }

  function goFullscreen() {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else el.requestFullscreen?.().catch(() => toast.error("Fullscreen isn't available here."));
  }

  return (
    <div className="fixed inset-0 z-[120] flex flex-col bg-black/80 backdrop-blur-sm">
      {/* Toolbar */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-white/10 bg-[#0a0d14]/95 px-4 py-3 text-white">
        <div className="flex min-w-0 items-center gap-2">
          <FileText size={16} className="shrink-0 text-sky-300" />
          <span className="truncate text-sm font-semibold">{projectName} — Brochure</span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button onClick={download} disabled={downloading || !blobUrl} className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold hover:bg-white/10 disabled:opacity-50">
            {downloading ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
            <span className="hidden sm:inline">Download</span>
          </button>
          <button onClick={goFullscreen} disabled={!blobUrl} className="grid size-8 place-items-center rounded-full border border-white/15 bg-white/5 hover:bg-white/10 disabled:opacity-50" title="Fullscreen">
            <Maximize2 size={14} />
          </button>
          <button onClick={onClose} className="grid size-8 place-items-center rounded-full border border-white/15 bg-white/5 hover:bg-white/10" aria-label="Close">
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Viewer */}
      <div ref={containerRef} className="relative flex-1 bg-[#11141b]">
        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white/70">
            <Loader2 size={22} className="animate-spin" />
            <p className="text-sm">Loading brochure…</p>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center text-white/70">
            <FileText size={26} className="text-white/40" />
            <p className="text-sm">{error}</p>
            <button onClick={onClose} className="rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-xs font-semibold text-white hover:bg-white/10">Close</button>
          </div>
        )}
        {blobUrl && !error && (
          <>
            <iframe title="Brochure" src={blobUrl} className="h-full w-full" />
            {/* Fallback for webviews that can't render an inline PDF. */}
            <a href={blobUrl} target="_blank" rel="noopener noreferrer" className="absolute bottom-4 right-4 inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-black/60 px-3 py-1.5 text-[11px] font-semibold text-white/80 backdrop-blur hover:bg-black/80 sm:hidden">
              <ExternalLink size={12} /> Open in new tab
            </a>
          </>
        )}
      </div>
    </div>
  );
}

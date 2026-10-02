import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { FileText, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import BrochureViewer from "@/components/BrochureViewer";

interface BrochureMeta {
  exists: boolean;
  fileName?: string;
  sizeBytes?: number;
}

/**
 * "View Brochure" / "Download Brochure" actions shown on a project/listing page.
 * The buttons only render once an admin has uploaded a brochure. Viewing opens
 * the embedded viewer; download streams the original PDF with a friendly name.
 */
export default function BrochureActions({ projectId, projectName, className = "" }: { projectId: string; projectName: string; className?: string }) {
  const [meta, setMeta] = useState<BrochureMeta | null>(null);
  const [open, setOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .get(`/projects/${projectId}/brochure`)
      .then((res) => { if (!cancelled) setMeta(res.data); })
      .catch(() => { if (!cancelled) setMeta({ exists: false }); });
    return () => { cancelled = true; };
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
    } catch (err: any) {
      toast.error(err?.response?.status === 401 ? "Please sign in to download the brochure." : "Download failed.");
    } finally {
      setDownloading(false);
    }
  }

  if (!meta?.exists) return null;

  return (
    <>
      <div className={`flex flex-wrap items-center gap-2 ${className}`}>
        <button
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-2 rounded-full bg-[var(--trust)] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--trust)]/85"
        >
          <FileText size={16} /> View Brochure
        </button>
        <button
          onClick={download}
          disabled={downloading}
          className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/[0.08] disabled:opacity-60"
        >
          {downloading ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />} Download
        </button>
      </div>
      {open && <BrochureViewer projectId={projectId} projectName={projectName} onClose={() => setOpen(false)} />}
    </>
  );
}

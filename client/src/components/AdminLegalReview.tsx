import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ShieldCheck, Clock, ExternalLink, FileText } from "lucide-react";

interface LegalDoc {
  _id: string;
  title: string;
  docType: string;
  fileUrl: string;
  verified: boolean;
}

/** Admin panel to verify a project's legal documents (controls public visibility). */
export default function AdminLegalReview({ projectId }: { projectId: string }) {
  const [docs, setDocs] = useState<LegalDoc[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  async function load() {
    try {
      const { data } = await api.get(`/legal/project/${projectId}`);
      setDocs(data.documents ?? []);
    } catch {
      /* ignore */
    } finally {
      setLoaded(true);
    }
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function setVerified(id: string, verified: boolean) {
    setBusy(id);
    try {
      const { data } = await api.patch(`/legal/${id}/verify`, { verified });
      setDocs((prev) => prev.map((d) => (d._id === id ? data.document : d)));
      toast.success(verified ? "Verified — now public" : "Verification removed — hidden from public");
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed");
    } finally {
      setBusy(null);
    }
  }

  if (loaded && docs.length === 0) {
    return <p className="text-xs text-muted-foreground">No legal documents uploaded for this project.</p>;
  }

  return (
    <div className="space-y-2">
      {docs.map((d) => (
        <div key={d._id} className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-2.5">
          <div className="flex min-w-0 items-center gap-2">
            <FileText size={14} className="shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <p className="truncate text-sm text-white">{d.title}</p>
              <p className="text-[11px] text-muted-foreground">{d.docType}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <a href={d.fileUrl} target="_blank" rel="noreferrer" className="rounded-lg border border-white/15 p-1.5 text-muted-foreground hover:bg-white/10 hover:text-white">
              <ExternalLink size={13} />
            </a>
            {d.verified ? (
              <Button size="sm" variant="outline" disabled={busy === d._id} onClick={() => setVerified(d._id, false)} className="border-emerald-700 text-emerald-300">
                <ShieldCheck size={12} className="mr-1" /> Verified
              </Button>
            ) : (
              <Button size="sm" disabled={busy === d._id} onClick={() => setVerified(d._id, true)} className="bg-amber-600 text-white hover:bg-amber-500">
                <Clock size={12} className="mr-1" /> Verify
              </Button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

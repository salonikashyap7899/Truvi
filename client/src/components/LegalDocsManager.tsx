import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/primitives";
import { toast } from "sonner";
import { ShieldCheck, Clock, Trash2, FileText, ExternalLink, Loader2, Upload } from "lucide-react";

interface LegalDoc {
  _id: string;
  title: string;
  docType: string;
  fileUrl: string;
  fileName: string;
  verified: boolean;
  verifiedAt?: string | null;
  createdAt: string;
}

const DOC_TYPES = ["RERA", "APPROVAL", "NOC", "TITLE", "OTHER"] as const;

export default function LegalDocsManager({ projectId }: { projectId: string }) {
  const [docs, setDocs] = useState<LegalDoc[]>([]);
  const [title, setTitle] = useState("");
  const [docType, setDocType] = useState<(typeof DOC_TYPES)[number]>("RERA");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    try {
      const { data } = await api.get(`/legal/project/${projectId}`);
      setDocs(data.documents ?? []);
    } catch {
      /* ignore */
    }
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file || title.trim().length < 2) {
      toast.error("Add a title and choose a file");
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("title", title.trim());
      form.append("docType", docType);
      const { data } = await api.post(`/legal/project/${projectId}`, form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setDocs((prev) => [data.document, ...prev]);
      setTitle("");
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      toast.success("Uploaded — an admin will verify it before it shows publicly");
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function remove(doc: LegalDoc) {
    if (!confirm(`Delete "${doc.title}"?`)) return;
    setDeletingId(doc._id);
    try {
      await api.delete(`/legal/${doc._id}`);
      setDocs((prev) => prev.filter((d) => d._id !== doc._id));
      toast.success("Deleted");
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Delete failed");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <section className="mt-8">
      <h2 className="text-lg font-medium">Legal documents</h2>
      <p className="text-xs text-muted-foreground">
        RERA certificate, approvals, NOCs, title documents. Each stays private until a Truvi admin verifies it — only
        then does it show on your public listing.
      </p>

      <form onSubmit={submit} className="mt-3 grid gap-3 rounded-2xl border border-white/10 glass p-4 sm:grid-cols-4">
        <div className="sm:col-span-2">
          <Label className="text-foreground/90">Document title</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="RERA Registration Certificate" className="border-white/15 bg-card text-white" />
        </div>
        <div>
          <Label className="text-foreground/90">Type</Label>
          <select
            value={docType}
            onChange={(e) => setDocType(e.target.value as (typeof DOC_TYPES)[number])}
            className="mt-1 h-11 w-full rounded-lg border border-white/15 bg-card px-3 text-sm text-white outline-none focus:border-blue-500"
          >
            {DOC_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <div>
          <Label className="text-foreground/90">File (PDF/image)</Label>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.webp"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="mt-1 block w-full text-xs text-muted-foreground file:mr-3 file:rounded-full file:border-0 file:bg-white/10 file:px-3 file:py-2 file:text-white"
          />
        </div>
        <div className="sm:col-span-4">
          <Button type="submit" size="sm" disabled={uploading}>
            {uploading ? <Loader2 size={13} className="mr-1.5 animate-spin" /> : <Upload size={13} className="mr-1.5" />}
            Upload document
          </Button>
        </div>
      </form>

      <div className="mt-3 space-y-2">
        {docs.length === 0 && <p className="text-sm text-muted-foreground">No legal documents uploaded yet.</p>}
        {docs.map((d) => (
          <div key={d._id} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 glass p-3">
            <div className="flex min-w-0 items-center gap-3">
              <FileText size={16} className="shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-white">{d.title}</p>
                <p className="text-[11px] text-muted-foreground">{d.docType}</p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {d.verified ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-500/15 px-2.5 py-1 text-[11px] font-medium text-emerald-300">
                  <ShieldCheck size={11} /> Verified · public
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/30 bg-amber-500/15 px-2.5 py-1 text-[11px] font-medium text-amber-300">
                  <Clock size={11} /> Pending admin review
                </span>
              )}
              <a href={d.fileUrl} target="_blank" rel="noreferrer" className="rounded-lg border border-white/15 p-1.5 text-muted-foreground hover:bg-white/10 hover:text-white">
                <ExternalLink size={14} />
              </a>
              <button
                onClick={() => remove(d)}
                disabled={deletingId === d._id}
                className="rounded-lg border border-white/15 p-1.5 text-rose-300 hover:bg-white/10"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

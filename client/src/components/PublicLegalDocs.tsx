import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { ShieldCheck, FileText, ExternalLink } from "lucide-react";

interface PublicDoc {
  _id: string;
  title: string;
  docType: string;
  fileUrl: string;
  verifiedAt?: string | null;
}

/** Public listing section — shows ONLY admin-verified legal documents. */
export default function PublicLegalDocs({ projectId }: { projectId: string }) {
  const [docs, setDocs] = useState<PublicDoc[]>([]);

  useEffect(() => {
    api
      .get(`/legal/public/${projectId}`)
      .then((res) => setDocs(res.data.documents ?? []))
      .catch(() => setDocs([]));
  }, [projectId]);

  if (docs.length === 0) return null;

  return (
    <section className="mt-10">
      <h2 className="flex items-center gap-2 text-lg font-medium">
        <ShieldCheck size={17} className="text-emerald-400" />
        Legal &amp; Compliance
        <span className="text-xs font-normal text-muted-foreground">— Truvi-verified documents</span>
      </h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {docs.map((d) => (
          <a
            key={d._id}
            href={d.fileUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-between gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-900/10 p-4 transition hover:border-emerald-400/40"
          >
            <div className="flex min-w-0 items-center gap-3">
              <FileText size={16} className="shrink-0 text-emerald-300" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-white">{d.title}</p>
                <p className="inline-flex items-center gap-1 text-[11px] text-emerald-300">
                  <ShieldCheck size={10} /> {d.docType} · Verified
                </p>
              </div>
            </div>
            <ExternalLink size={14} className="shrink-0 text-muted-foreground" />
          </a>
        ))}
      </div>
    </section>
  );
}

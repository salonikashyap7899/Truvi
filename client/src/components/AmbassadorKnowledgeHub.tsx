import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/primitives";
import { GraduationCap, PlayCircle, FileText, Phone, ExternalLink } from "lucide-react";

interface Material { _id: string; kind: "VIDEO" | "DOC"; title: string; url: string; fileName: string | null }
interface Topic { _id: string; title: string; description: string | null; materials: Material[] }
interface HubData { topics: Topic[]; help: { contact: string | null; text: string | null } }

export default function AmbassadorKnowledgeHub() {
  const [data, setData] = useState<HubData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/ambassador-knowledge").then((r) => setData(r.data)).catch(() => setData(null)).finally(() => setLoading(false));
  }, []);

  if (loading || !data) return null;

  return (
    <Card className="mt-8 border-indigo-500/25 bg-indigo-950/10 text-white">
      <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
        <GraduationCap size={18} className="text-indigo-300" /> Knowledge Hub
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">Training for Ambassadors — watch the video and read the material for each topic.</p>

      <div className="mt-4 space-y-4">
        {data.topics.map((t) => {
          const videos = t.materials.filter((m) => m.kind === "VIDEO");
          const docs = t.materials.filter((m) => m.kind === "DOC");
          return (
            <div key={t._id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <p className="font-semibold">{t.title}</p>
              {t.description && <p className="mt-0.5 text-sm text-muted-foreground">{t.description}</p>}
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {/* Video card */}
                <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                  <p className="flex items-center gap-1.5 text-sm font-semibold text-rose-300"><PlayCircle size={16} /> Video</p>
                  {videos.length === 0 ? (
                    <p className="mt-2 text-xs text-muted-foreground">No training video yet.</p>
                  ) : (
                    <div className="mt-2 space-y-2">
                      {videos.map((m) => (
                        <a key={m._id} href={m.url} target="_blank" rel="noreferrer" className="flex items-center justify-between gap-2 rounded-lg bg-rose-500/15 px-3 py-2 text-sm font-medium text-rose-200 hover:bg-rose-500/25">
                          <span className="truncate">{m.title || "Watch Training Video"}</span>
                          <ExternalLink size={14} className="shrink-0" />
                        </a>
                      ))}
                    </div>
                  )}
                </div>
                {/* PPT / PDF card */}
                <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                  <p className="flex items-center gap-1.5 text-sm font-semibold text-sky-300"><FileText size={16} /> PPT / PDF</p>
                  {docs.length === 0 ? (
                    <p className="mt-2 text-xs text-muted-foreground">No training material yet.</p>
                  ) : (
                    <div className="mt-2 space-y-2">
                      {docs.map((m) => (
                        <a key={m._id} href={m.url} target="_blank" rel="noreferrer" className="flex items-center justify-between gap-2 rounded-lg bg-sky-500/15 px-3 py-2 text-sm font-medium text-sky-200 hover:bg-sky-500/25">
                          <span className="truncate">{m.title || "Download / View Training Material"}</span>
                          <ExternalLink size={14} className="shrink-0" />
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Need help */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <div>
          <p className="font-semibold">Need Help?</p>
          <p className="text-sm text-muted-foreground">{data.help.text || "In case you want to know how to do it, contact us."}</p>
        </div>
        {data.help.contact && (
          <a href={`tel:${data.help.contact}`} className="inline-flex items-center gap-2 rounded-full bg-indigo-500 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-400">
            <Phone size={15} /> {data.help.contact}
          </a>
        )}
      </div>
    </Card>
  );
}

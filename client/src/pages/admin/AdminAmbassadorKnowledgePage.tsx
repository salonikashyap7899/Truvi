import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { GraduationCap, Plus, Trash2, Loader2, PlayCircle, FileText, Save, Upload, Link2, Phone } from "lucide-react";

interface Material { _id: string; kind: "VIDEO" | "DOC"; title: string; url: string; fileName: string | null }
interface Topic { _id: string; title: string; description: string | null; materials: Material[] }

export default function AdminAmbassadorKnowledgePage() {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [help, setHelp] = useState<{ contact: string; text: string }>({ contact: "", text: "" });
  const [loading, setLoading] = useState(true);
  const [newTopic, setNewTopic] = useState({ title: "", description: "" });
  const [busy, setBusy] = useState<string | null>(null);

  function load() {
    api.get("/ambassador-knowledge").then((r) => {
      setTopics(r.data.topics ?? []);
      setHelp({ contact: r.data.help?.contact ?? "", text: r.data.help?.text ?? "" });
    }).catch(() => {}).finally(() => setLoading(false));
  }
  useEffect(() => { load(); }, []);

  async function addTopic() {
    if (newTopic.title.trim().length < 2) { toast.error("Enter a topic title"); return; }
    setBusy("add-topic");
    try {
      await api.post("/ambassador-knowledge/admin/topics", { title: newTopic.title.trim(), description: newTopic.description.trim() || undefined });
      setNewTopic({ title: "", description: "" });
      load();
      toast.success("Topic added");
    } catch (e: any) { toast.error(e?.response?.data?.error || "Failed"); } finally { setBusy(null); }
  }

  async function saveTopic(t: Topic, patch: Partial<Topic>) {
    try { await api.patch(`/ambassador-knowledge/admin/topics/${t._id}`, patch); toast.success("Saved"); } catch (e: any) { toast.error(e?.response?.data?.error || "Failed"); }
  }
  async function deleteTopic(id: string) {
    if (!window.confirm("Delete this topic and all its materials?")) return;
    setBusy(id);
    try { await api.delete(`/ambassador-knowledge/admin/topics/${id}`); load(); toast.success("Deleted"); } catch (e: any) { toast.error(e?.response?.data?.error || "Failed"); } finally { setBusy(null); }
  }
  async function deleteMaterial(id: string) {
    setBusy(id);
    try { await api.delete(`/ambassador-knowledge/admin/materials/${id}`); load(); toast.success("Removed"); } catch (e: any) { toast.error(e?.response?.data?.error || "Failed"); } finally { setBusy(null); }
  }
  async function saveHelp() {
    setBusy("help");
    try { await api.put("/ambassador-knowledge/admin/config", { helpContact: help.contact.trim() || null, helpText: help.text.trim() || null }); toast.success("Help details saved"); } catch (e: any) { toast.error(e?.response?.data?.error || "Failed"); } finally { setBusy(null); }
  }

  const field = "w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-indigo-400/50";

  return (
    <main className="min-h-screen bg-background p-6 text-white md:p-10">
      <h1 className="flex items-center gap-2 font-display text-2xl font-semibold"><GraduationCap size={22} className="text-indigo-400" /> Ambassador Knowledge Hub</h1>
      <p className="mt-1 text-sm text-muted-foreground">Manage the training content Ambassadors see — videos and PPT/PDF per topic. Separate from the CP Learning Academy.</p>

      {/* Add topic */}
      <div className="mt-6 grid grid-cols-1 gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:grid-cols-[1fr_1fr_auto]">
        <input className={field} value={newTopic.title} onChange={(e) => setNewTopic({ ...newTopic, title: e.target.value })} placeholder="New topic title" />
        <input className={field} value={newTopic.description} onChange={(e) => setNewTopic({ ...newTopic, description: e.target.value })} placeholder="Short description (optional)" />
        <button onClick={addTopic} disabled={busy === "add-topic"} className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-400 disabled:opacity-60">{busy === "add-topic" ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} Add Topic</button>
      </div>

      {loading ? <p className="mt-8 text-sm text-muted-foreground">Loading…</p> : (
        <div className="mt-6 space-y-4">
          {topics.map((t) => (
            <TopicCard key={t._id} topic={t} busy={busy} onSaveTopic={saveTopic} onDeleteTopic={deleteTopic} onDeleteMaterial={deleteMaterial} onReload={load} />
          ))}
        </div>
      )}

      {/* Help config */}
      <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-foreground/80"><Phone size={15} /> Need Help — contact</h2>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block"><span className="mb-1 block text-xs text-muted-foreground">Contact number</span><input className={field} value={help.contact} onChange={(e) => setHelp({ ...help, contact: e.target.value })} placeholder="e.g. 7054280101" /></label>
          <label className="block"><span className="mb-1 block text-xs text-muted-foreground">Help text</span><input className={field} value={help.text} onChange={(e) => setHelp({ ...help, text: e.target.value })} placeholder="In case you want to know how to do it, contact us." /></label>
        </div>
        <button onClick={saveHelp} disabled={busy === "help"} className="mt-3 inline-flex items-center gap-2 rounded-full bg-indigo-500 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-400 disabled:opacity-60">{busy === "help" ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save</button>
      </div>
    </main>
  );
}

function TopicCard({ topic, busy, onSaveTopic, onDeleteTopic, onDeleteMaterial, onReload }: {
  topic: Topic; busy: string | null;
  onSaveTopic: (t: Topic, patch: Partial<Topic>) => void;
  onDeleteTopic: (id: string) => void;
  onDeleteMaterial: (id: string) => void;
  onReload: () => void;
}) {
  const [title, setTitle] = useState(topic.title);
  const [desc, setDesc] = useState(topic.description ?? "");
  const videos = topic.materials.filter((m) => m.kind === "VIDEO");
  const docs = topic.materials.filter((m) => m.kind === "DOC");
  const field = "w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-indigo-400/50";

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto_auto]">
        <input className={field} value={title} onChange={(e) => setTitle(e.target.value)} />
        <input className={field} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Description" />
        <button onClick={() => onSaveTopic(topic, { title, description: desc })} className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold hover:bg-white/10">Save</button>
        <button onClick={() => onDeleteTopic(topic._id)} disabled={busy === topic._id} className="rounded-lg border border-rose-400/40 px-3 py-2 text-xs font-semibold text-rose-300 hover:bg-rose-500/10 disabled:opacity-60"><Trash2 size={13} /></button>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <MaterialColumn topicId={topic._id} kind="VIDEO" label="Videos" icon={<PlayCircle size={15} className="text-rose-300" />} items={videos} onDelete={onDeleteMaterial} onReload={onReload} busy={busy} />
        <MaterialColumn topicId={topic._id} kind="DOC" label="PPT / PDF" icon={<FileText size={15} className="text-sky-300" />} items={docs} onDelete={onDeleteMaterial} onReload={onReload} busy={busy} />
      </div>
    </div>
  );
}

function MaterialColumn({ topicId, kind, label, icon, items, onDelete, onReload, busy }: {
  topicId: string; kind: "VIDEO" | "DOC"; label: string; icon: React.ReactNode; items: Material[];
  onDelete: (id: string) => void; onReload: () => void; busy: string | null;
}) {
  const [mode, setMode] = useState<"file" | "url">(kind === "VIDEO" ? "url" : "file");
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function add() {
    if (title.trim().length < 1) { toast.error("Enter a title"); return; }
    const fd = new FormData();
    fd.append("kind", kind);
    fd.append("title", title.trim());
    if (mode === "url") {
      if (!/^https?:\/\//i.test(url)) { toast.error("Enter a valid URL (https://…)"); return; }
      fd.append("url", url.trim());
    } else {
      const f = fileRef.current?.files?.[0];
      if (!f) { toast.error("Choose a file to upload"); return; }
      fd.append("file", f);
    }
    setUploading(true);
    try {
      await api.post(`/ambassador-knowledge/admin/topics/${topicId}/materials`, fd);
      setTitle(""); setUrl(""); if (fileRef.current) fileRef.current.value = "";
      onReload();
      toast.success(`${label} added`);
    } catch (e: any) { toast.error(e?.response?.data?.error || "Upload failed"); } finally { setUploading(false); }
  }

  const field = "w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white outline-none focus:border-indigo-400/50";
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-3">
      <p className="flex items-center gap-1.5 text-sm font-semibold">{icon} {label}</p>
      <div className="mt-2 space-y-1.5">
        {items.length === 0 ? <p className="text-xs text-muted-foreground">None yet.</p> : items.map((m) => (
          <div key={m._id} className="flex items-center justify-between gap-2 rounded-lg bg-white/5 px-2.5 py-1.5 text-xs">
            <a href={m.url} target="_blank" rel="noreferrer" className="truncate text-white/90 hover:underline">{m.title}</a>
            <button onClick={() => onDelete(m._id)} disabled={busy === m._id} className="shrink-0 text-rose-300 hover:text-rose-200"><Trash2 size={13} /></button>
          </div>
        ))}
      </div>
      <div className="mt-3 space-y-2 border-t border-white/10 pt-3">
        <input className={field} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={`${label} title`} />
        <div className="flex gap-1.5 text-[11px]">
          <button onClick={() => setMode("url")} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 ${mode === "url" ? "bg-indigo-500 text-white" : "border border-white/10 text-white/60"}`}><Link2 size={11} /> Link</button>
          <button onClick={() => setMode("file")} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 ${mode === "file" ? "bg-indigo-500 text-white" : "border border-white/10 text-white/60"}`}><Upload size={11} /> Upload</button>
        </div>
        {mode === "url" ? (
          <input className={field} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://youtube.com/… or file link" />
        ) : (
          <input ref={fileRef} type="file" accept={kind === "VIDEO" ? "video/*" : ".pdf,.ppt,.pptx,.doc,.docx"} className="block w-full text-xs text-white/70 file:mr-2 file:rounded file:border-0 file:bg-white/10 file:px-2 file:py-1 file:text-white" />
        )}
        <button onClick={add} disabled={uploading} className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-indigo-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-400 disabled:opacity-60">{uploading ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Add {label}</button>
      </div>
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { Card, Badge, Input, Textarea, Label } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ArrowLeft, PlayCircle, FileText, Trash2, Upload, Link as LinkIcon } from "lucide-react";
import { COURSE_OPTIONS } from "@/pages/cp/LearningAcademyPage";

interface AcademyContent {
  _id: string; courseId: string; title: string; type: "VIDEO" | "PDF";
  url: string; description?: string | null; duration?: string | null;
}

const EMPTY_FORM = {
  courseId: COURSE_OPTIONS[0]?.id ?? "",
  title: "",
  type: "VIDEO" as "VIDEO" | "PDF",
  duration: "",
  description: "",
  url: "",
};

const courseTitle = (id: string) => COURSE_OPTIONS.find((c) => c.id === id)?.title ?? id;

export default function AdminAcademyPage() {
  const [items, setItems] = useState<AcademyContent[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [source, setSource] = useState<"upload" | "url">("upload");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    try {
      const res = await api.get("/academy/content");
      setItems(res.data.content ?? []);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to load content");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) return toast.error("Title is required");
    if (source === "upload" && !file) return toast.error("Choose a file to upload");
    if (source === "url" && !form.url.trim()) return toast.error("Enter a URL");

    setSaving(true);
    try {
      const fd = new FormData();
      fd.append("courseId", form.courseId);
      fd.append("title", form.title.trim());
      fd.append("type", form.type);
      if (form.duration.trim()) fd.append("duration", form.duration.trim());
      if (form.description.trim()) fd.append("description", form.description.trim());
      if (source === "upload" && file) fd.append("file", file);
      if (source === "url") fd.append("url", form.url.trim());

      await api.post("/academy/content", fd, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success("Content added to the Learning Academy");
      setForm({ ...EMPTY_FORM, courseId: form.courseId });
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      await load();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to add content");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this content?")) return;
    try {
      await api.delete(`/academy/content/${id}`);
      setItems((prev) => prev.filter((i) => i._id !== id));
      toast.success("Deleted");
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to delete");
    }
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const selectCls = "h-10 w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 text-sm text-foreground outline-none focus:border-[var(--trust)] focus:ring-1 focus:ring-[var(--trust)]";

  return (
    <main className="min-h-screen p-6 text-white md:p-10">
      <div className="flex items-center gap-3 mb-6">
        <Link to="/admin/dashboard" className="text-muted-foreground hover:text-white transition-colors">
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <PlayCircle size={22} className="text-sky-300" /> Learning Academy Content
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Upload training videos & PDFs that CPs see inside the Learning Hub.
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        {/* Upload form */}
        <Card className="p-5 h-fit">
          <h2 className="text-sm font-semibold text-white mb-4">Add content</h2>
          <form onSubmit={submit} className="space-y-3">
            <div>
              <Label>Course</Label>
              <select className={selectCls} value={form.courseId} onChange={set("courseId")}>
                {COURSE_OPTIONS.map((c) => (
                  <option key={c.id} value={c.id} className="bg-neutral-900">{c.title}</option>
                ))}
              </select>
            </div>

            <div>
              <Label>Title</Label>
              <Input value={form.title} onChange={set("title")} placeholder="e.g. How to Get Organic Leads" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Type</Label>
                <select className={selectCls} value={form.type} onChange={set("type")}>
                  <option value="VIDEO" className="bg-neutral-900">Video</option>
                  <option value="PDF" className="bg-neutral-900">PDF</option>
                </select>
              </div>
              <div>
                <Label>Duration</Label>
                <Input value={form.duration} onChange={set("duration")} placeholder="e.g. 12 min" />
              </div>
            </div>

            <div>
              <Label>Description (optional)</Label>
              <Textarea rows={2} value={form.description} onChange={set("description")} placeholder="Short summary…" />
            </div>

            {/* Source toggle */}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setSource("upload")}
                className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs transition-colors ${source === "upload" ? "border-sky-600 bg-sky-950/40 text-sky-300" : "border-white/10 bg-white/5 text-muted-foreground hover:text-white"}`}
              >
                <Upload size={13} /> Upload file
              </button>
              <button
                type="button"
                onClick={() => setSource("url")}
                className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs transition-colors ${source === "url" ? "border-sky-600 bg-sky-950/40 text-sky-300" : "border-white/10 bg-white/5 text-muted-foreground hover:text-white"}`}
              >
                <LinkIcon size={13} /> Paste link
              </button>
            </div>

            {source === "upload" ? (
              <div>
                <Label>File (MP4/WEBM/MOV or PDF, max 200MB)</Label>
                <input
                  ref={fileRef}
                  type="file"
                  accept="video/mp4,video/webm,video/ogg,video/quicktime,application/pdf"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-1.5 file:text-sm file:text-white hover:file:bg-white/15"
                />
              </div>
            ) : (
              <div>
                <Label>Video / PDF URL</Label>
                <Input value={form.url} onChange={set("url")} placeholder="https://…" />
              </div>
            )}

            <Button type="submit" className="w-full" disabled={saving}>
              {saving ? "Saving…" : "Add to Learning Hub"}
            </Button>
          </form>
        </Card>

        {/* Existing content */}
        <div>
          <h2 className="text-sm font-semibold text-white mb-3">Published content ({items.length})</h2>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : items.length === 0 ? (
            <Card className="p-6 text-center text-sm text-muted-foreground">
              No content yet. Add your first video or PDF using the form.
            </Card>
          ) : (
            <div className="space-y-2">
              {items.map((item) => (
                <Card key={item._id} className="flex items-center gap-3 p-4">
                  {item.type === "VIDEO"
                    ? <PlayCircle size={18} className="text-sky-300 shrink-0" />
                    : <FileText size={18} className="text-rose-300 shrink-0" />}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium text-white">{item.title}</p>
                      <Badge variant={item.type === "VIDEO" ? "default" : "warning"}>{item.type}</Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {courseTitle(item.courseId)}{item.duration ? ` · ${item.duration}` : ""}
                    </p>
                    <a href={item.url} target="_blank" rel="noreferrer" className="text-xs text-sky-400 hover:underline break-all">
                      {item.url}
                    </a>
                  </div>
                  <button
                    onClick={() => remove(item._id)}
                    className="shrink-0 rounded-lg border border-red-900/50 bg-red-950/30 p-2 text-red-400 hover:bg-red-900/40 transition-colors"
                    title="Delete"
                  >
                    <Trash2 size={15} />
                  </button>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

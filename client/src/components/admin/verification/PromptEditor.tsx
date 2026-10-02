import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea, Badge } from "@/components/ui/primitives";
import { toast } from "sonner";
import { Trash2, Plus, CheckCircle2 } from "lucide-react";

interface Prompt { _id: string; name: string; systemPrompt: string; active: boolean; version: number; }

/** Manage ai_prompts — only one active at a time; the engine uses the active one. */
export default function PromptEditor() {
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [form, setForm] = useState({ name: "", systemPrompt: "", active: true });
  const [editId, setEditId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => api.get("/admin/prompts").then((r) => setPrompts(r.data.prompts)).catch(() => {});
  useEffect(() => { load(); }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true);
    try {
      if (editId) await api.put(`/admin/prompts/${editId}`, form);
      else await api.post("/admin/prompts", form);
      toast.success(editId ? "Prompt updated" : "Prompt added");
      setForm({ name: "", systemPrompt: "", active: true }); setEditId(null); load();
    } catch (err: any) { toast.error(err?.response?.data?.error || "Failed"); } finally { setBusy(false); }
  }
  async function activate(p: Prompt) { await api.put(`/admin/prompts/${p._id}`, { active: true }); toast.success(`"${p.name}" is now active`); load(); }
  async function remove(id: string) { if (!confirm("Delete this prompt?")) return; await api.delete(`/admin/prompts/${id}`); load(); }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
      <form onSubmit={save} className="h-fit space-y-3 rounded-2xl border border-white/10 glass p-4">
        <p className="font-display text-sm font-semibold">{editId ? "Edit prompt" : "New prompt"}</p>
        <div><Label>Name</Label><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="border-white/15 bg-card text-white" /></div>
        <div><Label>System prompt</Label>
          <Textarea required rows={10} value={form.systemPrompt} onChange={(e) => setForm({ ...form, systemPrompt: e.target.value })} className="border-white/15 bg-card text-xs text-white" />
        </div>
        <label className="flex items-center gap-2 text-sm text-foreground/90">
          <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> Make active
        </label>
        <div className="flex gap-2">
          <Button type="submit" disabled={busy} size="sm"><Plus size={14} className="mr-1" />{editId ? "Save" : "Add"}</Button>
          {editId && <Button type="button" variant="ghost" size="sm" onClick={() => { setEditId(null); setForm({ name: "", systemPrompt: "", active: true }); }}>Cancel</Button>}
        </div>
      </form>

      <div className="space-y-2">
        {prompts.map((p) => (
          <div key={p._id} className="rounded-xl border border-white/10 glass p-3">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium text-white">{p.name} {p.active && <Badge variant="success">active</Badge>} <span className="text-[11px] text-muted-foreground">v{p.version}</span></p>
              <div className="flex shrink-0 gap-1">
                {!p.active && <button onClick={() => activate(p)} className="rounded-lg border border-emerald-700/50 px-2 py-1 text-[11px] text-emerald-300 hover:bg-emerald-900/20"><CheckCircle2 size={12} className="mr-0.5 inline" />Activate</button>}
                <button onClick={() => { setEditId(p._id); setForm({ name: p.name, systemPrompt: p.systemPrompt, active: p.active }); }} className="rounded-lg border border-white/15 px-2 py-1 text-[11px] text-muted-foreground hover:bg-white/10">Edit</button>
                <button onClick={() => remove(p._id)} className="rounded-lg border border-red-700/50 p-1.5 text-red-300 hover:bg-red-900/20"><Trash2 size={13} /></button>
              </div>
            </div>
            <pre className="mt-2 max-h-32 overflow-y-auto whitespace-pre-wrap rounded-lg bg-black/30 p-2 text-[10px] text-foreground/70">{p.systemPrompt}</pre>
          </div>
        ))}
        {prompts.length === 0 && <p className="text-sm text-muted-foreground">No prompts yet.</p>}
      </div>
    </div>
  );
}

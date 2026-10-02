import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea, Badge } from "@/components/ui/primitives";
import { toast } from "sonner";
import { Trash2, Plus, Power } from "lucide-react";

const CATEGORIES = ["government_legal", "infrastructure", "location_intelligence", "market_intelligence", "environmental_data", "satellite_gis", "community_intelligence"];
const LOGIC = ["exists", "compare", "range", "absence", "sql"];

interface Check {
  _id: string; name: string; category: string; weight: number; enabled: boolean;
  logicType: string; sqlQuery: string; description?: string | null;
}
const blank = { name: "", category: CATEGORIES[0], weight: 5, logicType: "sql", sqlQuery: "", description: "" };

/** Live CRUD for verification_checks — changes take effect on the next verify. */
export default function ChecksManager() {
  const [checks, setChecks] = useState<Check[]>([]);
  const [form, setForm] = useState<any>(blank);
  const [editId, setEditId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => api.get("/admin/checks").then((r) => setChecks(r.data.checks)).catch(() => {});
  useEffect(() => { load(); }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const body = { ...form, weight: Number(form.weight) };
      if (editId) await api.put(`/admin/checks/${editId}`, body);
      else await api.post("/admin/checks", body);
      toast.success(editId ? "Check updated" : "Check added");
      setForm(blank); setEditId(null); load();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed");
    } finally { setBusy(false); }
  }
  async function toggle(c: Check) { await api.put(`/admin/checks/${c._id}`, { enabled: !c.enabled }); load(); }
  async function remove(id: string) { if (!confirm("Delete this check?")) return; await api.delete(`/admin/checks/${id}`); load(); }
  function edit(c: Check) { setEditId(c._id); setForm({ name: c.name, category: c.category, weight: c.weight, logicType: c.logicType, sqlQuery: c.sqlQuery, description: c.description ?? "" }); }

  return (
    <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
      <form onSubmit={save} className="h-fit space-y-3 rounded-2xl border border-white/10 glass p-4">
        <p className="font-display text-sm font-semibold">{editId ? "Edit check" : "New check"}</p>
        <div><Label>Name</Label><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="border-white/15 bg-card text-white" /></div>
        <div className="grid grid-cols-2 gap-2">
          <div><Label>Category</Label>
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="w-full rounded-lg border border-white/15 bg-card px-2 py-2 text-sm text-white">
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div><Label>Weight</Label><Input type="number" value={form.weight} onChange={(e) => setForm({ ...form, weight: e.target.value })} className="border-white/15 bg-card text-white" /></div>
        </div>
        <div><Label>Logic type</Label>
          <select value={form.logicType} onChange={(e) => setForm({ ...form, logicType: e.target.value })} className="w-full rounded-lg border border-white/15 bg-card px-2 py-2 text-sm text-white">
            {LOGIC.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
        <div><Label>SQL query <span className="text-muted-foreground">($1 = projectId → {"{ passed, evidence }"})</span></Label>
          <Textarea required rows={5} value={form.sqlQuery} onChange={(e) => setForm({ ...form, sqlQuery: e.target.value })} className="border-white/15 bg-card font-mono text-xs text-white" />
        </div>
        <div><Label>Description</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="border-white/15 bg-card text-white" /></div>
        <div className="flex gap-2">
          <Button type="submit" disabled={busy} size="sm"><Plus size={14} className="mr-1" />{editId ? "Save" : "Add"}</Button>
          {editId && <Button type="button" variant="ghost" size="sm" onClick={() => { setEditId(null); setForm(blank); }}>Cancel</Button>}
        </div>
      </form>

      <div className="space-y-2">
        {checks.map((c) => (
          <div key={c._id} className="rounded-xl border border-white/10 glass p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-medium text-white">{c.name} <Badge variant={c.enabled ? "success" : "default"}>{c.enabled ? "on" : "off"}</Badge></p>
                <p className="text-[11px] text-muted-foreground">{c.category} · weight {c.weight} · {c.logicType}</p>
              </div>
              <div className="flex shrink-0 gap-1">
                <button onClick={() => toggle(c)} title="Toggle" className="rounded-lg border border-white/15 p-1.5 text-muted-foreground hover:bg-white/10"><Power size={13} /></button>
                <button onClick={() => edit(c)} className="rounded-lg border border-white/15 px-2 py-1 text-[11px] text-muted-foreground hover:bg-white/10">Edit</button>
                <button onClick={() => remove(c._id)} className="rounded-lg border border-red-700/50 p-1.5 text-red-300 hover:bg-red-900/20"><Trash2 size={13} /></button>
              </div>
            </div>
            <pre className="mt-2 overflow-x-auto rounded-lg bg-black/30 p-2 text-[10px] text-foreground/70">{c.sqlQuery}</pre>
          </div>
        ))}
        {checks.length === 0 && <p className="text-sm text-muted-foreground">No checks yet. Add one, or run <code>npm run seed:verification</code>.</p>}
      </div>
    </div>
  );
}

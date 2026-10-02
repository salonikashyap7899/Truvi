import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea, Badge } from "@/components/ui/primitives";
import { toast } from "sonner";
import { Trash2, Plus, Power } from "lucide-react";

const SEV = ["low", "medium", "high"];
interface Rule { _id: string; name: string; enabled: boolean; sqlQuery: string; severity: string; description?: string | null; }
const blank = { name: "", severity: "medium", sqlQuery: "", description: "" };

/** Live CRUD for fraud_rules — any row a rule's SQL returns becomes a flag. */
export default function FraudRulesManager() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [form, setForm] = useState<any>(blank);
  const [editId, setEditId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => api.get("/admin/fraud-rules").then((r) => setRules(r.data.rules)).catch(() => {});
  useEffect(() => { load(); }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true);
    try {
      if (editId) await api.put(`/admin/fraud-rules/${editId}`, form);
      else await api.post("/admin/fraud-rules", form);
      toast.success(editId ? "Rule updated" : "Rule added");
      setForm(blank); setEditId(null); load();
    } catch (err: any) { toast.error(err?.response?.data?.error || "Failed"); } finally { setBusy(false); }
  }
  async function toggle(r: Rule) { await api.put(`/admin/fraud-rules/${r._id}`, { enabled: !r.enabled }); load(); }
  async function remove(id: string) { if (!confirm("Delete this rule?")) return; await api.delete(`/admin/fraud-rules/${id}`); load(); }

  return (
    <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
      <form onSubmit={save} className="h-fit space-y-3 rounded-2xl border border-white/10 glass p-4">
        <p className="font-display text-sm font-semibold">{editId ? "Edit rule" : "New fraud rule"}</p>
        <div><Label>Name</Label><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="border-white/15 bg-card text-white" /></div>
        <div><Label>Severity</Label>
          <select value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })} className="w-full rounded-lg border border-white/15 bg-card px-2 py-2 text-sm text-white">
            {SEV.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div><Label>SQL query <span className="text-muted-foreground">($1 = projectId · any row = a flag)</span></Label>
          <Textarea required rows={5} value={form.sqlQuery} onChange={(e) => setForm({ ...form, sqlQuery: e.target.value })} className="border-white/15 bg-card font-mono text-xs text-white" />
        </div>
        <div><Label>Description</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="border-white/15 bg-card text-white" /></div>
        <div className="flex gap-2">
          <Button type="submit" disabled={busy} size="sm"><Plus size={14} className="mr-1" />{editId ? "Save" : "Add"}</Button>
          {editId && <Button type="button" variant="ghost" size="sm" onClick={() => { setEditId(null); setForm(blank); }}>Cancel</Button>}
        </div>
      </form>

      <div className="space-y-2">
        {rules.map((r) => (
          <div key={r._id} className="rounded-xl border border-white/10 glass p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-medium text-white">{r.name} <Badge variant={r.severity === "high" ? "danger" : r.severity === "medium" ? "warning" : "default"}>{r.severity}</Badge> {!r.enabled && <Badge variant="default">off</Badge>}</p>
                {r.description && <p className="text-[11px] text-muted-foreground">{r.description}</p>}
              </div>
              <div className="flex shrink-0 gap-1">
                <button onClick={() => toggle(r)} className="rounded-lg border border-white/15 p-1.5 text-muted-foreground hover:bg-white/10"><Power size={13} /></button>
                <button onClick={() => { setEditId(r._id); setForm({ name: r.name, severity: r.severity, sqlQuery: r.sqlQuery, description: r.description ?? "" }); }} className="rounded-lg border border-white/15 px-2 py-1 text-[11px] text-muted-foreground hover:bg-white/10">Edit</button>
                <button onClick={() => remove(r._id)} className="rounded-lg border border-red-700/50 p-1.5 text-red-300 hover:bg-red-900/20"><Trash2 size={13} /></button>
              </div>
            </div>
            <pre className="mt-2 overflow-x-auto rounded-lg bg-black/30 p-2 text-[10px] text-foreground/70">{r.sqlQuery}</pre>
          </div>
        ))}
        {rules.length === 0 && <p className="text-sm text-muted-foreground">No fraud rules yet.</p>}
      </div>
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Kpi, Panel, Ic } from "@/pages/dashboard/DashboardOS";

/* =============================================================== helpers */
interface ProjectOpt { _id: string; name: string; city?: string | null }
interface LeadRow {
  _id: string;
  clientName: string;
  clientPhone: string;
  clientEmail?: string | null;
  stage: string;
  source: string;
  notes?: string | null;
  createdAt: string;
  projectId?: { _id: string; name: string } | string;
}

const LEAD_SOURCES = ["Website", "Facebook", "Google", "LinkedIn", "Channel Partner", "Referral", "Walk-in", "Other"];

const stageBadge = (s: string) => {
  const green = ["BOOKING", "REGISTRATION", "COMPLETED"];
  const red = ["LOST"];
  const cls = green.includes(s) ? "green" : red.includes(s) ? "red" : "blue";
  return <span className={`badge ${cls}`}>{s.replace(/_/g, " ")}</span>;
};
const projName = (p: LeadRow["projectId"]) => (p && typeof p === "object" ? p.name : "—");

/* ==================================================== Lead Management */
export function LeadManagementPage() {
  const [projects, setProjects] = useState<ProjectOpt[]>([]);
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const empty = { clientName: "", clientPhone: "", clientEmail: "", projectId: "", source: LEAD_SOURCES[0], budget: "", location: "", remarks: "" };
  const [form, setForm] = useState({ ...empty });

  async function load() {
    try {
      const [pr, lr] = await Promise.all([
        api.get("/admin/projects").catch(() => ({ data: { projects: [] } })),
        api.get("/leads").catch(() => ({ data: { leads: [] } })),
      ]);
      setProjects(pr.data.projects ?? []);
      setLeads(lr.data.leads ?? []);
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  const stats = useMemo(() => {
    const total = leads.length;
    const today = leads.filter((l) => new Date(l.createdAt).toDateString() === new Date().toDateString()).length;
    const won = leads.filter((l) => ["BOOKING", "REGISTRATION", "COMPLETED"].includes(l.stage)).length;
    const lost = leads.filter((l) => l.stage === "LOST").length;
    return { total, today, won, lost };
  }, [leads]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (form.clientName.trim().length < 2 || !/^[6-9]\d{9}$/.test(form.clientPhone.trim())) {
      toast.error("Enter the lead's name and a valid 10-digit mobile number"); return;
    }
    if (!form.projectId) { toast.error("Select the interested project"); return; }
    setBusy(true);
    try {
      await api.post("/admin/leads", {
        clientName: form.clientName.trim(),
        clientPhone: form.clientPhone.trim(),
        clientEmail: form.clientEmail.trim() || undefined,
        projectId: form.projectId,
        source: form.source,
        budget: form.budget.trim() || undefined,
        location: form.location.trim() || undefined,
        remarks: form.remarks.trim() || undefined,
      });
      toast.success("Lead added — it's now in the pipeline");
      setForm({ ...empty }); setOpen(false); load();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Could not add the lead");
    } finally { setBusy(false); }
  }

  return (
    <section className="page">
      <div className="page-header">
        <div><div className="page-title">Lead Management</div><div className="page-sub">Capture &amp; track every lead — add one directly into the pipeline</div></div>
        <button className="btn btn-primary" onClick={() => setOpen((o) => !o)}><Ic n={open ? "check" : "spark"} /> {open ? "Close" : "+ Add Lead"}</button>
      </div>

      <div className="kpi-grid">
        <Kpi icon="spark" tone="blue" label="Total Leads" value={String(stats.total)} />
        <Kpi icon="target" tone="green" label="Added Today" value={String(stats.today)} />
        <Kpi icon="check" tone="green" label="Won" value={String(stats.won)} />
        <Kpi icon="alert" tone={stats.lost ? "red" : "green"} label="Lost" value={String(stats.lost)} />
      </div>

      {open && (
        <Panel title="New Lead" sub="Submits straight into the CRM pipeline" icon="spark" iconTone="blue">
          <form className="fm-form" onSubmit={submit}>
            <div className="fm-field"><label>Lead name *</label><input value={form.clientName} onChange={(e) => setForm({ ...form, clientName: e.target.value })} placeholder="e.g. Rohit Mehta" /></div>
            <div className="fm-field"><label>Mobile number *</label><input value={form.clientPhone} onChange={(e) => setForm({ ...form, clientPhone: e.target.value })} placeholder="10-digit mobile" /></div>
            <div className="fm-field"><label>Email</label><input value={form.clientEmail} onChange={(e) => setForm({ ...form, clientEmail: e.target.value })} placeholder="name@email.com" /></div>
            <div className="fm-field"><label>Lead source</label>
              <select value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })}>{LEAD_SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}</select>
            </div>
            <div className="fm-field"><label>Interested project *</label>
              <select value={form.projectId} onChange={(e) => setForm({ ...form, projectId: e.target.value })}>
                <option value="">Select a project…</option>
                {projects.map((p) => <option key={p._id} value={p._id}>{p.name}{p.city ? ` · ${p.city}` : ""}</option>)}
              </select>
            </div>
            <div className="fm-field"><label>Budget</label><input value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} placeholder="e.g. ₹80L – 1Cr" /></div>
            <div className="fm-field"><label>Location preference</label><input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="e.g. Gomti Nagar" /></div>
            <div className="fm-field full"><label>Remarks / notes</label><textarea rows={2} value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} placeholder="Anything the team should know…" /></div>
            <div className="fm-actions">
              <button type="button" className="chip" onClick={() => { setOpen(false); setForm({ ...empty }); }}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? "Adding…" : "Add Lead"}</button>
            </div>
          </form>
        </Panel>
      )}

      <Panel title="All Leads" sub="Every lead in the system, newest first" icon="chart" iconTone="green">
        {loading ? <p style={{ fontSize: 12.5, color: "var(--ink-500)" }}>Loading…</p>
          : leads.length === 0 ? <p style={{ fontSize: 12.5, color: "var(--ink-500)" }}>No leads yet. Use “+ Add Lead” to create the first one.</p>
          : <div className="table-wrap"><table>
              <thead><tr><th>Lead</th><th>Mobile</th><th>Project</th><th>Source</th><th>Stage</th><th>Added</th></tr></thead>
              <tbody>{leads.slice(0, 50).map((l) => (
                <tr key={l._id}>
                  <td><b>{l.clientName}</b>{l.clientEmail ? <div style={{ fontSize: 11, color: "var(--ink-500)" }}>{l.clientEmail}</div> : null}</td>
                  <td>{l.clientPhone}</td>
                  <td>{projName(l.projectId)}</td>
                  <td>{l.source}</td>
                  <td>{stageBadge(l.stage)}</td>
                  <td>{new Date(l.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</td>
                </tr>
              ))}</tbody>
            </table></div>}
      </Panel>
    </section>
  );
}

/* ==================================================== Referral Leads */
type RefStatus = "PENDING" | "VERIFIED" | "ACTIVE" | "REJECTED";
interface ReferralLead {
  _id: string; cpName: string | null; developerName: string; companyName: string | null;
  phone: string; email: string | null; city: string | null; interestedProject: string | null;
  source: string | null; landDetails: string | null; notes: string | null; status: RefStatus; createdAt: string;
}
const refBadge: Record<RefStatus, string> = { PENDING: "amber", VERIFIED: "blue", ACTIVE: "green", REJECTED: "red" };

export function ReferralLeadsPage() {
  const [rows, setRows] = useState<ReferralLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    try { const r = await api.get("/onboarding/developers"); setRows(r.data.referrals ?? []); }
    catch (err: any) { toast.error(err?.response?.data?.error || "Failed to load referral leads"); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  const s = useMemo(() => ({
    total: rows.length,
    pending: rows.filter((r) => r.status === "PENDING").length,
    verified: rows.filter((r) => r.status === "VERIFIED").length,
    active: rows.filter((r) => r.status === "ACTIVE").length,
    rejected: rows.filter((r) => r.status === "REJECTED").length,
  }), [rows]);

  async function setStatus(id: string, status: RefStatus) {
    setBusyId(id);
    try {
      const r = await api.patch(`/onboarding/developers/${id}`, { status });
      setRows((prev) => prev.map((x) => (x._id === id ? { ...x, status: r.data.referral.status } : x)));
      toast.success(`Marked ${status.toLowerCase()}`);
    } catch (err: any) { toast.error(err?.response?.data?.error || "Action failed"); }
    finally { setBusyId(null); }
  }

  return (
    <section className="page">
      <div className="page-header"><div><div className="page-title">Referral Leads</div><div className="page-sub">Developers referred by your Channel Partners — full details, verify &amp; approve in one place</div></div></div>

      <div className="kpi-grid">
        <Kpi icon="users" tone="blue" label="Total Referrals" value={String(s.total)} />
        <Kpi icon="alert" tone={s.pending ? "amber" : "green"} label="Pending" value={String(s.pending)} />
        <Kpi icon="shield" tone="blue" label="Verified" value={String(s.verified)} />
        <Kpi icon="check" tone="green" label="Active Developers" value={String(s.active)} foot="Approved referrals" />
        <Kpi icon="alert" tone={s.rejected ? "red" : "green"} label="Rejected" value={String(s.rejected)} />
      </div>

      <Panel title="Referral Developer Leads" sub="Open a lead to see full details before approving" icon="users" iconTone="blue">
        {loading ? <p style={{ fontSize: 12.5, color: "var(--ink-500)" }}>Loading…</p>
          : rows.length === 0 ? <p style={{ fontSize: 12.5, color: "var(--ink-500)" }}>No referral developer leads yet.</p>
          : <div>{rows.map((l) => {
              const isOpen = openId === l._id;
              return (
                <div className="card" key={l._id} style={{ padding: 14, marginBottom: 10 }}>
                  <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700, color: "var(--ink-900)", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        {l.developerName}{l.companyName ? <span style={{ fontWeight: 400, color: "var(--ink-500)", fontSize: 12.5 }}>· {l.companyName}</span> : null}
                        <span className={`badge ${refBadge[l.status]}`}>{l.status}</span>
                      </div>
                      <div style={{ fontSize: 11.5, color: "var(--ink-500)", marginTop: 2 }}>Referred by {l.cpName ?? "—"} · {new Date(l.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</div>
                    </div>
                    <button className="chip" onClick={() => setOpenId(isOpen ? null : l._id)}>{isOpen ? "Hide details" : "View full details"}</button>
                  </div>

                  {isOpen && (
                    <div style={{ marginTop: 12, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
                      <div className="kpi-grid" style={{ marginBottom: 8 }}>
                        <RDetail label="Mobile" value={l.phone} href={`tel:${l.phone}`} />
                        <RDetail label="Email" value={l.email} href={l.email ? `mailto:${l.email}` : undefined} />
                        <RDetail label="Company / Developer" value={l.companyName} />
                        <RDetail label="City" value={l.city} />
                        <RDetail label="Interested Project" value={l.interestedProject} />
                        <RDetail label="Source" value={l.source} />
                      </div>
                      {l.landDetails && <div style={{ marginBottom: 8 }}><div className="kpi-label">Land / project details</div><div style={{ fontSize: 12.5, color: "var(--ink-700)" }}>{l.landDetails}</div></div>}
                      {l.notes && <div style={{ marginBottom: 8 }}><div className="kpi-label">Notes</div><div style={{ fontSize: 12.5, color: "var(--ink-700)", whiteSpace: "pre-wrap" }}>{l.notes}</div></div>}
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10, alignItems: "center" }}>
                        <a className="chip" href={`tel:${l.phone}`}><Ic n="spark" /> Call</a>
                        {l.email && <a className="chip" href={`mailto:${l.email}`}>Email</a>}
                        <div style={{ flex: 1 }} />
                        {l.status !== "VERIFIED" && <button className="chip" disabled={busyId === l._id} onClick={() => setStatus(l._id, "VERIFIED")}>Verify</button>}
                        {l.status !== "ACTIVE" && <button className="btn btn-primary" disabled={busyId === l._id} onClick={() => setStatus(l._id, "ACTIVE")}>{busyId === l._id ? "…" : "Approve"}</button>}
                        {l.status !== "REJECTED" && <button className="chip" disabled={busyId === l._id} onClick={() => setStatus(l._id, "REJECTED")} style={{ color: "var(--red-500)" }}>Reject</button>}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}</div>}
      </Panel>
    </section>
  );
}

function RDetail({ label, value, href }: { label: string; value: string | null; href?: string }) {
  return (
    <div>
      <div className="kpi-label">{label}</div>
      {value ? (href ? <a href={href} style={{ fontSize: 13, color: "var(--blue-600)" }}>{value}</a> : <div style={{ fontSize: 13, color: "var(--ink-900)", fontWeight: 600 }}>{value}</div>) : <div style={{ fontSize: 13, color: "var(--ink-500)" }}>—</div>}
    </div>
  );
}

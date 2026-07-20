import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { formatCompactINR, formatINR } from "@/lib/utils";
import { toast } from "sonner";
import { Kpi, Panel } from "@/pages/dashboard/DashboardOS";

/* ------------------------------------------------------------------ types */
interface TeamSummary {
  total: number; active: number; presentToday: number; onLeave: number; tasksPending: number;
  avgPerformance: number; monthlyPayroll: number;
  byDepartment: { department: string; count: number }[];
  ranking: { id: string; name: string; title: string | null; department: string; status: string; performanceScore: number; tasksPending: number; presentToday: boolean }[];
}
interface MarketingSummary {
  activeCampaigns: number; totalSpend: number; totalLeads: number; totalConversions: number;
  costPerLead: number; roi: number; revenue: number;
  byChannel: { channel: string; spend: number; leads: number }[];
  campaigns: { id: string; name: string; channel: string; status: string; spend: number; leads: number; conversions: number; revenue: number }[];
}
interface LandSummary {
  totalParcels: number; areaByUnit: { unit: string; area: number }[]; verified: number; inPipeline: number;
  totalValue: number; pendingDueDiligence: number;
  parcels: { id: string; name: string; location: string; area: number; areaUnit: string; status: string; estimatedValue: number; dueDiligenceDone: boolean; priority: string }[];
  highPriority: { id: string; name: string; location: string; status: string }[];
}
interface InvestorSummary {
  valuation: number; totalRaised: number; esopPercent: number;
  activeRound: { name: string; target: number; committed: number; valuation: number; status: string; progress: number } | null;
  capTable: { id: string; holderName: string; holderType: string; equityPercent: number; investedAmount: number }[];
  updates: { id: string; title: string; body: string | null; createdAt: string }[];
}
interface FounderSummary { team: TeamSummary; marketing: MarketingSummary; landBank: LandSummary; investor: InvestorSummary }

/* ------------------------------------------------------------------ hook */
function useSummary() {
  const [data, setData] = useState<FounderSummary | null>(null);
  const [loading, setLoading] = useState(true);
  async function load() {
    try { setData((await api.get("/founder/summary")).data); }
    catch (err: any) { toast.error(err?.response?.data?.error || "Failed to load"); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);
  return { data, loading, reload: load };
}

/* ------------------------------------------------------------ inline form */
type Field = {
  name: string; label: string; type?: "text" | "number" | "select" | "textarea";
  options?: { value: string; label: string }[]; placeholder?: string; full?: boolean; defaultValue?: string;
};
function InlineForm({ fields, endpoint, submitLabel, onSaved }: { fields: Field[]; endpoint: string; submitLabel: string; onSaved: () => void }) {
  const initial = useMemo(() => Object.fromEntries(fields.map((f) => [f.name, f.defaultValue ?? (f.type === "select" ? f.options?.[0]?.value ?? "" : "")])), [fields]);
  const [open, setOpen] = useState(false);
  const [vals, setVals] = useState<Record<string, string>>(initial);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const payload: Record<string, string> = {};
      for (const [k, v] of Object.entries(vals)) if (v !== "") payload[k] = v;
      await api.post(endpoint, payload);
      toast.success("Saved");
      setVals(initial); setOpen(false); onSaved();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to save");
    } finally { setBusy(false); }
  }

  if (!open) return <button className="chip" onClick={() => setOpen(true)}>+ Add</button>;
  return (
    <form className="fm-form" onSubmit={submit}>
      {fields.map((f) => (
        <div key={f.name} className={`fm-field${f.full ? " full" : ""}`}>
          <label>{f.label}</label>
          {f.type === "select" ? (
            <select value={vals[f.name]} onChange={(e) => setVals((s) => ({ ...s, [f.name]: e.target.value }))}>
              {f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          ) : f.type === "textarea" ? (
            <textarea rows={2} value={vals[f.name]} placeholder={f.placeholder} onChange={(e) => setVals((s) => ({ ...s, [f.name]: e.target.value }))} />
          ) : (
            <input type={f.type === "number" ? "number" : "text"} step="any" value={vals[f.name]} placeholder={f.placeholder}
              onChange={(e) => setVals((s) => ({ ...s, [f.name]: e.target.value }))} />
          )}
        </div>
      ))}
      <div className="fm-actions">
        <button type="button" className="chip" onClick={() => { setOpen(false); setVals(initial); }}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? "Saving…" : submitLabel}</button>
      </div>
    </form>
  );
}

function DelBtn({ onClick }: { onClick: () => void }) {
  return (
    <button className="icon-del" title="Delete" onClick={onClick}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6M10 11v6M14 11v6" /></svg>
    </button>
  );
}

function Loading() { return <section className="page"><p style={{ color: "var(--ink-500)", padding: 20 }}>Loading…</p></section>; }
const statusBadge = (s: string) => {
  const green = ["ACTIVE", "VERIFIED", "ACQUIRED", "OPEN"];
  const amber = ["ON_LEAVE", "PAUSED", "PIPELINE", "DUE_DILIGENCE", "OPPORTUNITY"];
  return <span className={`badge ${green.includes(s) ? "green" : amber.includes(s) ? "amber" : s === "INACTIVE" || s === "CLOSED" ? "red" : "blue"}`}>{s.replace(/_/g, " ")}</span>;
};

/* ================================================================= Team */
export function TeamPage() {
  const { data, loading, reload } = useSummary();
  if (loading || !data) return <Loading />;
  const t = data.team;
  async function del(id: string) { await api.delete(`/founder/employees/${id}`); reload(); }
  return (
    <section className="page">
      <div className="page-header"><div><div className="page-title">Team</div><div className="page-sub">Headcount, attendance, productivity &amp; performance</div></div></div>
      <div className="kpi-grid">
        <Kpi icon="team" tone="blue" label="Total Employees" value={String(t.total)} foot={`${t.active} active`} />
        <Kpi icon="users" tone="green" label="Present Today" value={String(t.presentToday)} foot={`${t.onLeave} on leave`} />
        <Kpi icon="target" tone={t.avgPerformance >= 70 ? "green" : t.avgPerformance >= 40 ? "amber" : "red"} label="Avg Productivity" value={`${t.avgPerformance}%`} />
        <Kpi icon="bell" tone={t.tasksPending ? "amber" : "green"} label="Tasks Pending" value={String(t.tasksPending)} />
        <Kpi icon="wallet" tone="blue" label="Monthly Payroll" value={formatCompactINR(t.monthlyPayroll)} />
      </div>
      <div className="grid-2">
        <Panel title="Performance Ranking" sub="Top employees by productivity score"
          action={<InlineForm endpoint="/founder/employees" submitLabel="Add employee" onSaved={reload}
            fields={[
              { name: "name", label: "Name", placeholder: "Full name" },
              { name: "title", label: "Title", placeholder: "e.g. Sales Lead" },
              { name: "department", label: "Department", placeholder: "e.g. Sales" },
              { name: "status", label: "Status", type: "select", options: [{ value: "ACTIVE", label: "Active" }, { value: "ON_LEAVE", label: "On leave" }, { value: "INACTIVE", label: "Inactive" }] },
              { name: "performanceScore", label: "Productivity (0-100)", type: "number", placeholder: "0-100" },
              { name: "tasksPending", label: "Tasks pending", type: "number", placeholder: "0" },
              { name: "monthlyCtc", label: "Monthly CTC (₹)", type: "number", placeholder: "0" },
              { name: "presentToday", label: "Present today", type: "select", options: [{ value: "true", label: "Yes" }, { value: "false", label: "No" }] },
            ]} />}>
          {t.ranking.length === 0 ? <p style={{ fontSize: 12.5, color: "var(--ink-500)" }}>No employees yet. Add your first team member.</p>
            : <div className="table-wrap"><table>
              <thead><tr><th>#</th><th>Name</th><th>Dept</th><th>Score</th><th>Status</th><th></th></tr></thead>
              <tbody>{t.ranking.map((e, i) => (
                <tr key={e.id}>
                  <td>{i + 1}</td>
                  <td><b>{e.name}</b>{e.title ? <div style={{ fontSize: 11, color: "var(--ink-500)" }}>{e.title}</div> : null}</td>
                  <td>{e.department}</td>
                  <td><b>{e.performanceScore}%</b></td>
                  <td>{statusBadge(e.status)}</td>
                  <td><DelBtn onClick={() => del(e.id)} /></td>
                </tr>
              ))}</tbody>
            </table></div>}
        </Panel>
        <Panel title="By Department" sub="Headcount distribution">
          {t.byDepartment.length === 0 ? <p style={{ fontSize: 12.5, color: "var(--ink-500)" }}>—</p>
            : t.byDepartment.map((d) => {
              const pct = t.total ? Math.round((d.count / t.total) * 100) : 0;
              return (
                <div style={{ marginBottom: 12 }} key={d.department}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 5 }}><span style={{ fontWeight: 600, color: "var(--ink-700)" }}>{d.department}</span><b>{d.count}</b></div>
                  <div className="progress-bar"><div className="progress-fill" style={{ width: `${Math.max(4, pct)}%` }} /></div>
                </div>
              );
            })}
        </Panel>
      </div>
    </section>
  );
}

/* ============================================================ Marketing */
export function MarketingPage() {
  const { data, loading, reload } = useSummary();
  if (loading || !data) return <Loading />;
  const m = data.marketing;
  async function del(id: string) { await api.delete(`/founder/campaigns/${id}`); reload(); }
  return (
    <section className="page">
      <div className="page-header"><div><div className="page-title">Marketing</div><div className="page-sub">Ad spend, cost-per-lead, ROI &amp; campaign performance</div></div></div>
      <div className="kpi-grid">
        <Kpi icon="mega" tone="blue" label="Active Campaigns" value={String(m.activeCampaigns)} />
        <Kpi icon="wallet" tone="amber" label="Ad Spend" value={formatCompactINR(m.totalSpend)} />
        <Kpi icon="spark" tone="green" label="Leads Generated" value={String(m.totalLeads)} />
        <Kpi icon="target" tone="blue" label="Cost / Lead" value={m.costPerLead ? formatINR(m.costPerLead) : "—"} />
        <Kpi icon="chart" tone={m.roi >= 0 ? "green" : "red"} label="ROI" value={`${m.roi}%`} foot={`${formatCompactINR(m.revenue)} attributed`} />
        <Kpi icon="trophy" tone="green" label="Conversions" value={String(m.totalConversions)} />
      </div>
      <div className="grid-2">
        <Panel title="Campaigns" sub="Spend, leads &amp; conversions"
          action={<InlineForm endpoint="/founder/campaigns" submitLabel="Add campaign" onSaved={reload}
            fields={[
              { name: "name", label: "Campaign name", placeholder: "e.g. Diwali Push" },
              { name: "channel", label: "Channel", type: "select", options: [{ value: "Instagram", label: "Instagram" }, { value: "Facebook", label: "Facebook" }, { value: "Google Ads", label: "Google Ads" }, { value: "WhatsApp", label: "WhatsApp" }, { value: "YouTube", label: "YouTube" }, { value: "SEO", label: "SEO" }, { value: "Other", label: "Other" }] },
              { name: "status", label: "Status", type: "select", options: [{ value: "ACTIVE", label: "Active" }, { value: "PAUSED", label: "Paused" }, { value: "COMPLETED", label: "Completed" }] },
              { name: "spend", label: "Spend (₹)", type: "number", placeholder: "0" },
              { name: "leads", label: "Leads", type: "number", placeholder: "0" },
              { name: "conversions", label: "Conversions", type: "number", placeholder: "0" },
              { name: "revenue", label: "Revenue attributed (₹)", type: "number", placeholder: "0", full: true },
            ]} />}>
          {m.campaigns.length === 0 ? <p style={{ fontSize: 12.5, color: "var(--ink-500)" }}>No campaigns yet. Add one to track spend &amp; ROI.</p>
            : <div className="table-wrap"><table>
              <thead><tr><th>Campaign</th><th>Channel</th><th>Spend</th><th>Leads</th><th>Status</th><th></th></tr></thead>
              <tbody>{m.campaigns.map((c) => (
                <tr key={c.id}>
                  <td><b>{c.name}</b></td><td>{c.channel}</td><td>{formatCompactINR(c.spend)}</td><td>{c.leads}</td>
                  <td>{statusBadge(c.status)}</td><td><DelBtn onClick={() => del(c.id)} /></td>
                </tr>
              ))}</tbody>
            </table></div>}
        </Panel>
        <Panel title="Spend by Channel" sub="Where the budget goes">
          {m.byChannel.length === 0 ? <p style={{ fontSize: 12.5, color: "var(--ink-500)" }}>—</p>
            : m.byChannel.map((c) => {
              const max = Math.max(1, ...m.byChannel.map((x) => x.spend));
              return (
                <div style={{ marginBottom: 12 }} key={c.channel}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 5 }}><span style={{ fontWeight: 600, color: "var(--ink-700)" }}>{c.channel}</span><b>{formatCompactINR(c.spend)} · {c.leads} leads</b></div>
                  <div className="progress-bar"><div className="progress-fill" style={{ width: `${Math.max(4, Math.round((c.spend / max) * 100))}%` }} /></div>
                </div>
              );
            })}
        </Panel>
      </div>
    </section>
  );
}

/* ============================================================= Land Bank */
export function LandBankPage() {
  const { data, loading, reload } = useSummary();
  if (loading || !data) return <Loading />;
  const l = data.landBank;
  async function del(id: string) { await api.delete(`/founder/land/${id}`); reload(); }
  const areaLabel = l.areaByUnit.length ? l.areaByUnit.map((a) => `${a.area} ${a.unit.toLowerCase()}`).join(" · ") : "—";
  return (
    <section className="page">
      <div className="page-header"><div><div className="page-title">Land Bank</div><div className="page-sub">Acquisition pipeline, valuation &amp; due-diligence — Truvi special</div></div></div>
      <div className="kpi-grid">
        <Kpi icon="land" tone="blue" label="Total Parcels" value={String(l.totalParcels)} foot={areaLabel} />
        <Kpi icon="shield" tone="green" label="Verified / Acquired" value={String(l.verified)} />
        <Kpi icon="chart" tone="amber" label="In Pipeline" value={String(l.inPipeline)} />
        <Kpi icon="wallet" tone="blue" label="Portfolio Value" value={formatCompactINR(l.totalValue)} />
        <Kpi icon="bell" tone={l.pendingDueDiligence ? "amber" : "green"} label="Pending Due Diligence" value={String(l.pendingDueDiligence)} />
      </div>
      <Panel title="Land Parcels" sub="Register of opportunities &amp; holdings"
        action={<InlineForm endpoint="/founder/land" submitLabel="Add parcel" onSaved={reload}
          fields={[
            { name: "name", label: "Parcel name", placeholder: "e.g. Gomti Nagar Plot" },
            { name: "location", label: "Location", placeholder: "City / area" },
            { name: "area", label: "Area", type: "number", placeholder: "0" },
            { name: "areaUnit", label: "Unit", type: "select", options: [{ value: "ACRE", label: "Acre" }, { value: "BIGHA", label: "Bigha" }, { value: "SQFT", label: "Sq. ft" }, { value: "HECTARE", label: "Hectare" }] },
            { name: "status", label: "Status", type: "select", options: [{ value: "OPPORTUNITY", label: "Opportunity" }, { value: "PIPELINE", label: "Pipeline" }, { value: "DUE_DILIGENCE", label: "Due diligence" }, { value: "VERIFIED", label: "Verified" }, { value: "ACQUIRED", label: "Acquired" }] },
            { name: "estimatedValue", label: "Est. value (₹)", type: "number", placeholder: "0" },
            { name: "priority", label: "Priority", type: "select", options: [{ value: "HIGH", label: "High" }, { value: "MEDIUM", label: "Medium" }, { value: "LOW", label: "Low" }] },
            { name: "dueDiligenceDone", label: "Due diligence done", type: "select", options: [{ value: "false", label: "No" }, { value: "true", label: "Yes" }] },
            { name: "notes", label: "Notes", type: "textarea", full: true, placeholder: "Optional" },
          ]} />}>
        {l.parcels.length === 0 ? <p style={{ fontSize: 12.5, color: "var(--ink-500)" }}>No land parcels tracked yet.</p>
          : <div className="table-wrap"><table>
            <thead><tr><th>Parcel</th><th>Location</th><th>Area</th><th>Value</th><th>Priority</th><th>DD</th><th>Status</th><th></th></tr></thead>
            <tbody>{l.parcels.map((p) => (
              <tr key={p.id}>
                <td><b>{p.name}</b></td><td>{p.location}</td><td>{p.area} {p.areaUnit.toLowerCase()}</td>
                <td>{formatCompactINR(p.estimatedValue)}</td>
                <td><span className={`badge ${p.priority === "HIGH" ? "red" : p.priority === "MEDIUM" ? "amber" : "blue"}`}>{p.priority}</span></td>
                <td>{p.dueDiligenceDone ? <span className="badge green">Done</span> : <span className="badge amber">Pending</span>}</td>
                <td>{statusBadge(p.status)}</td><td><DelBtn onClick={() => del(p.id)} /></td>
              </tr>
            ))}</tbody>
          </table></div>}
      </Panel>
    </section>
  );
}

/* ============================================================== Investor */
export function InvestorPage() {
  const { data, loading, reload } = useSummary();
  if (loading || !data) return <Loading />;
  const v = data.investor;
  async function delCap(id: string) { await api.delete(`/founder/cap-table/${id}`); reload(); }
  async function delUpdate(id: string) { await api.delete(`/founder/updates/${id}`); reload(); }
  return (
    <section className="page">
      <div className="page-header"><div><div className="page-title">Investor</div><div className="page-sub">Valuation, fundraising, cap table &amp; ESOP</div></div></div>
      <div className="kpi-grid">
        <Kpi icon="trophy" tone="blue" label="Valuation" value={v.valuation ? formatCompactINR(v.valuation) : "—"} foot={v.activeRound ? v.activeRound.name : "No active round"} />
        <Kpi icon="wallet" tone="green" label="Total Raised" value={formatCompactINR(v.totalRaised)} />
        <Kpi icon="chart" tone="amber" label="Round Progress" value={v.activeRound ? `${v.activeRound.progress}%` : "—"} foot={v.activeRound ? `${formatCompactINR(v.activeRound.committed)} / ${formatCompactINR(v.activeRound.target)}` : undefined} />
        <Kpi icon="team" tone="blue" label="ESOP Pool" value={`${v.esopPercent}%`} />
      </div>
      {v.activeRound && (
        <Panel title={`Fundraise · ${v.activeRound.name}`} sub={`${statusBadgeText(v.activeRound.status)} · target ${formatCompactINR(v.activeRound.target)}`}>
          <div className="progress-bar" style={{ height: 10 }}><div className="progress-fill" style={{ width: `${Math.max(3, v.activeRound.progress)}%` }} /></div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginTop: 8, color: "var(--ink-500)" }}>
            <span>Committed <b style={{ color: "var(--ink-700)" }}>{formatINR(v.activeRound.committed)}</b></span>
            <span>Valuation <b style={{ color: "var(--ink-700)" }}>{formatINR(v.activeRound.valuation)}</b></span>
          </div>
        </Panel>
      )}
      <div className="grid-2">
        <Panel title="Cap Table" sub="Equity holders & ESOP"
          action={<InlineForm endpoint="/founder/cap-table" submitLabel="Add holder" onSaved={reload}
            fields={[
              { name: "holderName", label: "Holder name", placeholder: "e.g. Angel Fund" },
              { name: "holderType", label: "Type", type: "select", options: [{ value: "FOUNDER", label: "Founder" }, { value: "INVESTOR", label: "Investor" }, { value: "ANGEL", label: "Angel" }, { value: "ESOP", label: "ESOP" }, { value: "OTHER", label: "Other" }] },
              { name: "equityPercent", label: "Equity %", type: "number", placeholder: "0-100" },
              { name: "investedAmount", label: "Invested (₹)", type: "number", placeholder: "0" },
            ]} />}>
          {v.capTable.length === 0 ? <p style={{ fontSize: 12.5, color: "var(--ink-500)" }}>No cap-table entries yet.</p>
            : <div className="table-wrap"><table>
              <thead><tr><th>Holder</th><th>Type</th><th>Equity</th><th>Invested</th><th></th></tr></thead>
              <tbody>{v.capTable.map((c) => (
                <tr key={c.id}>
                  <td><b>{c.holderName}</b></td><td>{statusBadge(c.holderType)}</td><td><b>{c.equityPercent}%</b></td>
                  <td>{formatCompactINR(c.investedAmount)}</td><td><DelBtn onClick={() => delCap(c.id)} /></td>
                </tr>
              ))}</tbody>
            </table></div>}
        </Panel>
        <Panel title="Investor Updates" sub="Latest notes to investors"
          action={<InlineForm endpoint="/founder/updates" submitLabel="Post update" onSaved={reload}
            fields={[
              { name: "title", label: "Title", placeholder: "e.g. June 2026 Update", full: true },
              { name: "body", label: "Body", type: "textarea", full: true, placeholder: "Highlights, metrics, asks…" },
            ]} />}>
          {v.updates.length === 0 ? <p style={{ fontSize: 12.5, color: "var(--ink-500)" }}>No updates posted yet.</p>
            : v.updates.map((u) => (
              <div className="list-row" key={u.id}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--ink-700)" }}>{u.title}</div>
                  {u.body ? <div style={{ fontSize: 11.5, color: "var(--ink-500)", marginTop: 2 }}>{u.body}</div> : null}
                  <div style={{ fontSize: 10.5, color: "var(--ink-500)", marginTop: 3 }}>{new Date(u.createdAt).toLocaleDateString("en-IN", { year: "numeric", month: "short", day: "numeric" })}</div>
                </div>
                <DelBtn onClick={() => delUpdate(u.id)} />
              </div>
            ))}
        </Panel>
      </div>
    </section>
  );
}

function statusBadgeText(s: string) { return s === "OPEN" ? "Open round" : "Closed"; }

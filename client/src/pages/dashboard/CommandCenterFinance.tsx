import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { formatCompactINR, formatINR } from "@/lib/utils";
import { useSocketEvent } from "@/lib/socket";
import { toast } from "sonner";
import { Kpi, Panel } from "@/pages/dashboard/DashboardOS";

/* ------------------------------------------------------------------ types */
export type FinSection =
  | "investment" | "monthly-investment" | "revenue" | "monthly-revenue" | "payments" | "salaries";

export interface CommandFinanceSummary {
  monthKey: string;
  monthLabel: string;
  investments: { total: number; thisMonth: number; count: number; monthCount: number };
  revenue: { total: number; thisMonth: number; count: number; monthCount: number };
  monthlyPayments: { total: number; activeCount: number; totalCount: number; byCategory: { category: string; amount: number }[] };
  salaries: {
    payable: number; paid: number; pending: number; employeeCount: number; paidCount: number; pendingCount: number;
    upcoming: { id: string; name: string; amount: number; dueDate: string }[];
  };
}

interface EntryRow { _id: string; title: string; category: string; amount: number; date: string; notes: string | null }
interface RecurringRow { _id: string; label: string; category: string; amount: number; notes: string | null; active: boolean }
interface SalaryRow { id: string; name: string; title: string | null; department: string; status: string; monthlyCtc: number; salaryDueDay: number; paidThisMonth: boolean }

/* ------------------------------------------------------------------- hook */
export function useCommandFinance() {
  const [summary, setSummary] = useState<CommandFinanceSummary | null>(null);
  const load = useCallback(async () => {
    try { setSummary((await api.get("/command-finance/summary")).data); }
    catch { /* keep last-known; a stale card beats a blank one */ }
  }, []);
  useEffect(() => { load(); }, [load]);
  useSocketEvent("command-finance:update", load);
  return { summary, reload: load };
}

/* ------------------------------------------------------------ inline form */
type Field = {
  name: string; label: string; type?: "text" | "number" | "select" | "textarea" | "date";
  options?: { value: string; label: string }[]; placeholder?: string; full?: boolean; defaultValue?: string;
};
const todayISO = () => new Date().toISOString().slice(0, 10);

function InlineForm({ fields, submitLabel, onSubmit }: { fields: Field[]; submitLabel: string; onSubmit: (v: Record<string, string>) => Promise<void> }) {
  const initial = useMemo(
    () => Object.fromEntries(fields.map((f) => [f.name, f.defaultValue ?? (f.type === "select" ? f.options?.[0]?.value ?? "" : f.type === "date" ? todayISO() : "")])),
    [fields]
  );
  const [open, setOpen] = useState(false);
  const [vals, setVals] = useState<Record<string, string>>(initial);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const payload: Record<string, string> = {};
      for (const [k, v] of Object.entries(vals)) if (v !== "") payload[k] = v;
      await onSubmit(payload);
      setVals(initial); setOpen(false);
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
            <input type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"} step="any" value={vals[f.name]} placeholder={f.placeholder}
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

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
const isThisMonth = (iso: string) => { const d = new Date(iso); const n = new Date(); return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth(); };

const INVESTMENT_CATEGORIES = ["Product", "Infrastructure", "Marketing", "Team", "Legal", "Equipment", "Operations", "General"];
const REVENUE_CATEGORIES = ["Sales", "Subscription", "Commission", "Service", "Consulting", "Other"];
const RECURRING_CATEGORIES = [
  { value: "API", label: "API subscription" },
  { value: "SOFTWARE", label: "Software subscription" },
  { value: "HOSTING", label: "Hosting / Server" },
  { value: "TWILIO", label: "Twilio / Messaging" },
  { value: "OFFICE", label: "Office expense" },
  { value: "MARKETING", label: "Marketing" },
  { value: "OTHER", label: "Other" },
];
const recurringLabel = (v: string) => RECURRING_CATEGORIES.find((c) => c.value === v)?.label ?? v;

/* =========================================================== overview cards */
/**
 * The six always-visible financial summary cards for the Command Center. Each
 * is tappable and opens the matching detail section via `onOpen`.
 */
export function FinancialCards({ summary, onOpen }: { summary: CommandFinanceSummary | null; onOpen: (s: FinSection) => void }) {
  const s = summary;
  return (
    <>
      <div className="section-label" style={{ margin: "4px 0 12px", fontSize: 12, fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", color: "var(--ink-500)" }}>
        Financial Command Center{s ? ` · ${s.monthLabel}` : ""}
      </div>
      <div className="kpi-grid">
        <Kpi icon="wallet" tone="blue" label="Total Investment" value={s ? formatCompactINR(s.investments.total) : "—"} foot={s ? `${s.investments.count} entr${s.investments.count === 1 ? "y" : "ies"}` : "Loading…"} onClick={() => onOpen("investment")} />
        <Kpi icon="trendUp" tone="blue" label="Monthly Investment" value={s ? formatCompactINR(s.investments.thisMonth) : "—"} foot={s ? `${s.investments.monthCount} this month` : "Loading…"} onClick={() => onOpen("monthly-investment")} />
        <Kpi icon="chart" tone="green" label="Total Revenue" value={s ? formatCompactINR(s.revenue.total) : "—"} foot={s ? `${s.revenue.count} entr${s.revenue.count === 1 ? "y" : "ies"}` : "Loading…"} onClick={() => onOpen("revenue")} />
        <Kpi icon="spark" tone="green" label="Monthly Revenue" value={s ? formatCompactINR(s.revenue.thisMonth) : "—"} foot={s ? `${s.revenue.monthCount} this month` : "Loading…"} onClick={() => onOpen("monthly-revenue")} />
        <Kpi icon="refresh" tone="amber" label="Monthly Payments" value={s ? formatCompactINR(s.monthlyPayments.total) : "—"} foot={s ? `${s.monthlyPayments.activeCount} recurring` : "Loading…"} onClick={() => onOpen("payments")} />
        <Kpi icon="team" tone={s && s.salaries.pending > 0 ? "amber" : "green"} label="Employee Salaries" value={s ? formatCompactINR(s.salaries.payable) : "—"} foot={s ? `${formatCompactINR(s.salaries.pending)} pending` : "Loading…"} onClick={() => onOpen("salaries")} />
      </div>
    </>
  );
}

/* ============================================================= detail page */
const SECTIONS: { key: FinSection; label: string; icon: string }[] = [
  { key: "investment", label: "Total Investment", icon: "wallet" },
  { key: "monthly-investment", label: "Monthly Investment", icon: "trendUp" },
  { key: "revenue", label: "Total Revenue", icon: "chart" },
  { key: "monthly-revenue", label: "Monthly Revenue", icon: "spark" },
  { key: "payments", label: "Monthly Payments", icon: "refresh" },
  { key: "salaries", label: "Employee Salaries", icon: "team" },
];

export function FinancialsPage({ initialSection = "investment" }: { initialSection?: FinSection }) {
  const { summary, reload } = useCommandFinance();
  const [section, setSection] = useState<FinSection>(initialSection);
  useEffect(() => { setSection(initialSection); }, [initialSection]);

  return (
    <section className="page">
      <div className="page-header">
        <div><div className="page-title">Financials</div><div className="page-sub">Investments, revenue, recurring payments &amp; salaries · Live{summary ? ` · ${summary.monthLabel}` : ""}</div></div>
      </div>

      <FinancialCards summary={summary} onOpen={setSection} />

      <div className="fin-tabs" style={{ display: "flex", flexWrap: "wrap", gap: 8, margin: "6px 0 4px" }}>
        {SECTIONS.map((t) => (
          <button key={t.key} className={`chip${section === t.key ? " active" : ""}`} style={section === t.key ? { background: "var(--brand-100, rgba(124,92,255,.14))", color: "var(--brand-600, #7C5CFF)", borderColor: "var(--brand-500, #7C5CFF)" } : undefined} onClick={() => setSection(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {section === "investment" && <EntrySection kind="investment" summary={summary} reload={reload} />}
      {section === "monthly-investment" && <EntrySection kind="investment" monthly summary={summary} reload={reload} />}
      {section === "revenue" && <EntrySection kind="revenue" summary={summary} reload={reload} />}
      {section === "monthly-revenue" && <EntrySection kind="revenue" monthly summary={summary} reload={reload} />}
      {section === "payments" && <PaymentsSection summary={summary} reload={reload} />}
      {section === "salaries" && <SalariesSection summary={summary} reload={reload} />}
    </section>
  );
}

/* ------------------------------------------------ investment / revenue view */
function EntrySection({ kind, monthly, summary, reload }: { kind: "investment" | "revenue"; monthly?: boolean; summary: CommandFinanceSummary | null; reload: () => void }) {
  const isInvest = kind === "investment";
  const path = isInvest ? "/command-finance/investments" : "/command-finance/revenues";
  const listKey = isInvest ? "investments" : "revenues";
  const [rows, setRows] = useState<EntryRow[] | null>(null);
  const categories = isInvest ? INVESTMENT_CATEGORIES : REVENUE_CATEGORIES;

  const load = useCallback(async () => {
    try { setRows((await api.get(path)).data[listKey]); } catch { setRows([]); }
  }, [path, listKey]);
  useEffect(() => { load(); }, [load]);
  useSocketEvent("command-finance:update", load);

  const shown = useMemo(() => (rows || []).filter((r) => !monthly || isThisMonth(r.date)), [rows, monthly]);
  const total = shown.reduce((sm, r) => sm + r.amount, 0);

  async function add(v: Record<string, string>) {
    try { await api.post(path, v); toast.success("Saved"); reload(); load(); }
    catch (err: any) { toast.error(err?.response?.data?.error || "Failed to save"); throw err; }
  }
  async function del(id: string) {
    try { await api.delete(`${path}/${id}`); reload(); load(); }
    catch (err: any) { toast.error(err?.response?.data?.error || "Failed to delete"); }
  }

  const noun = isInvest ? "investment" : "revenue entry";
  const title = monthly ? (isInvest ? "This Month's Investments" : "This Month's Revenue") : (isInvest ? "All Investments" : "All Revenue");
  const headTone = isInvest ? "blue" : "green";

  return (
    <>
      <div className="kpi-grid">
        <Kpi icon={isInvest ? "wallet" : "chart"} tone={headTone} label={monthly ? "This Month" : "Total"} value={formatINR(total)} foot={`${shown.length} entr${shown.length === 1 ? "y" : "ies"}`} />
        {summary && !monthly && <Kpi icon="trendUp" tone={headTone} label="This Month" value={formatINR(isInvest ? summary.investments.thisMonth : summary.revenue.thisMonth)} />}
        {summary && monthly && <Kpi icon={isInvest ? "wallet" : "chart"} tone={headTone} label="All-time Total" value={formatINR(isInvest ? summary.investments.total : summary.revenue.total)} />}
      </div>
      <Panel
        title={title}
        sub={monthly ? "Automatically limited to the current month — resets each month" : `Every entry updates the ${isInvest ? "Total Investment" : "Total Revenue"} card instantly`}
        icon={isInvest ? "wallet" : "chart"} iconTone={headTone}
        action={monthly ? undefined : (
          <InlineForm submitLabel={`Add ${noun}`} onSubmit={add}
            fields={[
              { name: "title", label: isInvest ? "Title / Purpose" : "Title", placeholder: isInvest ? "e.g. Cloud infrastructure" : "e.g. Enterprise plan sale" },
              { name: "category", label: "Category", type: "select", options: categories.map((c) => ({ value: c, label: c })) },
              { name: "amount", label: "Amount (₹)", type: "number", placeholder: "0" },
              { name: "date", label: "Date", type: "date" },
              { name: "notes", label: "Notes (optional)", type: "textarea", placeholder: "Any details…", full: true },
            ]} />
        )}
      >
        {rows === null ? <p style={{ fontSize: 12.5, color: "var(--ink-500)" }}>Loading…</p>
          : shown.length === 0 ? <p style={{ fontSize: 12.5, color: "var(--ink-500)" }}>{monthly ? `No ${noun}s recorded this month yet.` : `No ${noun}s yet. Add your first one.`}</p>
          : <div className="table-wrap"><table>
              <thead><tr><th>{isInvest ? "Purpose" : "Title"}</th><th>Category</th><th>Date</th><th>Amount</th>{!monthly && <th></th>}</tr></thead>
              <tbody>{shown.map((r) => (
                <tr key={r._id}>
                  <td><b>{r.title}</b>{r.notes ? <div style={{ fontSize: 11, color: "var(--ink-500)" }}>{r.notes}</div> : null}</td>
                  <td><span className="badge blue">{r.category}</span></td>
                  <td>{fmtDate(r.date)}</td>
                  <td><b>{formatINR(r.amount)}</b></td>
                  {!monthly && <td><DelBtn onClick={() => del(r._id)} /></td>}
                </tr>
              ))}</tbody>
            </table></div>}
      </Panel>
    </>
  );
}

/* -------------------------------------------------- recurring payments view */
function PaymentsSection({ summary, reload }: { summary: CommandFinanceSummary | null; reload: () => void }) {
  const [rows, setRows] = useState<RecurringRow[] | null>(null);
  const load = useCallback(async () => {
    try { setRows((await api.get("/command-finance/recurring")).data.recurring); } catch { setRows([]); }
  }, []);
  useEffect(() => { load(); }, [load]);
  useSocketEvent("command-finance:update", load);

  const activeTotal = (rows || []).filter((r) => r.active).reduce((s, r) => s + r.amount, 0);

  async function add(v: Record<string, string>) {
    try { await api.post("/command-finance/recurring", v); toast.success("Saved"); reload(); load(); }
    catch (err: any) { toast.error(err?.response?.data?.error || "Failed to save"); throw err; }
  }
  async function toggle(r: RecurringRow) {
    try { await api.patch(`/command-finance/recurring/${r._id}`, { active: !r.active }); reload(); load(); }
    catch (err: any) { toast.error(err?.response?.data?.error || "Failed to update"); }
  }
  async function del(id: string) {
    try { await api.delete(`/command-finance/recurring/${id}`); reload(); load(); }
    catch (err: any) { toast.error(err?.response?.data?.error || "Failed to delete"); }
  }

  return (
    <>
      <div className="kpi-grid">
        <Kpi icon="refresh" tone="amber" label="Total Monthly Payments" value={formatINR(activeTotal)} foot={`${(rows || []).filter((r) => r.active).length} active recurring`} />
        {summary?.monthlyPayments.byCategory.slice(0, 4).map((c) => (
          <Kpi key={c.category} icon="wallet" tone="blue" label={recurringLabel(c.category)} value={formatINR(c.amount)} />
        ))}
      </div>
      <Panel
        title="Recurring Monthly Payments"
        sub="API & software subscriptions, hosting, Twilio, office & other recurring costs — the total feeds the dashboard card automatically"
        icon="refresh" iconTone="amber"
        action={
          <InlineForm submitLabel="Add payment" onSubmit={add}
            fields={[
              { name: "label", label: "Label", placeholder: "e.g. AWS hosting" },
              { name: "category", label: "Category", type: "select", options: RECURRING_CATEGORIES },
              { name: "amount", label: "Monthly amount (₹)", type: "number", placeholder: "0" },
              { name: "notes", label: "Notes (optional)", type: "textarea", placeholder: "Any details…", full: true },
            ]} />
        }
      >
        {rows === null ? <p style={{ fontSize: 12.5, color: "var(--ink-500)" }}>Loading…</p>
          : rows.length === 0 ? <p style={{ fontSize: 12.5, color: "var(--ink-500)" }}>No recurring payments yet. Add your subscriptions, hosting &amp; office costs.</p>
          : <div className="table-wrap"><table>
              <thead><tr><th>Payment</th><th>Category</th><th>Monthly</th><th>Status</th><th></th></tr></thead>
              <tbody>{rows.map((r) => (
                <tr key={r._id} style={r.active ? undefined : { opacity: 0.55 }}>
                  <td><b>{r.label}</b>{r.notes ? <div style={{ fontSize: 11, color: "var(--ink-500)" }}>{r.notes}</div> : null}</td>
                  <td><span className="badge blue">{recurringLabel(r.category)}</span></td>
                  <td><b>{formatINR(r.amount)}</b></td>
                  <td><button className={`badge ${r.active ? "green" : "amber"}`} style={{ cursor: "pointer", border: "none" }} onClick={() => toggle(r)} title="Toggle active">{r.active ? "Active" : "Paused"}</button></td>
                  <td><DelBtn onClick={() => del(r._id)} /></td>
                </tr>
              ))}</tbody>
            </table></div>}
      </Panel>
    </>
  );
}

/* ------------------------------------------------------- salary management */
function SalariesSection({ summary, reload }: { summary: CommandFinanceSummary | null; reload: () => void }) {
  const [rows, setRows] = useState<SalaryRow[] | null>(null);
  const load = useCallback(async () => {
    try { setRows((await api.get("/command-finance/salaries")).data.employees); } catch { setRows([]); }
  }, []);
  useEffect(() => { load(); }, [load]);
  useSocketEvent("command-finance:update", load);

  const s = summary?.salaries;

  async function pay(id: string, paid: boolean) {
    try { await api.post(`/command-finance/salaries/${id}/pay`, { paid }); reload(); load(); }
    catch (err: any) { toast.error(err?.response?.data?.error || "Failed to update"); }
  }
  async function add(v: Record<string, string>) {
    try { await api.post("/founder/employees", v); toast.success("Employee added"); reload(); load(); }
    catch (err: any) { toast.error(err?.response?.data?.error || "Failed to save"); throw err; }
  }

  const active = (rows || []).filter((e) => e.status !== "INACTIVE");

  return (
    <>
      <div className="kpi-grid">
        <Kpi icon="wallet" tone="blue" label="Payable This Month" value={s ? formatINR(s.payable) : "—"} foot={s ? `${s.employeeCount} employees` : ""} />
        <Kpi icon="check" tone="green" label="Paid" value={s ? formatINR(s.paid) : "—"} foot={s ? `${s.paidCount} paid` : ""} />
        <Kpi icon="bell" tone={s && s.pending > 0 ? "amber" : "green"} label="Pending" value={s ? formatINR(s.pending) : "—"} foot={s ? `${s.pendingCount} pending` : ""} />
        <Kpi icon="target" tone="blue" label="Upcoming Due" value={s ? String(s.upcoming.length) : "—"} foot="Not yet paid this month" />
      </div>

      <div className="grid-2">
        <Panel
          title="Employee Salaries"
          sub="Mark salaries paid as you disburse them — resets automatically each month"
          icon="team" iconTone="blue"
          action={
            <InlineForm submitLabel="Add employee" onSubmit={add}
              fields={[
                { name: "name", label: "Name", placeholder: "Full name" },
                { name: "title", label: "Title", placeholder: "e.g. Engineer" },
                { name: "department", label: "Department", placeholder: "e.g. Engineering" },
                { name: "monthlyCtc", label: "Monthly salary (₹)", type: "number", placeholder: "0" },
                { name: "salaryDueDay", label: "Salary due day (1-28)", type: "number", placeholder: "1" },
              ]} />
          }
        >
          {rows === null ? <p style={{ fontSize: 12.5, color: "var(--ink-500)" }}>Loading…</p>
            : active.length === 0 ? <p style={{ fontSize: 12.5, color: "var(--ink-500)" }}>No employees yet. Add your team to track salaries.</p>
            : <div className="table-wrap"><table>
                <thead><tr><th>Employee</th><th>Salary</th><th>Due</th><th>Status</th><th></th></tr></thead>
                <tbody>{active.map((e) => (
                  <tr key={e.id}>
                    <td><b>{e.name}</b>{e.title ? <div style={{ fontSize: 11, color: "var(--ink-500)" }}>{e.title} · {e.department}</div> : <div style={{ fontSize: 11, color: "var(--ink-500)" }}>{e.department}</div>}</td>
                    <td><b>{formatINR(e.monthlyCtc)}</b></td>
                    <td>Day {e.salaryDueDay}</td>
                    <td>{e.paidThisMonth ? <span className="badge green">Paid</span> : <span className="badge amber">Pending</span>}</td>
                    <td>
                      {e.paidThisMonth
                        ? <button className="chip" onClick={() => pay(e.id, false)}>Undo</button>
                        : <button className="btn btn-primary" onClick={() => pay(e.id, true)}>Mark paid</button>}
                    </td>
                  </tr>
                ))}</tbody>
              </table></div>}
        </Panel>
        <Panel title="Upcoming Salary Due Dates" sub="Employees not yet paid this month" icon="bell" iconTone="amber">
          {!s || s.upcoming.length === 0
            ? <p style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--ink-500)" }}><span className="status-dot green" /> All salaries for this month are cleared.</p>
            : s.upcoming.map((u) => (
              <div className="list-row" key={u.id}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink-700)" }}>{u.name}</div>
                  <div style={{ fontSize: 11.5, color: "var(--ink-500)" }}>Due {fmtDate(u.dueDate)}</div>
                </div>
                <b>{formatINR(u.amount)}</b>
                <button className="btn btn-primary" onClick={() => pay(u.id, true)} style={{ marginLeft: 10 }}>Pay</button>
              </div>
            ))}
        </Panel>
      </div>
    </>
  );
}

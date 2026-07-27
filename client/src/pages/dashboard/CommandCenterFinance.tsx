import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { formatCompactINR, formatINR } from "@/lib/utils";
import { useSocketEvent } from "@/lib/socket";
import { toast } from "sonner";
import { Kpi, Panel } from "@/pages/dashboard/DashboardOS";

/* ------------------------------------------------------------------ types */
export type FinSection =
  | "investment" | "monthly-investment" | "revenue" | "monthly-revenue" | "today-revenue" | "costing" | "salaries";

export interface CommandFinanceSummary {
  monthKey: string;
  monthLabel: string;
  investments: { total: number; thisMonth: number; count: number; monthCount: number };
  revenue: { total: number; thisMonth: number; today: number; count: number; monthCount: number; todayCount: number };
  monthlyCosting: {
    total: number; finalMonthlyCost: number; paidThisMonth: number; pending: number;
    activeCount: number; totalCount: number; paidCount: number; pendingCount: number; upcomingCount: number;
    upcoming: { id: string; label: string; category: string; amount: number; dueDate: string }[];
    byCategory: { category: string; amount: number }[];
  };
  salaries: {
    payable: number; paid: number; pending: number; employeeCount: number; paidCount: number; pendingCount: number;
    upcoming: { id: string; name: string; amount: number; dueDate: string }[];
  };
  profitLoss: { total: number; monthly: number };
}

interface EntryRow { _id: string; title: string; category: string; amount: number; date: string; notes: string | null }
interface CostingRow { _id: string; label: string; category: string; amount: number; dueDay: number; paidThisMonth: boolean; paidDate: string | null; notes: string | null; active: boolean }
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
const sameMonth = (iso: string, ref: Date) => { const d = new Date(iso); return d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth(); };
const isToday = (iso: string) => { const d = new Date(iso); const n = new Date(); return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate(); };

const INVESTMENT_CATEGORIES = ["Product", "Infrastructure", "Marketing", "Team", "Legal", "Equipment", "Operations", "General"];
const REVENUE_CATEGORIES = ["Sales", "Subscription", "Commission", "Service", "Consulting", "Other"];
const COSTING_CATEGORIES = ["API Charges", "Software Subscription", "Server / Hosting", "Twilio", "Office Rent", "Internet", "Marketing", "Utilities", "Other"];

/* =========================================================== overview cards */
/**
 * The always-visible financial summary cards for the Command Center / Revenue
 * dashboard. Each is tappable and opens the matching detail section via
 * `onOpen`. Every figure updates instantly on a command-finance:update event.
 */
export function FinancialCards({ summary, onOpen }: { summary: CommandFinanceSummary | null; onOpen: (s: FinSection) => void }) {
  const s = summary;
  const pl = s?.profitLoss.total ?? 0;
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
        <Kpi icon="bolt" tone="green" label="Today's Revenue" value={s ? formatINR(s.revenue.today) : "—"} foot={s ? `${s.revenue.todayCount} today` : "Loading…"} onClick={() => onOpen("today-revenue")} />
        <Kpi icon="refresh" tone="amber" label="Monthly Costing" value={s ? formatCompactINR(s.monthlyCosting.total) : "—"} foot={s ? `${formatCompactINR(s.monthlyCosting.pending)} pending` : "Loading…"} onClick={() => onOpen("costing")} />
        <Kpi icon="team" tone={s && s.salaries.pending > 0 ? "amber" : "green"} label="Employee Salaries" value={s ? formatCompactINR(s.salaries.payable) : "—"} foot={s ? `${formatCompactINR(s.salaries.pending)} pending` : "Loading…"} onClick={() => onOpen("salaries")} />
        <Kpi icon="trophy" tone={pl >= 0 ? "green" : "red"} label="Profit / Loss" value={s ? `${pl >= 0 ? "" : "−"}${formatCompactINR(Math.abs(pl))}` : "—"} foot="Revenue − Investment − Costing" />
      </div>
    </>
  );
}

/* ============================================================= detail page */
const SECTIONS: { key: FinSection; label: string }[] = [
  { key: "investment", label: "Total Investment" },
  { key: "monthly-investment", label: "Monthly Investment" },
  { key: "revenue", label: "Total Revenue" },
  { key: "monthly-revenue", label: "Monthly Revenue" },
  { key: "today-revenue", label: "Today's Revenue" },
  { key: "costing", label: "Monthly Costing" },
  { key: "salaries", label: "Employee Salaries" },
];

export function FinancialsPage({ initialSection = "investment" }: { initialSection?: FinSection }) {
  const { summary, reload } = useCommandFinance();
  const [section, setSection] = useState<FinSection>(initialSection);
  useEffect(() => { setSection(initialSection); }, [initialSection]);

  return (
    <section className="page">
      <div className="page-header">
        <div><div className="page-title">Financials</div><div className="page-sub">Investment, revenue, monthly costing &amp; salaries · Live{summary ? ` · ${summary.monthLabel}` : ""}</div></div>
      </div>

      <FinancialCards summary={summary} onOpen={setSection} />

      <div className="fin-tabs" style={{ display: "flex", flexWrap: "wrap", gap: 8, margin: "6px 0 4px" }}>
        {SECTIONS.map((t) => (
          <button key={t.key} className="chip" style={section === t.key ? { background: "var(--brand-100, rgba(124,92,255,.14))", color: "var(--brand-600, #7C5CFF)", borderColor: "var(--brand-500, #7C5CFF)" } : undefined} onClick={() => setSection(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {section === "investment" && <EntrySection kind="investment" mode="all" summary={summary} reload={reload} />}
      {section === "monthly-investment" && <EntrySection kind="investment" mode="monthly" summary={summary} reload={reload} />}
      {section === "revenue" && <EntrySection kind="revenue" mode="all" summary={summary} reload={reload} />}
      {section === "monthly-revenue" && <EntrySection kind="revenue" mode="monthly" summary={summary} reload={reload} />}
      {section === "today-revenue" && <EntrySection kind="revenue" mode="today" summary={summary} reload={reload} />}
      {section === "costing" && <CostingSection summary={summary} reload={reload} />}
      {section === "salaries" && <SalariesSection summary={summary} reload={reload} />}
    </section>
  );
}

/** Standalone Founders-Only "Monthly Costing" page (sidebar section). */
export function MonthlyCostingPage() {
  const { summary, reload } = useCommandFinance();
  return (
    <section className="page">
      <div className="page-header">
        <div><div className="page-title">Monthly Costing</div><div className="page-sub">All recurring monthly business expenses · Live{summary ? ` · ${summary.monthLabel}` : ""}</div></div>
      </div>
      <CostingSection summary={summary} reload={reload} />
    </section>
  );
}

/* ------------------------------------------------ investment / revenue view */
function EntrySection({ kind, mode, summary, reload }: { kind: "investment" | "revenue"; mode: "all" | "monthly" | "today"; summary: CommandFinanceSummary | null; reload: () => void }) {
  const isInvest = kind === "investment";
  const path = isInvest ? "/command-finance/investments" : "/command-finance/revenues";
  const listKey = isInvest ? "investments" : "revenues";
  const [rows, setRows] = useState<EntryRow[] | null>(null);
  const [monthOffset, setMonthOffset] = useState(0); // 0 = current month, negative = past
  const categories = isInvest ? INVESTMENT_CATEGORIES : REVENUE_CATEGORIES;

  const load = useCallback(async () => {
    try { setRows((await api.get(path)).data[listKey]); } catch { setRows([]); }
  }, [path, listKey]);
  useEffect(() => { load(); }, [load]);
  useSocketEvent("command-finance:update", load);

  const now = new Date();
  const selMonth = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
  const selLabel = selMonth.toLocaleString("en-IN", { month: "long", year: "numeric" });

  const shown = useMemo(() => (rows || []).filter((r) => {
    if (mode === "monthly") return sameMonth(r.date, selMonth);
    if (mode === "today") return isToday(r.date);
    return true;
  }), [rows, mode, selMonth]);
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
  const headTone = isInvest ? "blue" : "green";
  const title =
    mode === "today" ? (isInvest ? "Today's Investments" : "Today's Revenue")
    : mode === "monthly" ? `${selLabel} — ${isInvest ? "Investments" : "Revenue"}`
    : (isInvest ? "All Investments" : "All Revenue");
  const metricLabel = mode === "today" ? "Today" : mode === "monthly" ? selLabel : "Total";

  return (
    <>
      <div className="kpi-grid">
        <Kpi icon={isInvest ? "wallet" : "chart"} tone={headTone} label={metricLabel} value={formatINR(total)} foot={`${shown.length} entr${shown.length === 1 ? "y" : "ies"}`} />
        {summary && mode !== "all" && <Kpi icon={isInvest ? "wallet" : "chart"} tone={headTone} label="All-time Total" value={formatINR(isInvest ? summary.investments.total : summary.revenue.total)} />}
        {summary && mode === "all" && <Kpi icon="trendUp" tone={headTone} label="This Month" value={formatINR(isInvest ? summary.investments.thisMonth : summary.revenue.thisMonth)} />}
        {summary && !isInvest && mode !== "today" && <Kpi icon="bolt" tone="green" label="Today" value={formatINR(summary.revenue.today)} />}
      </div>
      <Panel
        title={title}
        sub={
          mode === "today" ? "Automatically limited to entries dated today"
          : mode === "monthly" ? "Automatically rolled up by month — use the arrows to browse past months"
          : `Every entry updates the ${isInvest ? "Total Investment" : "Total Revenue"} card instantly`
        }
        icon={isInvest ? "wallet" : "chart"} iconTone={headTone}
        action={
          mode === "monthly" ? (
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <button className="chip" onClick={() => setMonthOffset((o) => o - 1)} title="Previous month">‹</button>
              <span style={{ fontSize: 12, fontWeight: 700, color: "var(--ink-700)", minWidth: 96, textAlign: "center" }}>{selLabel}</span>
              <button className="chip" onClick={() => setMonthOffset((o) => Math.min(0, o + 1))} disabled={monthOffset >= 0} title="Next month">›</button>
            </div>
          ) : mode === "all" ? (
            <InlineForm submitLabel={`Add ${noun}`} onSubmit={add}
              fields={[
                { name: "title", label: isInvest ? "Title / Purpose" : "Title", placeholder: isInvest ? "e.g. Cloud infrastructure" : "e.g. Enterprise plan sale" },
                { name: "category", label: "Category", type: "select", options: categories.map((c) => ({ value: c, label: c })) },
                { name: "amount", label: "Amount (₹)", type: "number", placeholder: "0" },
                { name: "date", label: "Date", type: "date" },
                { name: "notes", label: "Notes (optional)", type: "textarea", placeholder: "Any details…", full: true },
              ]} />
          ) : undefined
        }
      >
        {rows === null ? <p style={{ fontSize: 12.5, color: "var(--ink-500)" }}>Loading…</p>
          : shown.length === 0 ? <p style={{ fontSize: 12.5, color: "var(--ink-500)" }}>{mode === "all" ? `No ${noun}s yet. Add your first one.` : `No ${noun}s in this period yet.`}</p>
          : <div className="table-wrap"><table>
              <thead><tr><th>{isInvest ? "Purpose" : "Title"}</th><th>Category</th><th>Date</th><th>Amount</th>{mode === "all" && <th></th>}</tr></thead>
              <tbody>{shown.map((r) => (
                <tr key={r._id}>
                  <td><b>{r.title}</b>{r.notes ? <div style={{ fontSize: 11, color: "var(--ink-500)" }}>{r.notes}</div> : null}</td>
                  <td><span className="badge blue">{r.category}</span></td>
                  <td>{fmtDate(r.date)}</td>
                  <td><b>{formatINR(r.amount)}</b></td>
                  {mode === "all" && <td><DelBtn onClick={() => del(r._id)} /></td>}
                </tr>
              ))}</tbody>
            </table></div>}
      </Panel>
    </>
  );
}

/* --------------------------------------------------- Monthly Costing view */
function CostingSection({ summary, reload }: { summary: CommandFinanceSummary | null; reload: () => void }) {
  const [rows, setRows] = useState<CostingRow[] | null>(null);
  const load = useCallback(async () => {
    try { setRows((await api.get("/command-finance/recurring")).data.recurring); } catch { setRows([]); }
  }, []);
  useEffect(() => { load(); }, [load]);
  useSocketEvent("command-finance:update", load);

  const c = summary?.monthlyCosting;

  async function add(v: Record<string, string>) {
    try { await api.post("/command-finance/recurring", v); toast.success("Saved"); reload(); load(); }
    catch (err: any) { toast.error(err?.response?.data?.error || "Failed to save"); throw err; }
  }
  async function pay(id: string, paid: boolean) {
    try { await api.post(`/command-finance/recurring/${id}/pay`, { paid }); reload(); load(); }
    catch (err: any) { toast.error(err?.response?.data?.error || "Failed to update"); }
  }
  async function toggleActive(r: CostingRow) {
    try { await api.patch(`/command-finance/recurring/${r._id}`, { active: !r.active }); reload(); load(); }
    catch (err: any) { toast.error(err?.response?.data?.error || "Failed to update"); }
  }
  async function del(id: string) {
    try { await api.delete(`/command-finance/recurring/${id}`); reload(); load(); }
    catch (err: any) { toast.error(err?.response?.data?.error || "Failed to delete"); }
  }

  const dueLabel = (day: number) => new Date(new Date().getFullYear(), new Date().getMonth(), Math.min(Math.max(day, 1), 28)).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

  return (
    <>
      <div className="kpi-grid">
        <Kpi icon="refresh" tone="amber" label="Total Monthly Expenses" value={c ? formatINR(c.total) : "—"} foot={c ? `${c.activeCount} recurring` : ""} />
        <Kpi icon="check" tone="green" label="Paid This Month" value={c ? formatINR(c.paidThisMonth) : "—"} foot={c ? `${c.paidCount} paid` : ""} />
        <Kpi icon="bell" tone={c && c.pending > 0 ? "amber" : "green"} label="Pending Payments" value={c ? formatINR(c.pending) : "—"} foot={c ? `${c.pendingCount} pending` : ""} />
        <Kpi icon="target" tone="blue" label="Upcoming Due" value={c ? String(c.upcomingCount) : "—"} foot="Not yet paid this month" />
        <Kpi icon="wallet" tone="blue" label="Final Monthly Cost" value={c ? formatINR(c.finalMonthlyCost) : "—"} foot="Total recurring cost / month" />
      </div>

      <Panel
        title="Monthly Expenses"
        sub="API & software subscriptions, server/hosting, Twilio, office rent, internet & other recurring costs — mark each paid as you settle it"
        icon="refresh" iconTone="amber"
        action={
          <InlineForm submitLabel="Add expense" onSubmit={add}
            fields={[
              { name: "label", label: "Expense name", placeholder: "e.g. AWS server" },
              { name: "category", label: "Category", type: "select", options: COSTING_CATEGORIES.map((c) => ({ value: c, label: c })) },
              { name: "amount", label: "Amount (₹)", type: "number", placeholder: "0" },
              { name: "dueDay", label: "Payment due day (1-28)", type: "number", placeholder: "1" },
              { name: "notes", label: "Notes (optional)", type: "textarea", placeholder: "Any details…", full: true },
            ]} />
        }
      >
        {rows === null ? <p style={{ fontSize: 12.5, color: "var(--ink-500)" }}>Loading…</p>
          : rows.length === 0 ? <p style={{ fontSize: 12.5, color: "var(--ink-500)" }}>No monthly expenses yet. Add your subscriptions, hosting, rent &amp; other recurring costs.</p>
          : <div className="table-wrap"><table>
              <thead><tr><th>Expense</th><th>Category</th><th>Amount</th><th>Due</th><th>Status</th><th>Paid on</th><th></th></tr></thead>
              <tbody>{rows.map((r) => (
                <tr key={r._id} style={r.active ? undefined : { opacity: 0.5 }}>
                  <td><b>{r.label}</b>{r.notes ? <div style={{ fontSize: 11, color: "var(--ink-500)" }}>{r.notes}</div> : null}</td>
                  <td><span className="badge blue">{r.category}</span></td>
                  <td><b>{formatINR(r.amount)}</b></td>
                  <td>{dueLabel(r.dueDay)}</td>
                  <td>{r.paidThisMonth ? <span className="badge green">Paid</span> : <span className="badge amber">Pending</span>}</td>
                  <td>{r.paidThisMonth && r.paidDate ? fmtDate(r.paidDate) : <span style={{ color: "var(--ink-400)" }}>—</span>}</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    {r.paidThisMonth
                      ? <button className="chip" onClick={() => pay(r._id, false)}>Undo</button>
                      : <button className="btn btn-primary" onClick={() => pay(r._id, true)}>Mark paid</button>}
                    <button className="chip" style={{ marginLeft: 6 }} onClick={() => toggleActive(r)} title={r.active ? "Pause (exclude from totals)" : "Resume"}>{r.active ? "Pause" : "Resume"}</button>
                    <DelBtn onClick={() => del(r._id)} />
                  </td>
                </tr>
              ))}</tbody>
            </table></div>}
      </Panel>

      {c && c.upcoming.length > 0 && (
        <Panel title="Upcoming Due Payments" sub="Active expenses not yet paid this month" icon="bell" iconTone="amber">
          {c.upcoming.map((u) => (
            <div className="list-row" key={u.id}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink-700)" }}>{u.label}</div>
                <div style={{ fontSize: 11.5, color: "var(--ink-500)" }}>{u.category} · due {fmtDate(u.dueDate)}</div>
              </div>
              <b>{formatINR(u.amount)}</b>
              <button className="btn btn-primary" onClick={() => pay(u.id, true)} style={{ marginLeft: 10 }}>Pay</button>
            </div>
          ))}
        </Panel>
      )}
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

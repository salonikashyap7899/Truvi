import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { formatCompactINR, formatINR } from "@/lib/utils";
import { useSocketEvent } from "@/lib/socket";
import { toast } from "sonner";
import { Kpi, Panel } from "@/pages/dashboard/DashboardOS";

/* ------------------------------------------------------------------ types */
type PayStatus = "PAID" | "PARTIAL" | "PENDING";

export interface EmployerSummary {
  monthKey: string; monthLabel: string;
  totalEmployers: number; totalMonthlySalary: number; totalPaid: number; totalPending: number;
  upcomingCount: number;
  upcoming: { id: string; name: string; amount: number; remaining: number; dueDate: string; status: PayStatus }[];
}
interface Employer {
  id: string; name: string; designation: string | null; department: string; status: string;
  monthlySalary: number; salaryStartDate: string | null; salaryDueDay: number; dueDate: string; notes: string | null;
  paidThisMonth: number; remaining: number; paymentStatus: PayStatus;
}
interface Payment { id: string; monthKey: string; amount: number; note: string | null; paidAt: string }

/* ------------------------------------------------------------------- hook */
export function useEmployerSummary() {
  const [summary, setSummary] = useState<EmployerSummary | null>(null);
  const load = useCallback(async () => {
    try { setSummary((await api.get("/employers/summary")).data); } catch { /* keep last-known */ }
  }, []);
  useEffect(() => { load(); }, [load]);
  useSocketEvent("command-finance:update", load);
  return { summary, reload: load };
}

/* ------------------------------------------------------------- small bits */
const fmtDate = (iso: string | null) => iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—";
const STATUS_BADGE: Record<PayStatus, string> = { PAID: "green", PARTIAL: "blue", PENDING: "amber" };
const STATUS_LABEL: Record<PayStatus, string> = { PAID: "Paid", PARTIAL: "Partially Paid", PENDING: "Pending" };
const StatusBadge = ({ s }: { s: PayStatus }) => <span className={`badge ${STATUS_BADGE[s]}`}>{STATUS_LABEL[s]}</span>;

function DelBtn({ onClick }: { onClick: () => void }) {
  return (
    <button className="icon-del" title="Delete" onClick={onClick}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6M10 11v6M14 11v6" /></svg>
    </button>
  );
}

type Field = { name: string; label: string; type?: "text" | "number" | "date" | "textarea"; placeholder?: string; full?: boolean; value?: string };

/** A small controlled field grid used by both the add and edit forms. */
function Fields({ fields, vals, set }: { fields: Field[]; vals: Record<string, string>; set: (n: string, v: string) => void }) {
  return (
    <>
      {fields.map((f) => (
        <div key={f.name} className={`fm-field${f.full ? " full" : ""}`}>
          <label>{f.label}</label>
          {f.type === "textarea"
            ? <textarea rows={2} value={vals[f.name] ?? ""} placeholder={f.placeholder} onChange={(e) => set(f.name, e.target.value)} />
            : <input type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"} step="any" value={vals[f.name] ?? ""} placeholder={f.placeholder} onChange={(e) => set(f.name, e.target.value)} />}
        </div>
      ))}
    </>
  );
}

function useForm(fields: Field[], deps: unknown[] = []) {
  const initial = useMemo(() => Object.fromEntries(fields.map((f) => [f.name, f.value ?? ""])), deps); // eslint-disable-line react-hooks/exhaustive-deps
  const [vals, setVals] = useState<Record<string, string>>(initial);
  useEffect(() => { setVals(initial); }, [initial]);
  const set = (n: string, v: string) => setVals((s) => ({ ...s, [n]: v }));
  const payload = () => { const p: Record<string, string> = {}; for (const [k, v] of Object.entries(vals)) if (v !== "") p[k] = v; return p; };
  return { vals, set, payload, reset: () => setVals(initial) };
}

const EMPLOYER_FIELDS = (e?: Employer): Field[] => [
  { name: "name", label: "Employer name", placeholder: "Full name", value: e?.name },
  { name: "designation", label: "Designation (optional)", placeholder: "e.g. Engineer", value: e?.designation ?? "" },
  { name: "monthlySalary", label: "Monthly salary (₹)", type: "number", placeholder: "0", value: e ? String(e.monthlySalary) : "" },
  { name: "salaryStartDate", label: "Salary start date", type: "date", value: e?.salaryStartDate ? e.salaryStartDate.slice(0, 10) : "" },
  { name: "salaryDueDay", label: "Salary due day (1-28)", type: "number", placeholder: "1", value: e ? String(e.salaryDueDay) : "" },
  { name: "notes", label: "Notes (optional)", type: "textarea", placeholder: "Any details…", full: true, value: e?.notes ?? "" },
];

/* ============================================================ overview card */
/** The tappable "Total Employer" card for the Command Center. */
export function TotalEmployerCard({ onOpen }: { onOpen: () => void }) {
  const { summary: s } = useEmployerSummary();
  return (
    <div className="kpi-grid">
      <Kpi icon="team" tone="blue" label="Total Employer" value={s ? String(s.totalEmployers) : "—"}
        foot={s ? `${formatCompactINR(s.totalMonthlySalary)}/mo · ${formatCompactINR(s.totalPending)} pending` : "Loading…"} onClick={onOpen} />
    </div>
  );
}

/* ========================================================= management page */
export function EmployerManagementPage() {
  const { summary, reload: reloadSummary } = useEmployerSummary();
  const [rows, setRows] = useState<Employer[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    try { setRows((await api.get("/employers")).data.employers); } catch { setRows([]); }
  }, []);
  useEffect(() => { load(); }, [load]);
  useSocketEvent("command-finance:update", load);

  const reloadAll = () => { reloadSummary(); load(); };
  const addForm = useForm(EMPLOYER_FIELDS(), []);
  const [busy, setBusy] = useState(false);

  async function addEmployer(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post("/employers", addForm.payload());
      toast.success("Employer added"); addForm.reset(); setAdding(false); reloadAll();
    } catch (err: any) { toast.error(err?.response?.data?.error || "Failed to add"); }
    finally { setBusy(false); }
  }
  async function del(id: string) {
    try { await api.delete(`/employers/${id}`); if (selectedId === id) setSelectedId(null); reloadAll(); }
    catch (err: any) { toast.error(err?.response?.data?.error || "Failed to delete"); }
  }

  const s = summary;

  return (
    <section className="page">
      <div className="page-header">
        <div><div className="page-title">Employer Management</div><div className="page-sub">Team salaries, payments &amp; dues · Live{s ? ` · ${s.monthLabel}` : ""}</div></div>
        <div className="header-actions"><button className="btn btn-primary" onClick={() => setAdding((v) => !v)}><span style={{ fontWeight: 800 }}>+</span> Add Employer</button></div>
      </div>

      <div className="kpi-grid">
        <Kpi icon="team" tone="blue" label="Total Employers" value={s ? String(s.totalEmployers) : "—"} />
        <Kpi icon="wallet" tone="blue" label="Total Monthly Salary" value={s ? formatINR(s.totalMonthlySalary) : "—"} />
        <Kpi icon="check" tone="green" label="Total Paid" value={s ? formatINR(s.totalPaid) : "—"} />
        <Kpi icon="bell" tone={s && s.totalPending > 0 ? "amber" : "green"} label="Total Pending" value={s ? formatINR(s.totalPending) : "—"} />
        <Kpi icon="target" tone="blue" label="Upcoming Due" value={s ? String(s.upcomingCount) : "—"} foot="Salaries owed this month" />
      </div>

      {adding && (
        <Panel title="Add Employer" sub="Add a new team member and their salary" icon="team" iconTone="blue">
          <form className="fm-form" onSubmit={addEmployer}>
            <Fields fields={EMPLOYER_FIELDS()} vals={addForm.vals} set={addForm.set} />
            <div className="fm-actions">
              <button type="button" className="chip" onClick={() => { setAdding(false); addForm.reset(); }}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? "Saving…" : "Add employer"}</button>
            </div>
          </form>
        </Panel>
      )}

      <Panel title="Employers" sub="Tap an employer to view payment history &amp; record payments" icon="team" iconTone="blue">
        {rows === null ? <p style={{ fontSize: 12.5, color: "var(--ink-500)" }}>Loading…</p>
          : rows.length === 0 ? <p style={{ fontSize: 12.5, color: "var(--ink-500)" }}>No employers yet. Use “Add Employer” to add your first team member.</p>
          : <div className="table-wrap"><table>
              <thead><tr><th>Employer</th><th>Monthly</th><th>Paid</th><th>Remaining</th><th>Due</th><th>Status</th><th></th></tr></thead>
              <tbody>{rows.map((e) => (
                <tr key={e.id} className="kpi-clickable" onClick={() => setSelectedId((id) => id === e.id ? null : e.id)} style={selectedId === e.id ? { background: "var(--brand-100, rgba(124,92,255,.08))" } : undefined}>
                  <td><b>{e.name}</b><div style={{ fontSize: 11, color: "var(--ink-500)" }}>{e.designation || e.department}</div></td>
                  <td><b>{formatINR(e.monthlySalary)}</b></td>
                  <td>{formatINR(e.paidThisMonth)}</td>
                  <td>{e.remaining > 0 ? <b style={{ color: "var(--amber-500)" }}>{formatINR(e.remaining)}</b> : formatINR(0)}</td>
                  <td>{fmtDate(e.dueDate)}</td>
                  <td><StatusBadge s={e.paymentStatus} /></td>
                  <td onClick={(ev) => ev.stopPropagation()}><DelBtn onClick={() => del(e.id)} /></td>
                </tr>
              ))}</tbody>
            </table></div>}
      </Panel>

      {selectedId && <EmployerDetail key={selectedId} id={selectedId} onChanged={reloadAll} onClose={() => setSelectedId(null)} />}

      <Panel title="Upcoming Salary Due Dates" sub="Employers with salary still owed this month" icon="bell" iconTone="amber">
        {!s || s.upcoming.length === 0
          ? <p style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--ink-500)" }}><span className="status-dot green" /> All salaries for this month are cleared.</p>
          : s.upcoming.map((u) => (
            <div className="list-row" key={u.id}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink-700)" }}>{u.name}</div>
                <div style={{ fontSize: 11.5, color: "var(--ink-500)" }}>Due {fmtDate(u.dueDate)} · {formatINR(u.remaining)} remaining</div>
              </div>
              <StatusBadge s={u.status} />
              <button className="chip" style={{ marginLeft: 10 }} onClick={() => setSelectedId(u.id)}>Open</button>
            </div>
          ))}
      </Panel>
    </section>
  );
}

/* -------------------------------------------------- per-employer detail */
function EmployerDetail({ id, onChanged, onClose }: { id: string; onChanged: () => void; onClose: () => void }) {
  const [emp, setEmp] = useState<Employer | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { const r = (await api.get(`/employers/${id}`)).data; setEmp(r.employer); setPayments(r.payments); }
    catch { /* row may have been deleted */ }
  }, [id]);
  useEffect(() => { load(); }, [load]);
  useSocketEvent("command-finance:update", load);

  const editForm = useForm(EMPLOYER_FIELDS(emp ?? undefined), [emp?.id, editing]);
  const payForm = useForm([
    { name: "amount", label: "Amount (₹)", type: "number", placeholder: "0", value: emp && emp.remaining > 0 ? String(emp.remaining) : "" },
    { name: "note", label: "Note (optional)", placeholder: "e.g. UPI ref" },
  ], [emp?.id, emp?.remaining]);

  if (!emp) return null;

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true);
    try { await api.patch(`/employers/${id}`, editForm.payload()); toast.success("Updated"); setEditing(false); load(); onChanged(); }
    catch (err: any) { toast.error(err?.response?.data?.error || "Failed to update"); }
    finally { setBusy(false); }
  }
  async function recordPayment(e: React.FormEvent) {
    e.preventDefault(); setBusy(true);
    try { await api.post(`/employers/${id}/payments`, payForm.payload()); toast.success("Payment recorded"); payForm.reset(); load(); onChanged(); }
    catch (err: any) { toast.error(err?.response?.data?.error || "Failed to record payment"); }
    finally { setBusy(false); }
  }
  async function payFull() {
    if (emp!.remaining <= 0) return;
    setBusy(true);
    try { await api.post(`/employers/${id}/payments`, { amount: emp!.remaining, note: "Full salary" }); toast.success("Salary marked paid"); load(); onChanged(); }
    catch (err: any) { toast.error(err?.response?.data?.error || "Failed to record payment"); }
    finally { setBusy(false); }
  }
  async function delPayment(pid: string) {
    try { await api.delete(`/employers/${id}/payments/${pid}`); load(); onChanged(); }
    catch (err: any) { toast.error(err?.response?.data?.error || "Failed to delete payment"); }
  }

  const detail = (label: string, value: React.ReactNode) => (
    <div><div className="kpi-label">{label}</div><div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--ink-700)" }}>{value}</div></div>
  );

  return (
    <Panel
      title={emp.name}
      sub={`${emp.designation || emp.department} · ${STATUS_LABEL[emp.paymentStatus]}`}
      icon="team" iconTone="blue"
      action={
        <div style={{ display: "flex", gap: 6 }}>
          <button className="chip" onClick={() => setEditing((v) => !v)}>{editing ? "Close edit" : "Edit"}</button>
          <button className="chip" onClick={onClose}>Close</button>
        </div>
      }
    >
      <div className="kpi-grid" style={{ marginBottom: 14 }}>
        {detail("Monthly Salary", formatINR(emp.monthlySalary))}
        {detail("Amount Paid (this month)", formatINR(emp.paidThisMonth))}
        {detail("Remaining Balance", emp.remaining > 0 ? <span style={{ color: "var(--amber-500)" }}>{formatINR(emp.remaining)}</span> : formatINR(0))}
        {detail("Salary Start", fmtDate(emp.salaryStartDate))}
        {detail("Due Date", fmtDate(emp.dueDate))}
        {detail("Status", <StatusBadge s={emp.paymentStatus} />)}
      </div>
      {emp.notes && <p style={{ fontSize: 12, color: "var(--ink-500)", marginBottom: 12 }}>{emp.notes}</p>}

      {editing && (
        <form className="fm-form" onSubmit={saveEdit} style={{ marginBottom: 14 }}>
          <Fields fields={EMPLOYER_FIELDS(emp)} vals={editForm.vals} set={editForm.set} />
          <div className="fm-actions">
            <button type="button" className="chip" onClick={() => setEditing(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? "Saving…" : "Save changes"}</button>
          </div>
        </form>
      )}

      <div className="grid-2">
        <div>
          <div className="kpi-label" style={{ marginBottom: 8 }}>Record a payment</div>
          <form className="fm-form" onSubmit={recordPayment}>
            <Fields fields={[
              { name: "amount", label: "Amount (₹)", type: "number", placeholder: "0" },
              { name: "note", label: "Note (optional)", placeholder: "e.g. UPI ref" },
            ]} vals={payForm.vals} set={payForm.set} />
            <div className="fm-actions">
              {emp.remaining > 0 && <button type="button" className="chip" onClick={payFull} disabled={busy}>Pay full ({formatINR(emp.remaining)})</button>}
              <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? "Saving…" : "Add payment"}</button>
            </div>
          </form>
        </div>
        <div>
          <div className="kpi-label" style={{ marginBottom: 8 }}>Payment history</div>
          {payments.length === 0 ? <p style={{ fontSize: 12.5, color: "var(--ink-500)" }}>No payments recorded yet.</p>
            : <div className="table-wrap"><table>
                <thead><tr><th>Date</th><th>Month</th><th>Amount</th><th>Note</th><th></th></tr></thead>
                <tbody>{payments.map((p) => (
                  <tr key={p.id}>
                    <td>{fmtDate(p.paidAt)}</td>
                    <td>{p.monthKey}</td>
                    <td><b>{formatINR(p.amount)}</b></td>
                    <td>{p.note || <span style={{ color: "var(--ink-400)" }}>—</span>}</td>
                    <td><DelBtn onClick={() => delPayment(p.id)} /></td>
                  </tr>
                ))}</tbody>
              </table></div>}
        </div>
      </div>
    </Panel>
  );
}

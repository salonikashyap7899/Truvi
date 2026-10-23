import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { toast } from "sonner";

type Tab = "overview" | "employees" | "tasks" | "leads" | "visits" | "attendance" | "salary";
type Employee = {
  id: string; accountUserId?: string | null; employeeCode?: string | null; name: string;
  officialEmail: string; phone: string; department: string; designation: string;
  employmentType: string; reportingManagerId?: string | null; recruitmentSource: string;
  recruitmentCampaign?: string; applicationDate?: string | null; interviewDate?: string | null;
  joiningDate?: string | null; status: "ACTIVE" | "ON_LEAVE" | "INACTIVE"; monthlySalary: number;
  salaryDueDay: number; notes?: string; permissions?: string[]; accountStatus?: string;
};
type Task = { _id: string; employeeId: string; title: string; description?: string | null; taskType: string; priority: string; status: string; deadlineAt?: string | null; createdAt: string };
type Lead = { _id: string; leadNo?: number; clientName: string; clientPhone: string; clientEmail?: string | null; projectId: string; submittedById: string; assignedToId?: string | null; stage: string; source: string; leadTemperature?: string | null; siteVisitStatus?: string | null; nextFollowUpAt?: string | null; createdAt: string };
type Visit = { _id: string; leadId?: string | null; projectId: string; projectName?: string; clientName?: string; clientPhone?: string; responsibleUserId?: string | null; scheduledAt: string; status: string; reportNotes?: string | null };
type Attendance = { _id: string; employeeId: string; attendanceDate: string; status: string; checkInAt?: string | null; checkOutAt?: string | null; workingMinutes?: number | null; correctionReason?: string | null };
type Salary = { _id: string; employeeId: string; employeeName?: string; employeeCode?: string; monthKey: string; grossSalary: number; allowances: number; deductions: number; netPayable: number; status: string; paymentDate?: string | null; paymentReference?: string | null };
type Summary = {
  totalEmployees: number; activeEmployees: number; inactiveEmployees: number; employeesOnLeave: number;
  employeeAccounts: number; activeAccounts: number; pendingInvitations: number; tasksAssignedToday: number;
  tasksCompletedToday: number; pendingTasks: number; overdueTasks: number; totalLeadsSubmitted: number;
  assignedLeads: number; hotLeads: number; warmLeads: number; coldLeads: number; upcomingSiteVisits: number;
  callsLoggedToday: number; attendanceSummary: { present: number; absent: number; halfDay: number; onLeave: number; notMarked: number };
  byDepartment: { department: string; count: number }[]; byRecruitmentSource: { source: string; count: number }[];
};

const tabs: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" }, { id: "employees", label: "All employees" },
  { id: "tasks", label: "Tasks" }, { id: "leads", label: "Lead management" },
  { id: "visits", label: "Site visits" }, { id: "attendance", label: "Attendance" }, { id: "salary", label: "Salary & payroll" },
];
const money = (n?: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n ?? 0);
const date = (raw?: string | null) => raw ? new Date(raw).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";
const dt = (raw?: string | null) => raw ? new Date(raw).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";
const pill = (status: string) => status === "ACTIVE" || status === "PAID" || status === "APPROVED" || status === "COMPLETED" || status === "PRESENT" ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/20" : status === "INACTIVE" || status === "CANCELLED" || status === "ABSENT" || status === "ON_HOLD" ? "bg-red-500/10 text-red-300 border-red-500/20" : "bg-amber-500/10 text-amber-200 border-amber-500/20";

function Status({ value }: { value: string }) {
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${pill(value)}`}>{value.replaceAll("_", " ")}</span>;
}
function Kpi({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>{sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}</div>;
}
function Panel({ title, sub, children, action }: { title: string; sub?: string; children: ReactNode; action?: ReactNode }) {
  return <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-4 sm:p-5"><div className="mb-4 flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold">{title}</h2>{sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}</div>{action}</div>{children}</section>;
}
function Field({ label, value, onChange, type = "text", required = false, placeholder = "", disabled = false }: { label: string; value: string; onChange: (v: string) => void; type?: string; required?: boolean; placeholder?: string; disabled?: boolean }) {
  return <label className="block space-y-1.5 text-sm"><span className="text-muted-foreground">{label}</span><input disabled={disabled} className="w-full rounded-xl border border-white/10 bg-background px-3 py-2.5 outline-none focus:border-primary disabled:opacity-60" type={type} required={required} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} /></label>;
}
function SelectField({ label, value, onChange, options, required = false }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; required?: boolean }) {
  return <label className="block space-y-1.5 text-sm"><span className="text-muted-foreground">{label}</span><select required={required} value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-xl border border-white/10 bg-background px-3 py-2.5 outline-none focus:border-primary">{options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>;
}

const emptyEmployee = {
  name: "", employeeCode: "", officialEmail: "", phone: "", department: "Sales", designation: "Sales Executive",
  employmentType: "FULL_TIME", reportingManagerId: "", joiningDate: new Date().toISOString().slice(0, 10),
  recruitmentSource: "Company Website", recruitmentCampaign: "", applicationDate: "", interviewDate: "",
  status: "ACTIVE", monthlySalary: "0", salaryDueDay: "1", notes: "",
};

export default function AdminEmployeeManagementPage() {
  const [tab, setTab] = useState<Tab>("overview");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [salaries, setSalaries] = useState<Salary[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [employeeForm, setEmployeeForm] = useState<Record<string, string>>({ ...emptyEmployee });
  const [busy, setBusy] = useState(false);
  const [taskForm, setTaskForm] = useState({ employeeId: "", title: "", description: "", priority: "MEDIUM", deadlineAt: "", category: "GENERAL" });
  const [salaryForm, setSalaryForm] = useState({ employeeId: "", monthKey: new Date().toISOString().slice(0, 7), grossSalary: "", allowances: "0", deductions: "0", notes: "" });
  const [correction, setCorrection] = useState({ id: "", status: "PRESENT", correctionReason: "" });

  async function reload() {
    setLoading(true);
    try {
      const [ov, em, ta, le, vi, at, sa] = await Promise.all([
        api.get("/employees/overview"), api.get("/employees"), api.get("/employees/tasks"),
        api.get("/employees/leads"), api.get("/employees/site-visits"), api.get("/employees/attendance"), api.get("/employees/salaries"),
      ]);
      setSummary(ov.data); setEmployees(em.data.employees ?? []); setTasks(ta.data.tasks ?? []);
      setLeads(le.data.leads ?? []); setVisits(vi.data.siteVisits ?? []); setAttendance(at.data.attendance ?? []); setSalaries(sa.data.salaries ?? []);
    } catch (error: any) {
      toast.error(error?.response?.data?.error || "Unable to load Employee Management.");
    } finally { setLoading(false); }
  }
  useEffect(() => { void reload(); }, []);

  const shownEmployees = useMemo(() => employees.filter((e) => {
    const q = query.toLowerCase().trim();
    const match = !q || [e.name, e.officialEmail, e.employeeCode, e.department, e.designation, e.phone].some((v) => String(v ?? "").toLowerCase().includes(q));
    return match && (statusFilter === "ALL" || e.status === statusFilter);
  }), [employees, query, statusFilter]);

  function startEdit(e: Employee) {
    setEditing(e); setShowForm(true);
    setEmployeeForm({
      name: e.name, employeeCode: e.employeeCode ?? "", officialEmail: e.officialEmail, phone: e.phone ?? "",
      department: e.department, designation: e.designation ?? "", employmentType: e.employmentType || "FULL_TIME",
      reportingManagerId: e.reportingManagerId ?? "", joiningDate: e.joiningDate?.slice(0, 10) ?? "",
      recruitmentSource: e.recruitmentSource || "Other", recruitmentCampaign: e.recruitmentCampaign ?? "", permissions: (e.permissions ?? []).join(", "),
      applicationDate: e.applicationDate?.slice(0, 10) ?? "", interviewDate: e.interviewDate?.slice(0, 10) ?? "",
      status: e.status, monthlySalary: String(e.monthlySalary ?? 0), salaryDueDay: String(e.salaryDueDay ?? 1), notes: e.notes ?? "",
    });
  }
  async function saveEmployee(e: FormEvent) {
    e.preventDefault(); setBusy(true);
    const payload = {
      ...employeeForm, monthlySalary: Number(employeeForm.monthlySalary), salaryDueDay: Number(employeeForm.salaryDueDay),
      permissions: employeeForm.permissions.trim() ? employeeForm.permissions.split(",").map((p) => p.trim()).filter(Boolean) : undefined,
      reportingManagerId: employeeForm.reportingManagerId || null,
      joiningDate: employeeForm.joiningDate || null, applicationDate: employeeForm.applicationDate || null,
      interviewDate: employeeForm.interviewDate || null,
    };
    try {
      if (editing) {
        const editable: Record<string, unknown> = { ...payload };
        delete editable.officialEmail;
        await api.patch(`/employees/${editing.id}`, editable);
        toast.success("Employee profile updated.");
      } else {
        const response = await api.post("/employees", payload);
        toast[response.data?.inviteDelivered ? "success" : "warning"](response.data?.inviteMessage || "Employee profile created.");
      }
      setShowForm(false); setEditing(null); setEmployeeForm({ ...emptyEmployee }); await reload();
    } catch (error: any) {
      toast.error(error?.response?.data?.error || "Could not save employee.");
    } finally { setBusy(false); }
  }
  async function createAccount(emp: Employee) {
    const officialEmail = window.prompt("Official email for " + emp.name + ":", emp.officialEmail || "");
    if (!officialEmail?.trim()) return;
    const phone = window.prompt("Employee phone number (optional):", emp.phone || "") ?? "";
    try {
      const r = await api.post("/employees/" + emp.id + "/account", { officialEmail: officialEmail.trim(), phone: phone.trim(), employeeCode: emp.employeeCode || undefined });
      toast[r.data?.inviteDelivered ? "success" : "warning"](r.data?.inviteMessage || "Employee login created.");
      await reload();
    } catch (error: any) { toast.error(error?.response?.data?.error || "Could not create employee login."); }
  }
  async function resendInvite(emp: Employee) {
    try { const r = await api.post(`/employees/${emp.id}/invite`); toast[r.data?.delivered ? "success" : "warning"](r.data?.message || "Invitation request completed."); await reload(); }
    catch (error: any) { toast.error(error?.response?.data?.error || "Could not resend invitation."); }
  }
  async function assignTask(e: FormEvent) {
    e.preventDefault(); setBusy(true);
    try {
      await api.post("/employees/tasks", { ...taskForm, estimatedMinutes: undefined, deadlineAt: taskForm.deadlineAt ? new Date(taskForm.deadlineAt).toISOString() : null });
      toast.success("Task assigned."); setTaskForm({ employeeId: "", title: "", description: "", priority: "MEDIUM", deadlineAt: "", category: "GENERAL" }); await reload();
    } catch (error: any) { toast.error(error?.response?.data?.error || "Could not assign task."); }
    finally { setBusy(false); }
  }
  async function updateTask(task: Task, status: string) {
    try { await api.patch(`/employees/tasks/${task._id}`, { status }); toast.success("Task updated."); await reload(); }
    catch (error: any) { toast.error(error?.response?.data?.error || "Could not update task."); }
  }
  async function createSalary(e: FormEvent) {
    e.preventDefault(); setBusy(true);
    try {
      await api.post("/employees/salaries", {
        employeeId: salaryForm.employeeId, monthKey: salaryForm.monthKey,
        grossSalary: Number(salaryForm.grossSalary), allowances: Number(salaryForm.allowances), deductions: Number(salaryForm.deductions), notes: salaryForm.notes,
      });
      toast.success("Payroll record saved as draft."); setSalaryForm((s) => ({ ...s, grossSalary: "", allowances: "0", deductions: "0", notes: "" })); await reload();
    } catch (error: any) { toast.error(error?.response?.data?.error || "Could not create payroll record."); }
    finally { setBusy(false); }
  }
  async function advanceSalary(s: Salary, status: string) {
    try {
      const payload: Record<string, string> = { status };
      if (status === "PAID") { payload.paymentDate = new Date().toISOString(); const reference = window.prompt("Enter the real payment reference before marking this record paid:"); if (!reference?.trim()) return; payload.paymentReference = reference.trim(); }
      await api.patch(`/employees/salaries/${s._id}`, payload); toast.success(`Payroll status changed to ${status.replaceAll("_", " ")}.`); await reload();
    } catch (error: any) { toast.error(error?.response?.data?.error || "Could not update payroll status."); }
  }
  async function correctAttendance(e: FormEvent) {
    e.preventDefault();
    try { await api.patch(`/employees/attendance/${correction.id}`, { status: correction.status, correctionReason: correction.correctionReason }); toast.success("Attendance corrected and audited."); setCorrection({ id: "", status: "PRESENT", correctionReason: "" }); await reload(); }
    catch (error: any) { toast.error(error?.response?.data?.error || "Could not correct attendance."); }
  }
  async function updateVisit(v: Visit, status: string) {
    try { await api.patch(`/employees/site-visits/${v._id}`, { status }); toast.success("Site visit updated."); await reload(); }
    catch (error: any) { toast.error(error?.response?.data?.error || "Could not update site visit."); }
  }

  return (
    <div className="mx-auto max-w-[1600px] space-y-6 p-4 text-foreground sm:p-6 lg:p-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Truvi Operations</p><h1 className="mt-2 text-2xl font-semibold sm:text-3xl">Employee Management</h1><p className="mt-2 max-w-2xl text-sm text-muted-foreground">Employee accounts, work allocation, central buyer leads, attendance and controlled payroll records.</p></div>
        <div className="flex flex-wrap gap-2"><Link to="/admin/audit-logs" className="rounded-xl border border-white/10 px-4 py-2.5 text-sm">Activity &amp; audit logs</Link><button onClick={() => { setEditing(null); setEmployeeForm({ ...emptyEmployee }); setShowForm((v) => !v); }} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground">{showForm ? "Close form" : "+ Add employee"}</button></div>
      </header>

      <div className="flex gap-2 overflow-x-auto border-b border-white/10 pb-2">
        {tabs.map((t) => <button key={t.id} onClick={() => setTab(t.id)} className={`shrink-0 rounded-xl px-3 py-2 text-sm ${tab === t.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-white/5 hover:text-foreground"}`}>{t.label}</button>)}
      </div>

      {loading && <div className="rounded-xl border border-white/10 p-4 text-sm text-muted-foreground">Loading live company records…</div>}

      {tab === "overview" && summary && <>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
          <Kpi label="Total employee profiles" value={summary.totalEmployees} sub="Includes legacy HR records" />
          <Kpi label="Active employees" value={summary.activeEmployees} />
          <Kpi label="Active linked accounts" value={summary.activeAccounts} />
          <Kpi label="Pending invitations" value={summary.pendingInvitations} />
          <Kpi label="Employees on leave" value={summary.employeesOnLeave} />
          <Kpi label="Tasks assigned today" value={summary.tasksAssignedToday} />
          <Kpi label="Tasks completed today" value={summary.tasksCompletedToday} />
          <Kpi label="Pending / overdue" value={`${summary.pendingTasks} / ${summary.overdueTasks}`} />
          <Kpi label="Leads submitted" value={summary.totalLeadsSubmitted} sub={`${summary.assignedLeads} assigned`} />
          <Kpi label="Calls logged today" value={summary.callsLoggedToday} />
          <Kpi label="Upcoming site visits" value={summary.upcomingSiteVisits} />
          <Kpi label="Attendance marked" value={summary.attendanceSummary.present + summary.attendanceSummary.absent + summary.attendanceSummary.halfDay + summary.attendanceSummary.onLeave} sub={`${summary.attendanceSummary.notMarked} active staff not yet marked`} />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Lead temperature" sub="Employee submitted or assigned leads, deduplicated by lead record">
            <div className="grid grid-cols-3 gap-3"><Kpi label="Hot" value={summary.hotLeads}/><Kpi label="Warm" value={summary.warmLeads}/><Kpi label="Cold" value={summary.coldLeads}/></div>
          </Panel>
          <Panel title="Attendance today" sub="Missing check-ins are not automatically treated as absence">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><Kpi label="Present" value={summary.attendanceSummary.present}/><Kpi label="Absent" value={summary.attendanceSummary.absent}/><Kpi label="Half day" value={summary.attendanceSummary.halfDay}/><Kpi label="On leave" value={summary.attendanceSummary.onLeave}/></div>
          </Panel>
          <Panel title="Employees by department"><div className="space-y-3">{summary.byDepartment.length ? summary.byDepartment.map((r) => <div key={r.department} className="flex items-center justify-between gap-4 text-sm"><span>{r.department}</span><span className="font-semibold">{r.count}</span></div>) : <p className="text-sm text-muted-foreground">No employee records yet.</p>}</div></Panel>
          <Panel title="Recruitment source" sub="Employee recruitment source is separate from buyer lead source"><div className="space-y-3">{summary.byRecruitmentSource.length ? summary.byRecruitmentSource.map((r) => <div key={r.source} className="flex items-center justify-between gap-4 text-sm"><span>{r.source}</span><span className="font-semibold">{r.count}</span></div>) : <p className="text-sm text-muted-foreground">No recruitment-source data yet.</p>}</div></Panel>
        </div>
      </>}

      {showForm && <Panel title={editing ? `Edit ${editing.name}` : "Create employee profile and account"} sub="A secure activation link is emailed after creation. Passwords are never shown or stored in plaintext." action={editing && <Status value={editing.status}/>}>
        <form onSubmit={saveEmployee} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <Field label="Full name" value={employeeForm.name} onChange={(v) => setEmployeeForm((s) => ({ ...s, name: v }))} required/>
          <Field label="Employee ID (auto-generated if empty)" value={employeeForm.employeeCode} onChange={(v) => setEmployeeForm((s) => ({ ...s, employeeCode: v }))}/>
          <Field label="Official email" type="email" value={employeeForm.officialEmail} onChange={(v) => setEmployeeForm((s) => ({ ...s, officialEmail: v }))} required disabled={!!editing}/>
          <Field label="Phone number" value={employeeForm.phone} onChange={(v) => setEmployeeForm((s) => ({ ...s, phone: v }))} required={!editing}/>
          <Field label="Department" value={employeeForm.department} onChange={(v) => setEmployeeForm((s) => ({ ...s, department: v }))} required/>
          <Field label="Designation" value={employeeForm.designation} onChange={(v) => setEmployeeForm((s) => ({ ...s, designation: v }))}/>
          <SelectField label="Employment type" value={employeeForm.employmentType} onChange={(v) => setEmployeeForm((s) => ({ ...s, employmentType: v }))} options={[{value:"FULL_TIME",label:"Full time"},{value:"PART_TIME",label:"Part time"},{value:"CONTRACT",label:"Contract"},{value:"INTERN",label:"Intern"}]}/>
          <Field label="Reporting manager user ID (optional)" value={employeeForm.reportingManagerId} onChange={(v) => setEmployeeForm((s) => ({ ...s, reportingManagerId: v }))}/>
          <Field label="Joining date" type="date" value={employeeForm.joiningDate} onChange={(v) => setEmployeeForm((s) => ({ ...s, joiningDate: v }))}/>
          <SelectField label="Recruitment source" value={employeeForm.recruitmentSource} onChange={(v) => setEmployeeForm((s) => ({ ...s, recruitmentSource: v }))} options={["LinkedIn","Naukri","Indeed","Employee Referral","Consultant or Recruitment Agency","Walk-in","Company Website","Social Media","Campus Placement","Other"].map((s) => ({value:s,label:s}))}/>
          <Field label="Recruitment campaign" value={employeeForm.recruitmentCampaign} onChange={(v) => setEmployeeForm((s) => ({ ...s, recruitmentCampaign: v }))}/>
          <Field label="Application date" type="date" value={employeeForm.applicationDate} onChange={(v) => setEmployeeForm((s) => ({ ...s, applicationDate: v }))}/>
          <Field label="Interview date" type="date" value={employeeForm.interviewDate} onChange={(v) => setEmployeeForm((s) => ({ ...s, interviewDate: v }))}/>
          <SelectField label="Employment status" value={employeeForm.status} onChange={(v) => setEmployeeForm((s) => ({ ...s, status: v }))} options={editing ? [{value:"ACTIVE",label:"Active"},{value:"ON_LEAVE",label:"On leave"},{value:"INACTIVE",label:"Inactive"}] : [{value:"ACTIVE",label:"Active"},{value:"ON_LEAVE",label:"On leave"}]}/>
          <Field label="Monthly gross salary (₹)" type="number" value={employeeForm.monthlySalary} onChange={(v) => setEmployeeForm((s) => ({ ...s, monthlySalary: v }))}/>
          <Field label="Salary due day (1–28)" type="number" value={employeeForm.salaryDueDay} onChange={(v) => setEmployeeForm((s) => ({ ...s, salaryDueDay: v }))}/>
          <label className="block space-y-1.5 text-sm sm:col-span-2 xl:col-span-3"><span className="text-muted-foreground">Admin notes</span><textarea className="w-full rounded-xl border border-white/10 bg-background px-3 py-2.5" rows={2} value={employeeForm.notes} onChange={(e) => setEmployeeForm((s) => ({ ...s, notes: e.target.value }))}/></label>
          <div className="sm:col-span-2 xl:col-span-3"><Field label="Assigned permissions (comma-separated permission keys; blank uses defaults on creation)" value={employeeForm.permissions} onChange={(v) => setEmployeeForm((s) => ({ ...s, permissions: v }))} placeholder="task.read.own, lead.create, salary.read.own"/></div>
          <div className="flex flex-wrap gap-2 sm:col-span-2 xl:col-span-3"><button disabled={busy} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">{busy ? "Saving…" : editing ? "Save changes" : "Create employee & send invitation"}</button><button type="button" className="rounded-xl border border-white/10 px-4 py-2.5 text-sm" onClick={() => { setShowForm(false); setEditing(null); }}>Cancel</button></div>
        </form>
      </Panel>}

      {tab === "employees" && <Panel title="Employee directory" sub="Search by name, email, employee ID, department or phone" action={<span className="text-xs text-muted-foreground">{shownEmployees.length} records</span>}>
        <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_200px]"><input aria-label="Search employees" className="rounded-xl border border-white/10 bg-background px-3 py-2.5 text-sm" placeholder="Search employees…" value={query} onChange={(e) => setQuery(e.target.value)}/><select className="rounded-xl border border-white/10 bg-background px-3 py-2.5 text-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}><option value="ALL">All statuses</option><option value="ACTIVE">Active</option><option value="ON_LEAVE">On leave</option><option value="INACTIVE">Inactive</option></select></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[880px] text-left text-sm"><thead className="text-xs text-muted-foreground"><tr><th className="p-3">Employee</th><th className="p-3">Department</th><th className="p-3">Recruitment source</th><th className="p-3">Status / account</th><th className="p-3">Monthly salary</th><th className="p-3">Actions</th></tr></thead><tbody>{shownEmployees.map((e) => <tr key={e.id} className="border-t border-white/10 align-top"><td className="p-3"><p className="font-semibold">{e.name}</p><p className="mt-1 text-xs text-muted-foreground">{e.employeeCode || "No ID"} · {e.designation || "No designation"}</p><p className="mt-1 text-xs text-muted-foreground">{e.officialEmail}</p><p className="text-xs text-muted-foreground">{e.phone}</p></td><td className="p-3">{e.department}<p className="mt-1 text-xs text-muted-foreground">{e.employmentType.replaceAll("_"," ")}</p></td><td className="p-3">{e.recruitmentSource || "Other"}<p className="mt-1 text-xs text-muted-foreground">{e.recruitmentCampaign}</p></td><td className="space-y-1 p-3"><Status value={e.status}/><p><Status value={e.accountStatus || "UNKNOWN"}/></p></td><td className="p-3">{money(e.monthlySalary)}</td><td className="p-3"><div className="flex flex-wrap gap-2"><button onClick={() => startEdit(e)} className="rounded-lg border border-white/10 px-2.5 py-1.5 text-xs">Edit</button>{e.status !== "INACTIVE" && (!e.accountUserId ? <button onClick={() => void createAccount(e)} className="rounded-lg border border-white/10 px-2.5 py-1.5 text-xs">Create login</button> : e.accountStatus === "INVITED_OR_DISABLED" ? <button onClick={() => void resendInvite(e)} className="rounded-lg border border-white/10 px-2.5 py-1.5 text-xs">Resend invite</button> : null)}<button disabled={busy} onClick={async () => { if (!window.confirm(`${e.status === "INACTIVE" ? "Reactivate" : "Deactivate"} ${e.name}?`)) return; try { await api.patch(`/employees/${e.id}`, { status: e.status === "INACTIVE" ? "ACTIVE" : "INACTIVE" }); toast.success("Employee status updated."); await reload(); } catch (err: any) { toast.error(err?.response?.data?.error || "Could not update status."); } }} className="rounded-lg border border-white/10 px-2.5 py-1.5 text-xs">{e.status === "INACTIVE" ? "Reactivate" : "Deactivate"}</button></div></td></tr>)}</tbody></table>{!shownEmployees.length && <p className="p-8 text-center text-sm text-muted-foreground">No employee profiles match these filters.</p>}</div>
      </Panel>}

      {tab === "tasks" && <div className="space-y-4">
        <Panel title="Assign a task" sub="Assigned tasks are distinct from employees' personal tasks.">
          <form onSubmit={assignTask} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <SelectField label="Employee" required value={taskForm.employeeId} onChange={(v) => setTaskForm((s) => ({ ...s, employeeId: v }))} options={[{value:"",label:"Choose employee"}, ...employees.filter((e)=>e.status!=="INACTIVE").map((e)=>({value:e.id,label:`${e.name} · ${e.department}`}))]}/>
            <Field label="Task title" required value={taskForm.title} onChange={(v) => setTaskForm((s) => ({ ...s, title: v }))}/>
            <SelectField label="Priority" value={taskForm.priority} onChange={(v) => setTaskForm((s) => ({ ...s, priority: v }))} options={["LOW","MEDIUM","HIGH","URGENT"].map((v)=>({value:v,label:v}))}/>
            <Field label="Deadline" type="datetime-local" value={taskForm.deadlineAt} onChange={(v) => setTaskForm((s) => ({ ...s, deadlineAt: v }))}/>
            <Field label="Category" value={taskForm.category} onChange={(v) => setTaskForm((s) => ({ ...s, category: v }))}/>
            <Field label="Description" value={taskForm.description} onChange={(v) => setTaskForm((s) => ({ ...s, description: v }))}/>
            <button disabled={busy} className="w-fit rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">{busy ? "Assigning…" : "Assign task"}</button>
          </form>
        </Panel>
        <Panel title="Company task board" sub="Filterable task lifecycle and deadlines">
          <div className="overflow-x-auto"><table className="w-full min-w-[780px] text-left text-sm"><thead className="text-xs text-muted-foreground"><tr><th className="p-3">Task</th><th className="p-3">Employee</th><th className="p-3">Priority</th><th className="p-3">Deadline</th><th className="p-3">Status</th><th className="p-3">Update</th></tr></thead><tbody>{tasks.map((t)=><tr key={t._id} className="border-t border-white/10"><td className="p-3"><b>{t.title}</b><p className="mt-1 text-xs text-muted-foreground">{t.taskType} · {t.description}</p></td><td className="p-3">{employees.find((e)=>e.id===t.employeeId)?.name || "Employee record"}</td><td className="p-3">{t.priority}</td><td className="p-3">{dt(t.deadlineAt)}</td><td className="p-3"><Status value={t.status}/></td><td className="p-3"><select value={t.status} onChange={(e)=>void updateTask(t,e.target.value)} className="rounded-lg border border-white/10 bg-background p-2 text-xs">{["ASSIGNED","ACCEPTED","IN_PROGRESS","ON_HOLD","COMPLETED","CANCELLED"].map((v)=><option key={v}>{v}</option>)}</select></td></tr>)}</tbody></table>{tasks.length===0&&<p className="p-6 text-sm text-muted-foreground">No tasks created yet.</p>}</div>
        </Panel>
      </div>}

      {tab === "leads" && <Panel title="Central buyer lead management" sub="These are rows from Truvi's existing leads table, not a separate employee lead database. Employee identity is the submitting user.">
        <div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-sm"><thead className="text-xs text-muted-foreground"><tr><th className="p-3">Buyer</th><th className="p-3">Contact</th><th className="p-3">Source / temperature</th><th className="p-3">Stage</th><th className="p-3">Next follow-up</th><th className="p-3">Submitted</th></tr></thead><tbody>{leads.map((l)=><tr key={l._id} className="border-t border-white/10"><td className="p-3"><b>{l.clientName}</b><p className="mt-1 text-xs text-muted-foreground">TRV-L-{String(l.leadNo||"").padStart(6,"0")}</p></td><td className="p-3">{l.clientPhone}<p className="mt-1 text-xs text-muted-foreground">{l.clientEmail}</p></td><td className="p-3">{l.source}<p className="mt-1 text-xs text-muted-foreground">{l.leadTemperature||"Unclassified"}</p></td><td className="p-3"><Status value={l.stage}/></td><td className="p-3">{dt(l.nextFollowUpAt)}</td><td className="p-3">{date(l.createdAt)}</td></tr>)}</tbody></table>{leads.length===0&&<p className="p-6 text-sm text-muted-foreground">No leads found.</p>}</div>
        <p className="mt-3 text-xs text-muted-foreground">For the complete existing CRM workflow, open <Link className="underline" to="/admin/leads">Central Leads</Link>.</p>
      </Panel>}

      {tab === "visits" && <Panel title="Site visits" sub="Proposed employee visits are stored in Truvi's existing site_visits table.">
        <div className="overflow-x-auto"><table className="w-full min-w-[750px] text-left text-sm"><thead className="text-xs text-muted-foreground"><tr><th className="p-3">Buyer</th><th className="p-3">Project</th><th className="p-3">Schedule</th><th className="p-3">Status</th><th className="p-3">Update status</th></tr></thead><tbody>{visits.map((v)=><tr key={v._id} className="border-t border-white/10"><td className="p-3">{v.clientName||"Buyer"}<p className="text-xs text-muted-foreground">{v.clientPhone}</p></td><td className="p-3">{v.projectName||v.projectId}</td><td className="p-3">{dt(v.scheduledAt)}</td><td className="p-3"><Status value={v.status}/></td><td className="p-3"><select value={v.status} onChange={(e)=>void updateVisit(v,e.target.value)} className="rounded-lg border border-white/10 bg-background p-2 text-xs">{["SCHEDULED","CONFIRMED","COMPLETED","CANCELLED","NO_SHOW"].map((s)=><option key={s}>{s}</option>)}</select></td></tr>)}</tbody></table>{visits.length===0&&<p className="p-6 text-sm text-muted-foreground">No site visits found.</p>}</div>
      </Panel>}

      {tab === "attendance" && <div className="space-y-4">
        <Panel title="Correct an attendance record" sub="A correction reason is mandatory and is stored with an audit event.">
          <form onSubmit={correctAttendance} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <SelectField label="Attendance record" required value={correction.id} onChange={(v)=>setCorrection((s)=>({...s,id:v}))} options={[{value:"",label:"Choose a record"},...attendance.map((a)=>({value:a._id,label:`${employees.find((e)=>e.id===a.employeeId)?.name||"Employee"} · ${a.attendanceDate}`}))]}/>
            <SelectField label="Correct status" value={correction.status} onChange={(v)=>setCorrection((s)=>({...s,status:v}))} options={["PRESENT","ABSENT","HALF_DAY","ON_LEAVE","HOLIDAY"].map((s)=>({value:s,label:s.replaceAll("_"," ")}))}/>
            <Field label="Reason for correction" required value={correction.correctionReason} onChange={(v)=>setCorrection((s)=>({...s,correctionReason:v}))}/>
            <button className="self-end rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground">Save correction</button>
          </form>
        </Panel>
        <Panel title="Attendance history" sub="All displayed times use server-recorded timestamps.">
          <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="text-xs text-muted-foreground"><tr><th className="p-3">Employee</th><th className="p-3">Date</th><th className="p-3">Status</th><th className="p-3">Check in</th><th className="p-3">Check out</th><th className="p-3">Hours</th></tr></thead><tbody>{attendance.map((a)=><tr key={a._id} className="border-t border-white/10"><td className="p-3">{employees.find((e)=>e.id===a.employeeId)?.name||"Employee"}</td><td className="p-3">{a.attendanceDate}</td><td className="p-3"><Status value={a.status}/></td><td className="p-3">{dt(a.checkInAt)}</td><td className="p-3">{dt(a.checkOutAt)}</td><td className="p-3">{a.workingMinutes == null ? "—" : `${Math.floor(a.workingMinutes/60)}h ${a.workingMinutes%60}m`}</td></tr>)}</tbody></table>{attendance.length===0&&<p className="p-6 text-sm text-muted-foreground">No attendance has been recorded yet. This does not mean employees are absent.</p>}</div>
        </Panel>
      </div>}

      {tab === "salary" && <div className="space-y-4">
        <Panel title="Create monthly payroll record" sub="Creates a Draft record only. This does not transfer money or automatically mark a salary as paid.">
          <form onSubmit={createSalary} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <SelectField label="Employee" required value={salaryForm.employeeId} onChange={(v)=>setSalaryForm((s)=>({...s,employeeId:v}))} options={[{value:"",label:"Choose employee"},...employees.map((e)=>({value:e.id,label:`${e.name} · ${e.employeeCode||"No ID"}`}))]}/>
            <Field label="Payroll month" type="month" required value={salaryForm.monthKey} onChange={(v)=>setSalaryForm((s)=>({...s,monthKey:v}))}/>
            <Field label="Gross salary (₹)" type="number" required value={salaryForm.grossSalary} onChange={(v)=>setSalaryForm((s)=>({...s,grossSalary:v}))}/>
            <Field label="Allowances (₹)" type="number" value={salaryForm.allowances} onChange={(v)=>setSalaryForm((s)=>({...s,allowances:v}))}/>
            <Field label="Deductions (₹)" type="number" value={salaryForm.deductions} onChange={(v)=>setSalaryForm((s)=>({...s,deductions:v}))}/>
            <Field label="Notes" value={salaryForm.notes} onChange={(v)=>setSalaryForm((s)=>({...s,notes:v}))}/>
            <button disabled={busy} className="w-fit rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">{busy ? "Saving…" : "Create draft record"}</button>
          </form>
        </Panel>
        <Panel title="Salary records" sub="Approvals and status transitions are validated server-side.">
          <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="text-xs text-muted-foreground"><tr><th className="p-3">Employee</th><th className="p-3">Month</th><th className="p-3">Gross</th><th className="p-3">Allowances</th><th className="p-3">Deductions</th><th className="p-3">Net payable</th><th className="p-3">Status</th><th className="p-3">Next action</th></tr></thead><tbody>{salaries.map((s)=><tr key={s._id} className="border-t border-white/10"><td className="p-3"><b>{s.employeeName||employees.find((e)=>e.id===s.employeeId)?.name||"Employee"}</b><p className="text-xs text-muted-foreground">{s.employeeCode}</p></td><td className="p-3">{s.monthKey}</td><td className="p-3">{money(s.grossSalary)}</td><td className="p-3">{money(s.allowances)}</td><td className="p-3">{money(s.deductions)}</td><td className="p-3 font-semibold">{money(s.netPayable)}</td><td className="p-3"><Status value={s.status}/></td><td className="p-3"><div className="flex flex-wrap gap-1">{s.status==="DRAFT"&&<button onClick={()=>void advanceSalary(s,"PENDING_APPROVAL")} className="rounded-lg border border-white/10 px-2 py-1.5 text-xs">Submit approval</button>}{s.status==="PENDING_APPROVAL"&&<button onClick={()=>void advanceSalary(s,"APPROVED")} className="rounded-lg border border-white/10 px-2 py-1.5 text-xs">Approve</button>}{s.status==="APPROVED"&&<button onClick={()=>void advanceSalary(s,"PAID")} className="rounded-lg border border-white/10 px-2 py-1.5 text-xs">Record paid</button>}{!["PAID","ON_HOLD"].includes(s.status)&&<button onClick={()=>void advanceSalary(s,"ON_HOLD")} className="rounded-lg border border-white/10 px-2 py-1.5 text-xs">Hold</button>}{s.status==="ON_HOLD"&&<button onClick={()=>void advanceSalary(s,"DRAFT")} className="rounded-lg border border-white/10 px-2 py-1.5 text-xs">Return to draft</button>}</div></td></tr>)}</tbody></table>{salaries.length===0&&<p className="p-6 text-sm text-muted-foreground">No salary records. Create a draft above.</p>}</div>
        </Panel>
        <p className="text-xs leading-5 text-muted-foreground">Marking a record paid requires a payment date and reference. Truvi does not execute a bank transfer or UPI payout.</p>
      </div>}
    </div>
  );
}

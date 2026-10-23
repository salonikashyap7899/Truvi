import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Banknote, BarChart3, CalendarCheck, CalendarClock, CalendarDays, History, LayoutDashboard, ListChecks, Mail, Phone, RefreshCw, ShieldCheck, UserRound, Users, X } from "lucide-react";
import { useSocketEvent } from "@/lib/socket";

type Tab = "overview" | "employees" | "tasks" | "leads" | "visits" | "attendance" | "leave" | "salary" | "reports" | "activity";
type Employee = {
  id: string; accountUserId?: string | null; employeeCode?: string | null; name: string;
  officialEmail: string; phone: string; department: string; designation: string;
  employmentType: string; reportingManagerId?: string | null; recruitmentSource: string;
  recruitmentCampaign?: string; applicationDate?: string | null; interviewDate?: string | null;
  joiningDate?: string | null; status: "ACTIVE" | "ON_LEAVE" | "INACTIVE"; monthlySalary: number;
  salaryDueDay: number; notes?: string; permissions?: string[]; accountStatus?: string;
  avatarUrl?: string | null; bio?: string | null; emailVerified?: boolean; phoneVerified?: boolean;
  accountCreatedAt?: string | null; lastActiveAt?: string | null;
};
type TaskAttachment = { _id: string; originalFileName: string; mimeType: string; sizeBytes: number; uploadedByUserId: string; createdAt: string };
type TaskHistoryItem = { _id: string; actorUserId: string; action: string; beforeValue?: Record<string, unknown> | null; afterValue?: Record<string, unknown> | null; reason?: string | null; createdAt: string };
type TaskComment = { _id: string; authorUserId: string; body: string; createdAt: string };
type TaskActivity = { history: TaskHistoryItem[]; comments: TaskComment[] };
type TaskAssignee = { employeeId: string; name: string; employeeCode?: string | null; status: string };
type Task = { _id: string; employeeId: string; title: string; description?: string | null; taskType: string; priority: string; status: string; taskStatus?: string; deadlineAt?: string | null; createdAt: string; assignees?: TaskAssignee[]; assignedEmployeeIds?: string[]; attachments?: TaskAttachment[] };
type LeaveRequest = { _id: string; employeeId: string; employeeName?: string; employeeCode?: string; department?: string; leaveType: string; startDate: string; endDate: string; totalDays: number; reason: string; status: string; reviewNotes?: string | null; createdAt: string };
type Lead = { _id: string; leadNo?: number; clientName: string; clientPhone: string; clientEmail?: string | null; projectId: string; submittedById: string; assignedToId?: string | null; stage: string; source: string; leadTemperature?: string | null; siteVisitStatus?: string | null; nextFollowUpAt?: string | null; createdAt: string };
type Visit = { _id: string; leadId?: string | null; projectId: string; projectName?: string; clientName?: string; clientPhone?: string; responsibleUserId?: string | null; scheduledAt: string; status: string; reportNotes?: string | null };
type Attendance = { _id: string; employeeId: string; attendanceDate: string; status: string; checkInAt?: string | null; checkOutAt?: string | null; workingMinutes?: number | null; correctionReason?: string | null };
type Salary = { _id: string; employeeId: string; employeeName?: string; employeeCode?: string; monthKey: string; grossSalary: number; allowances: number; deductions: number; netPayable: number; status: string; paymentDate?: string | null; paymentReference?: string | null };
type PerformanceMetric = { employeeId: string; employeeCode?: string | null; name: string; department: string; designation?: string | null; recruitmentSource?: string | null; status: string; accountLinked: boolean; tasksCompleted: number; tasksOverdue: number; tasksOpen: number; leadsSubmitted: number; leadsAssigned: number; callsLogged: number; siteVisitsScheduled: number; siteVisitsCompleted: number; attendancePresentDays: number };
type AuditRow = { _id: string; userId?: string | null; actorName?: string | null; actorEmail?: string | null; action: string; resourceType?: string | null; resourceId?: string | null; metadata?: Record<string, unknown>; createdAt: string };
type EmployeeProfileData = {
  employee: Employee;
  account: {
    id: string; name?: string | null; email?: string | null; phone?: string | null; role?: string;
    avatarUrl?: string | null; bio?: string | null; emailVerified: boolean; phoneVerified: boolean;
    disabled: boolean; createdAt?: string | null; lastActiveAt?: string | null;
  } | null;
  activity: {
    tasks: Array<{ id: string; title: string; priority: string; status: string; taskType: string; deadlineAt?: string | null; createdAt: string }>;
    attendance: Array<{ id: string; attendanceDate: string; status: string; checkInAt?: string | null; checkOutAt?: string | null; workingMinutes?: number | null }>;
    leaveRequests: Array<{ id: string; leaveType: string; startDate: string; endDate: string; totalDays: number; status: string; reason: string; createdAt: string }>;
    salaryRecords: Array<{ id: string; monthKey: string; grossSalary: number; allowances: number; deductions: number; netPayable: number; status: string; paymentDate?: string | null; paymentReference?: string | null }>;
    buyerLeads: Array<{ id: string; clientName: string; clientPhone: string; stage: string; leadTemperature?: string | null; createdAt: string }>;
    siteVisits: Array<{ id: string; scheduledAt: string; status: string; projectId: string; leadId?: string | null }>;
  };
};
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
  { id: "visits", label: "Site visits" }, { id: "attendance", label: "Attendance" }, { id: "leave", label: "Leave requests" }, { id: "salary", label: "Salary & payroll" }, { id: "reports", label: "Performance reports" }, { id: "activity", label: "Activity logs" },
];
const tabIcons = {
  overview: LayoutDashboard, employees: Users, tasks: ListChecks, leads: Users,
  visits: CalendarClock, attendance: CalendarCheck, leave: CalendarDays,
  salary: Banknote, reports: BarChart3, activity: History,
} as const;
const money = (n?: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n ?? 0);
const date = (raw?: string | null) => raw ? new Date(raw).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";
const dt = (raw?: string | null) => raw ? new Date(raw).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";
const pill = (status: string) => status === "ACTIVE" || status === "PAID" || status === "APPROVED" || status === "COMPLETED" || status === "PRESENT" ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/20" : status === "INACTIVE" || status === "CANCELLED" || status === "ABSENT" || status === "ON_HOLD" ? "bg-red-500/10 text-red-300 border-red-500/20" : "bg-amber-500/10 text-amber-200 border-amber-500/20";

function Status({ value }: { value: string }) {
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${pill(value)}`}>{value.replaceAll("_", " ")}</span>;
}
function Kpi({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.035] p-4 shadow-sm transition duration-200 hover:border-primary/30 hover:bg-white/[0.05]">
      <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-primary/70 via-primary/20 to-transparent" />
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium leading-5 text-muted-foreground">{label}</p>
        <span aria-hidden="true" className="mt-1 size-2 shrink-0 rounded-full bg-primary/80 shadow-[0_0_12px_rgba(124,92,255,0.22)]" />
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{value}</p>
      {sub && <p className="mt-1 text-xs leading-5 text-muted-foreground">{sub}</p>}
    </div>
  );
}
function Panel({ title, sub, children, action }: { title: string; sub?: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.025] p-4 shadow-[0_8px_32px_rgba(0,0,0,0.12)] sm:p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold tracking-tight">{title}</h2>
          {sub && <p className="mt-1 text-xs leading-5 text-muted-foreground">{sub}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
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
  status: "ACTIVE", monthlySalary: "0", salaryDueDay: "1", notes: "", permissions: "",
};

export default function AdminEmployeeManagementPage() {
  const [tab, setTab] = useState<Tab>("overview");
  const [searchParams] = useSearchParams();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<EmployeeProfileData | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [taskActivityId, setTaskActivityId] = useState<string | null>(null);
  const [taskActivity, setTaskActivity] = useState<TaskActivity | null>(null);
  const [taskCommentDraft, setTaskCommentDraft] = useState("");
  const [leads, setLeads] = useState<Lead[]>([]);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [salaries, setSalaries] = useState<Salary[]>([]);
  const [performance, setPerformance] = useState<PerformanceMetric[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditRow[]>([]);
  const [auditEmployeeId, setAuditEmployeeId] = useState("ALL");
  const [perfFrom, setPerfFrom] = useState("");
  const [perfTo, setPerfTo] = useState("");
  const [perfDepartment, setPerfDepartment] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const [loadIssues, setLoadIssues] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [employeeForm, setEmployeeForm] = useState<Record<string, string>>({ ...emptyEmployee });
  const [busy, setBusy] = useState(false);
  const [taskForm, setTaskForm] = useState({ employeeId: "", employeeIds: [] as string[], title: "", description: "", priority: "MEDIUM", deadlineAt: "", category: "GENERAL" });
  const [reassignTaskId, setReassignTaskId] = useState<string | null>(null);
  const [reassignEmployeeIds, setReassignEmployeeIds] = useState<string[]>([]);
  const [salaryForm, setSalaryForm] = useState({ employeeId: "", monthKey: new Date().toISOString().slice(0, 7), grossSalary: "", allowances: "0", deductions: "0", notes: "" });
  const [correction, setCorrection] = useState({ id: "", status: "PRESENT", correctionReason: "" });

  async function reload() {
    setLoading(true);
    setLoadIssues([]);
    const requests = await Promise.allSettled([
      api.get("/employees/overview"), api.get("/employees"), api.get("/employees/tasks"),
      api.get("/employees/leads"), api.get("/employees/site-visits"), api.get("/employees/attendance"), api.get("/employees/salaries"),
      api.get("/employees/performance"), api.get("/employees/audit-logs?limit=100"), api.get("/employees/leave-requests"),
    ]);
    const failures: string[] = [];
    const apply = (index: number, label: string, consume: (data: any) => void) => {
      const result = requests[index];
      if (result.status === "fulfilled") {
        consume(result.value.data);
        return;
      }
      const status = result.reason?.response?.status;
      failures.push(status ? `${label} (HTTP ${status})` : label);
    };
    apply(0, "Overview", (data) => setSummary(data));
    apply(1, "Employee directory", (data) => setEmployees(data.employees ?? []));
    apply(2, "Tasks", (data) => setTasks(data.tasks ?? []));
    apply(3, "Lead management", (data) => setLeads(data.leads ?? []));
    apply(4, "Site visits", (data) => setVisits(data.siteVisits ?? []));
    apply(5, "Attendance", (data) => setAttendance(data.attendance ?? []));
    apply(6, "Salary and payroll", (data) => setSalaries(data.salaries ?? []));
    apply(7, "Performance reports", (data) => setPerformance(data.metrics ?? []));
    apply(8, "Audit logs", (data) => setAuditLogs(data.auditLogs ?? []));
    apply(9, "Leave requests", (data) => setLeaveRequests(data.leaveRequests ?? []));
    setLoadIssues(failures);
    if (failures.length === requests.length) {
      toast.error("Employee Management could not load any sections. Check your admin session and server deployment.");
    } else if (failures.length) {
      toast.warning(`${failures.length} Employee Management section(s) could not load. Other sections remain available.`);
    }
    setLoading(false);
  }
  useEffect(() => { void reload(); }, []);
  useEffect(() => { const requested = searchParams.get("tab"); if (requested && tabs.some((item) => item.id === requested)) setTab(requested as Tab); }, [searchParams]);

  async function openEmployeeProfile(employee: Employee) {
    setProfileLoading(true);
    setSelectedProfile({
      employee,
      account: employee.accountUserId ? {
        id: employee.accountUserId, name: employee.name, email: employee.officialEmail, phone: employee.phone,
        avatarUrl: employee.avatarUrl, bio: employee.bio, emailVerified: !!employee.emailVerified,
        phoneVerified: !!employee.phoneVerified, disabled: employee.accountStatus === "INVITED_OR_DISABLED",
        createdAt: employee.accountCreatedAt, lastActiveAt: employee.lastActiveAt,
      } : null,
      activity: { tasks: [], attendance: [], leaveRequests: [], salaryRecords: [], buyerLeads: [], siteVisits: [] },
    });
    try {
      const response = await api.get(`/employees/${employee.id}/profile`);
      setSelectedProfile(response.data as EmployeeProfileData);
    } catch (error: any) {
      toast.error(error?.response?.data?.error || "Could not load the employee profile.");
      setSelectedProfile(null);
    } finally {
      setProfileLoading(false);
    }
  }

  useSocketEvent<{ type?: string; title?: string }>("notification:new", (notice) => {
    // Employee work updates are persisted and emitted over the existing shared
    // notification socket; reload this module so counts and recent activity
    // update without requiring the administrator to refresh manually.
    if (notice?.type?.startsWith("employee_")) {
      void reload();
      if (selectedProfile?.employee?.id) {
        const current = employees.find((employee) => employee.id === selectedProfile.employee.id);
        if (current) void openEmployeeProfile(current);
      }
    }
  });

  const shownEmployees = useMemo(() => employees.filter((e) => {
    const q = query.toLowerCase().trim();
    const match = !q || [e.name, e.officialEmail, e.employeeCode, e.department, e.designation, e.phone].some((v) => String(v ?? "").toLowerCase().includes(q));
    return match && (statusFilter === "ALL" || e.status === statusFilter);
  }), [employees, query, statusFilter]);

  const attendanceMarked = summary
    ? summary.attendanceSummary.present + summary.attendanceSummary.absent + summary.attendanceSummary.halfDay + summary.attendanceSummary.onLeave
    : 0;
  const attendanceRate = summary?.activeEmployees
    ? Math.min(100, Math.round((attendanceMarked / summary.activeEmployees) * 100))
    : 0;
  const pendingLeaveCount = leaveRequests.filter((request) => request.status === "PENDING").length;

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
    const employeeCode = String(employeeForm.employeeCode ?? "").trim();
    const permissionInput = String(employeeForm.permissions ?? "").trim();
    const payload = {
      ...employeeForm,
      // Empty Employee ID means let the server generate a unique code. Sending
      // "" fails the server schema's optional, non-empty employeeCode validation.
      employeeCode: employeeCode || undefined,
      monthlySalary: Number(employeeForm.monthlySalary), salaryDueDay: Number(employeeForm.salaryDueDay),
      permissions: permissionInput ? permissionInput.split(",").map((p) => p.trim()).filter(Boolean) : editing ? [] : undefined,
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
      setShowForm(false); setEditing(null); setEmployeeForm({ ...emptyEmployee });
      // Refresh records in the background so a slow dashboard refresh does not
      // keep the submit button stuck on “Saving…” after the save succeeded.
      void reload();
    } catch (error: any) {
      const response = error?.response?.data;
      const fieldErrors = response?.issues?.fieldErrors as Record<string, string[]> | undefined;
      const firstFieldError = fieldErrors ? Object.values(fieldErrors).flat().find(Boolean) : undefined;
      toast.error(firstFieldError ? `Check employee details: ${firstFieldError}` : response?.error || "Could not save employee.");
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
      await api.post("/employees/tasks", { ...taskForm, employeeIds: taskForm.employeeIds, employeeId: taskForm.employeeIds[0], estimatedMinutes: undefined, deadlineAt: taskForm.deadlineAt ? new Date(taskForm.deadlineAt).toISOString() : null });
      toast.success("Task assigned to " + taskForm.employeeIds.length + " employee(s)."); setTaskForm({ employeeId: "", employeeIds: [], title: "", description: "", priority: "MEDIUM", deadlineAt: "", category: "GENERAL" }); await reload();
    } catch (error: any) { toast.error(error?.response?.data?.error || "Could not assign task."); }
    finally { setBusy(false); }
  }
  async function updateTask(task: Task, status: string) {
    try { await api.patch(`/employees/tasks/${task._id}`, { status }); toast.success("Task updated."); await reload(); }
    catch (error: any) { toast.error(error?.response?.data?.error || "Could not update task."); }
  }
  async function openTaskActivity(taskId: string) {
    if (taskActivityId === taskId) {
      setTaskActivityId(null); setTaskActivity(null); setTaskCommentDraft("");
      return;
    }
    setTaskActivityId(taskId);
    setTaskActivity(null);
    try {
      const response = await api.get("/employees/tasks/" + taskId + "/history");
      setTaskActivity(response.data);
    } catch (error: any) { toast.error(error?.response?.data?.error || "Could not load task history."); }
  }
  async function addTaskComment(e: FormEvent) {
    e.preventDefault();
    if (!taskActivityId || !taskCommentDraft.trim()) return;
    try {
      await api.post("/employees/tasks/" + taskActivityId + "/comments", { body: taskCommentDraft.trim() });
      setTaskCommentDraft("");
      const response = await api.get("/employees/tasks/" + taskActivityId + "/history");
      setTaskActivity(response.data);
      toast.success("Task comment added.");
    } catch (error: any) { toast.error(error?.response?.data?.error || "Could not add task comment."); }
  }
  async function uploadTaskAttachment(taskId: string, file: File) {
    const form = new FormData();
    form.append("file", file);
    try {
      await api.post("/employees/tasks/" + taskId + "/attachments", form);
      toast.success("Task attachment uploaded privately.");
      await reload();
    } catch (error: any) { toast.error(error?.response?.data?.error || "Could not upload attachment."); }
  }
  async function downloadTaskAttachment(taskId: string, attachment: TaskAttachment) {
    try {
      const response = await api.get("/employees/tasks/" + taskId + "/attachments/" + attachment._id, { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([response.data], { type: attachment.mimeType }));
      const link = document.createElement("a");
      link.href = url;
      link.download = attachment.originalFileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error: any) { toast.error(error?.response?.data?.error || "Could not download attachment."); }
  }
  async function deleteTaskAttachment(taskId: string, attachment: TaskAttachment) {
    if (!window.confirm("Delete task attachment " + attachment.originalFileName + "?")) return;
    try {
      await api.delete("/employees/tasks/" + taskId + "/attachments/" + attachment._id);
      toast.success("Attachment deleted.");
      await reload();
    } catch (error: any) { toast.error(error?.response?.data?.error || "Could not delete attachment."); }
  }
  async function reviewLeave(request: LeaveRequest, status: "APPROVED" | "REJECTED") {
    const reviewNotes = window.prompt("Review notes (optional):", request.reviewNotes || "");
    if (reviewNotes === null) return;
    try {
      await api.patch("/employees/leave-requests/" + request._id, { status, reviewNotes });
      toast.success("Leave request " + status.toLowerCase() + ".");
      await reload();
    } catch (error: any) { toast.error(error?.response?.data?.error || "Could not review leave request."); }
  }
  function startReassignTask(task: Task) {
    const ids = task.assignedEmployeeIds?.length ? task.assignedEmployeeIds : [task.employeeId];
    setReassignTaskId(task._id);
    setReassignEmployeeIds(ids.filter((id) => employees.some((employee) => employee.id === id && employee.accountUserId && employee.status !== "INACTIVE")));
  }
  async function saveTaskAssignees() {
    if (!reassignTaskId || !reassignEmployeeIds.length) return;
    setBusy(true);
    try {
      await api.patch("/employees/tasks/" + reassignTaskId, { employeeIds: reassignEmployeeIds });
      toast.success("Task assignees updated.");
      setReassignTaskId(null);
      setReassignEmployeeIds([]);
      await reload();
    } catch (error: any) { toast.error(error?.response?.data?.error || "Could not reassign task."); }
    finally { setBusy(false); }
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
  async function loadPerformance() {
    setBusy(true);
    try {
      const params = new URLSearchParams();
      if (perfFrom) params.set("from", new Date(perfFrom).toISOString());
      if (perfTo) params.set("to", new Date(perfTo + "T23:59:59").toISOString());
      if (perfDepartment !== "ALL") params.set("department", perfDepartment);
      const r = await api.get("/employees/performance" + (params.size ? "?" + params.toString() : ""));
      setPerformance(r.data.metrics ?? []);
    } catch (error: any) { toast.error(error?.response?.data?.error || "Could not load performance reports."); }
    finally { setBusy(false); }
  }
  async function loadAuditLogs() {
    setBusy(true);
    try {
      const params = new URLSearchParams({ limit: "250" });
      if (auditEmployeeId !== "ALL") params.set("employeeId", auditEmployeeId);
      const r = await api.get("/employees/audit-logs?" + params.toString());
      setAuditLogs(r.data.auditLogs ?? []);
    } catch (error: any) { toast.error(error?.response?.data?.error || "Could not load employee audit logs."); }
    finally { setBusy(false); }
  }
  async function updateVisit(v: Visit, status: string) {
    try { await api.patch(`/employees/site-visits/${v._id}`, { status }); toast.success("Site visit updated."); await reload(); }
    catch (error: any) { toast.error(error?.response?.data?.error || "Could not update site visit."); }
  }

  return (
    <div className="truvi-erm truvi-erm-admin mx-auto max-w-[1600px] space-y-6 p-4 text-foreground sm:p-6 lg:p-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Truvi Operations</p><h1 className="mt-2 text-2xl font-semibold sm:text-3xl">Employee Management</h1><p className="mt-2 max-w-2xl text-sm text-muted-foreground">Employee accounts, work allocation, central buyer leads, attendance and controlled payroll records.</p></div>
        <div className="flex flex-wrap gap-2"><button type="button" onClick={() => void reload()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2.5 text-sm disabled:opacity-50"><RefreshCw size={16} className={loading ? "animate-spin" : ""}/> Refresh data</button><Link to="/admin/audit-logs" className="rounded-xl border border-white/10 px-4 py-2.5 text-sm">Activity &amp; audit logs</Link><button onClick={() => { setEditing(null); setEmployeeForm({ ...emptyEmployee }); setShowForm((v) => !v); }} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground">{showForm ? "Close form" : "+ Add employee"}</button></div>
      </header>

      <nav aria-label="Employee management sections" className="truvi-erm-tabs flex gap-2 overflow-x-auto border-b border-white/10 pb-2">
        {tabs.map((t) => { const Icon = tabIcons[t.id]; return <button key={t.id} type="button" aria-current={tab === t.id ? "page" : undefined} onClick={() => setTab(t.id)} className={`shrink-0 rounded-xl px-3 py-2 text-sm ${tab === t.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-white/5 hover:text-foreground"}`}><Icon size={16} aria-hidden="true"/><span>{t.label}</span></button>; })}
      </nav>

      {loading && <div role="status" className="rounded-xl border border-white/10 p-4 text-sm text-muted-foreground">Loading live company records…</div>}
      {!loading && loadIssues.length > 0 && <div role="status" className="truvi-erm-load-warning flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4 text-sm"><div><p className="font-semibold">Some sections need attention</p><p className="mt-1">The rest of Employee Management remains available. Failed requests: {loadIssues.join(", ")}.</p></div><button type="button" onClick={() => void reload()} className="inline-flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-sm"><RefreshCw size={15}/> Retry data</button></div>}

      {tab === "overview" && summary && <>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Kpi label="Employee profiles" value={summary.totalEmployees} sub={summary.activeEmployees + " active · " + summary.employeesOnLeave + " on leave"} />
          <Kpi label="Active accounts" value={summary.activeAccounts} sub={summary.pendingInvitations + " invitations awaiting activation"} />
          <Kpi label="Open tasks" value={summary.pendingTasks} sub={summary.overdueTasks + " overdue across the team"} />
          <Kpi label="Attendance marked" value={attendanceMarked} sub={summary.attendanceSummary.notMarked + " active staff still to mark"} />
        </div>

        <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(300px,0.85fr)]">
          <div className="min-w-0 space-y-4">
            <Panel title="Workforce overview" sub="A live snapshot of departments and recruitment sources" action={<button onClick={() => setTab("reports")} className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium transition hover:border-primary/30 hover:bg-white/5">View reports</button>}>
              <div className="grid gap-6 lg:grid-cols-2">
                <div className="min-w-0">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold">Employees by department</h3>
                    <span className="text-xs text-muted-foreground">{summary.byDepartment.reduce((sum, row) => sum + row.count, 0)} staff</span>
                  </div>
                  <div className="space-y-4">
                    {summary.byDepartment.length ? summary.byDepartment.slice(0, 6).map((row) => (
                      <div key={row.department}>
                        <div className="mb-1.5 flex items-center justify-between gap-3 text-xs">
                          <span className="truncate text-muted-foreground">{row.department}</span><span className="font-semibold tabular-nums">{row.count}</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-white/[0.06]">
                          <div className="h-full rounded-full bg-gradient-to-r from-primary to-primary/50 transition-all" style={{ width: (row.count / Math.max(...summary.byDepartment.map((item) => item.count), 1) * 100) + "%" }} />
                        </div>
                      </div>
                    )) : <p className="text-sm text-muted-foreground">Department totals will appear when employee records are added.</p>}
                  </div>
                </div>
                <div className="min-w-0 border-t border-white/10 pt-5 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold">Recruitment sources</h3>
                    <span className="text-xs text-muted-foreground">Top sources</span>
                  </div>
                  <div className="space-y-4">
                    {summary.byRecruitmentSource.length ? summary.byRecruitmentSource.slice(0, 6).map((row) => (
                      <div key={row.source}>
                        <div className="mb-1.5 flex items-center justify-between gap-3 text-xs">
                          <span className="truncate text-muted-foreground">{row.source}</span><span className="font-semibold tabular-nums">{row.count}</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-white/[0.06]">
                          <div className="h-full rounded-full bg-gradient-to-r from-emerald-400/90 to-emerald-400/40 transition-all" style={{ width: (row.count / Math.max(...summary.byRecruitmentSource.map((item) => item.count), 1) * 100) + "%" }} />
                        </div>
                      </div>
                    )) : <p className="text-sm text-muted-foreground">Recruitment source data will appear as profiles are completed.</p>}
                  </div>
                </div>
              </div>
            </Panel>

            <Panel title="Employees list" sub="A quick view of the latest employee profiles" action={<button onClick={() => { setQuery(""); setStatusFilter("ALL"); setTab("employees"); }} className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium transition hover:border-primary/30 hover:bg-white/5">See all employees</button>}>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[540px] text-left text-sm">
                  <thead className="text-xs text-muted-foreground">
                    <tr><th className="pb-3 pr-3 font-medium">Employee</th><th className="pb-3 pr-3 font-medium">Department / role</th><th className="pb-3 pr-3 font-medium">Status</th><th className="pb-3 text-right font-medium">Action</th></tr>
                  </thead>
                  <tbody>
                    {employees.slice(0, 5).map((employee) => (
                      <tr key={employee.id} className="border-t border-white/10 align-middle transition hover:bg-white/[0.02]">
                        <td className="py-3 pr-3">
                          <div className="flex min-w-0 items-center gap-3">
                            <div className="grid size-9 shrink-0 place-items-center rounded-full border border-primary/20 bg-primary/10 text-xs font-semibold text-primary">{employee.name.split(" ").map((part) => part[0]).slice(0, 2).join("").toUpperCase()}</div>
                            <div className="min-w-0"><p className="truncate font-medium">{employee.name}</p><p className="mt-0.5 truncate text-xs text-muted-foreground">{employee.employeeCode || employee.officialEmail || "No employee ID"}</p></div>
                          </div>
                        </td>
                        <td className="py-3 pr-3"><p className="font-medium">{employee.department || "Unassigned"}</p><p className="mt-0.5 text-xs text-muted-foreground">{employee.designation || "No designation"}</p></td>
                        <td className="py-3 pr-3"><Status value={employee.status} /></td>
                        <td className="py-3 text-right"><button onClick={() => { setQuery(employee.name); setStatusFilter("ALL"); setTab("employees"); }} className="rounded-lg border border-white/10 px-2.5 py-1.5 text-xs transition hover:border-primary/30 hover:text-primary">View</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {employees.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No employee profiles yet. Add an employee to get started.</p>}
              </div>
            </Panel>
          </div>

          <div className="min-w-0 space-y-4">
            <Panel title="Attendance today" sub="Check-ins and leave status across active staff" action={<button onClick={() => setTab("attendance")} className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium transition hover:border-primary/30 hover:bg-white/5">Manage</button>}>
              <div className="flex items-end justify-between gap-4">
                <div><p className="text-3xl font-semibold tracking-tight">{attendanceRate}%</p><p className="mt-1 text-xs text-muted-foreground">{attendanceMarked} marked · {summary.activeEmployees} active employees</p></div>
                <div className="text-right"><p className="text-sm font-semibold tabular-nums">{summary.attendanceSummary.present}</p><p className="text-xs text-muted-foreground">Present</p></div>
              </div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/[0.06]">
                <div className="h-full rounded-full bg-gradient-to-r from-primary to-emerald-400 transition-all" style={{ width: attendanceRate + "%" }} />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                {[
                  { label: "Present", value: summary.attendanceSummary.present, color: "text-emerald-300" },
                  { label: "Absent", value: summary.attendanceSummary.absent, color: "text-red-300" },
                  { label: "Half day", value: summary.attendanceSummary.halfDay, color: "text-amber-200" },
                  { label: "On leave", value: summary.attendanceSummary.onLeave, color: "text-primary" },
                ].map((item) => <div key={item.label} className="rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2.5"><p className="text-xs text-muted-foreground">{item.label}</p><p className={"mt-1 text-lg font-semibold tabular-nums " + item.color}>{item.value}</p></div>)}
              </div>
            </Panel>

            <Panel title="Things to do" sub="Items that may need an admin follow-up">
              <div className="space-y-2">
                <button onClick={() => { setTab("employees"); setQuery(""); setStatusFilter("ALL"); }} className="flex w-full items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-3 text-left transition hover:border-primary/30 hover:bg-white/[0.04]">
                  <span className="min-w-0"><span className="block text-sm font-medium">Pending invitations</span><span className="mt-1 block text-xs text-muted-foreground">Employee accounts awaiting activation</span></span><span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-sm font-semibold text-primary">{summary.pendingInvitations}</span>
                </button>
                <button onClick={() => setTab("tasks")} className="flex w-full items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-3 text-left transition hover:border-primary/30 hover:bg-white/[0.04]">
                  <span className="min-w-0"><span className="block text-sm font-medium">Overdue tasks</span><span className="mt-1 block text-xs text-muted-foreground">Review deadlines and update assignees</span></span><span className="grid size-8 shrink-0 place-items-center rounded-lg bg-red-500/10 text-sm font-semibold text-red-300">{summary.overdueTasks}</span>
                </button>
                <button onClick={() => setTab("leave")} className="flex w-full items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-3 text-left transition hover:border-primary/30 hover:bg-white/[0.04]">
                  <span className="min-w-0"><span className="block text-sm font-medium">Leave requests</span><span className="mt-1 block text-xs text-muted-foreground">Requests waiting for review</span></span><span className="grid size-8 shrink-0 place-items-center rounded-lg bg-amber-500/10 text-sm font-semibold text-amber-200">{pendingLeaveCount}</span>
                </button>
                <button onClick={() => setTab("attendance")} className="flex w-full items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-3 text-left transition hover:border-primary/30 hover:bg-white/[0.04]">
                  <span className="min-w-0"><span className="block text-sm font-medium">Attendance not marked</span><span className="mt-1 block text-xs text-muted-foreground">Active staff still to check in</span></span><span className="grid size-8 shrink-0 place-items-center rounded-lg bg-white/[0.05] text-sm font-semibold">{summary.attendanceSummary.notMarked}</span>
                </button>
              </div>
            </Panel>

            <Panel title="Upcoming work" sub="Open tasks with the nearest deadlines" action={<button onClick={() => setTab("tasks")} className="text-xs font-medium text-primary hover:underline">View task board</button>}>
              <div className="space-y-3">
                {tasks.filter((task) => !["COMPLETED", "CANCELLED"].includes(task.status)).sort((a, b) => new Date(a.deadlineAt || "9999-12-31").getTime() - new Date(b.deadlineAt || "9999-12-31").getTime()).slice(0, 4).map((task) => (
                  <div key={task._id} className="flex items-start justify-between gap-3 border-b border-white/10 pb-3 last:border-0 last:pb-0">
                    <div className="min-w-0"><p className="break-words text-sm font-medium">{task.title}</p><p className="mt-1 text-xs text-muted-foreground">{task.deadlineAt ? dt(task.deadlineAt) : "No deadline set"}</p><p className="mt-1 text-[11px] text-muted-foreground">{task.assignees?.map((assignee) => assignee.name).join(", ") || employees.find((employee) => employee.id === task.employeeId)?.name || "No assignee listed"}</p></div>
                    <Status value={task.status} />
                  </div>
                ))}
                {tasks.filter((task) => !["COMPLETED", "CANCELLED"].includes(task.status)).length === 0 && <p className="text-sm text-muted-foreground">No open tasks. You're all caught up.</p>}
              </div>
            </Panel>
          </div>
        </div>
      </>}

      {showForm && <Panel title={editing ? `Edit ${editing.name}` : "Create employee profile and account"} sub="A secure activation link is emailed after creation. Passwords are never shown or stored in plaintext." action={editing && <Status value={editing.status}/>}>
        <form onSubmit={saveEmployee} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <Field label="Full name" value={employeeForm.name} onChange={(v) => setEmployeeForm((s) => ({ ...s, name: v }))} required/>
          <Field label="Employee ID (auto-generated if empty)" value={employeeForm.employeeCode} onChange={(v) => setEmployeeForm((s) => ({ ...s, employeeCode: v }))}/>
          <Field label="Official email" type="email" value={employeeForm.officialEmail} onChange={(v) => setEmployeeForm((s) => ({ ...s, officialEmail: v }))} required disabled={!!editing}/>
          <Field label="Phone number (required for employee account)" type="tel" value={employeeForm.phone} onChange={(v) => setEmployeeForm((s) => ({ ...s, phone: v }))} placeholder="+91 98765 43210" required/>
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
            <div className="space-y-2 rounded-xl border border-white/10 p-3 sm:col-span-2 xl:col-span-3">
              <p className="text-sm font-medium">Assign to employees <span className="text-muted-foreground">({taskForm.employeeIds.length} selected)</span></p>
              <div className="grid max-h-44 gap-2 overflow-y-auto sm:grid-cols-2 xl:grid-cols-3">
                {employees.filter((employee) => employee.status !== "INACTIVE" && !!employee.accountUserId).map((employee) => (
                  <label key={employee.id} className="flex items-center gap-2 rounded-lg border border-white/5 px-3 py-2 text-sm">
                    <input type="checkbox" checked={taskForm.employeeIds.includes(employee.id)} onChange={(event) => setTaskForm((current) => {
                      const employeeIds = event.target.checked
                        ? Array.from(new Set([...current.employeeIds, employee.id]))
                        : current.employeeIds.filter((id) => id !== employee.id);
                      return { ...current, employeeIds, employeeId: employeeIds[0] || "" };
                    })}/>
                    <span>{employee.name} · {employee.department}</span>
                  </label>
                ))}
              </div>
              {!taskForm.employeeIds.length && <p className="text-xs text-amber-300">Select at least one employee before assigning.</p>}
            </div>
            <Field label="Task title" required value={taskForm.title} onChange={(v) => setTaskForm((s) => ({ ...s, title: v }))}/>
            <SelectField label="Priority" value={taskForm.priority} onChange={(v) => setTaskForm((s) => ({ ...s, priority: v }))} options={["LOW","MEDIUM","HIGH","URGENT"].map((v)=>({value:v,label:v}))}/>
            <Field label="Deadline" type="datetime-local" value={taskForm.deadlineAt} onChange={(v) => setTaskForm((s) => ({ ...s, deadlineAt: v }))}/>
            <Field label="Category" value={taskForm.category} onChange={(v) => setTaskForm((s) => ({ ...s, category: v }))}/>
            <Field label="Description" value={taskForm.description} onChange={(v) => setTaskForm((s) => ({ ...s, description: v }))}/>
            <button disabled={busy || taskForm.employeeIds.length === 0} className="w-fit rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">{busy ? "Assigning…" : "Assign task"}</button>
          </form>
        </Panel>
        <Panel title="Company task board" sub="Filterable task lifecycle and deadlines">
          <div className="overflow-x-auto"><table className="w-full min-w-[780px] text-left text-sm"><thead className="text-xs text-muted-foreground"><tr><th className="p-3">Task</th><th className="p-3">Employee</th><th className="p-3">Priority</th><th className="p-3">Deadline</th><th className="p-3">Status</th><th className="p-3">Update</th></tr></thead><tbody>{tasks.map((t)=><tr key={t._id} className="border-t border-white/10"><td className="p-3"><b>{t.title}</b><button onClick={()=>void openTaskActivity(t._id)} className="ml-2 rounded-lg border border-white/10 px-2 py-1 text-xs">{taskActivityId===t._id?"Hide activity":"History & comments"}</button><p className="mt-1 text-xs text-muted-foreground">{t.taskType} · {t.description}</p><div className="mt-2 flex flex-wrap gap-2">{(t.attachments || []).map((attachment)=><span key={attachment._id} className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2 py-1"><button onClick={()=>void downloadTaskAttachment(t._id,attachment)} className="text-xs underline">{attachment.originalFileName}</button><button aria-label={"Delete " + attachment.originalFileName} onClick={()=>void deleteTaskAttachment(t._id,attachment)} className="px-1 text-xs text-red-300">×</button></span>)}<label className="cursor-pointer rounded-lg border border-white/10 px-2 py-1 text-xs">+ Attach file<input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" className="sr-only" onChange={(event)=>{const file=event.target.files?.[0];if(file)void uploadTaskAttachment(t._id,file);event.target.value="";}}/></label></div></td><td className="p-3">{t.assignees?.length ? t.assignees.map((a)=>a.name + " (" + a.status.replaceAll("_"," ") + ")").join(", ") : employees.find((e)=>e.id===t.employeeId)?.name || "Employee record"}</td><td className="p-3">{t.priority}</td><td className="p-3">{dt(t.deadlineAt)}</td><td className="p-3"><Status value={t.status}/></td><td className="p-3"><div className="flex flex-col items-start gap-2"><select value={t.status} onChange={(e)=>void updateTask(t,e.target.value)} className="rounded-lg border border-white/10 bg-background p-2 text-xs">{["ASSIGNED","ACCEPTED","IN_PROGRESS","ON_HOLD","COMPLETED","CANCELLED"].map((v)=><option key={v}>{v}</option>)}</select>{t.taskType==="ASSIGNED"&&!["COMPLETED","CANCELLED"].includes(t.status)&&<button onClick={()=>startReassignTask(t)} className="rounded-lg border border-white/10 px-2 py-1.5 text-xs">Edit assignees</button>}</div></td></tr>)}</tbody></table>{tasks.length===0&&<p className="p-6 text-sm text-muted-foreground">No tasks created yet.</p>}</div>
        </Panel>
        {taskActivityId && <Panel title={"Task history & comments · " + (tasks.find((task) => task._id === taskActivityId)?.title || "Task")} sub="Each action is recorded by Truvi. Comments and history are visible only to the Admin and authorized task assignees.">
          <div className="grid gap-4 lg:grid-cols-2">
            <div><h3 className="mb-2 text-sm font-semibold">Comments</h3><div className="max-h-72 space-y-2 overflow-y-auto">{(taskActivity?.comments||[]).map((comment)=><div key={comment._id} className="rounded-xl border border-white/10 p-3"><p className="whitespace-pre-wrap text-sm">{comment.body}</p><p className="mt-2 text-xs text-muted-foreground">{comment.authorUserId} · {dt(comment.createdAt)}</p></div>)}{taskActivity && taskActivity.comments.length===0&&<p className="text-sm text-muted-foreground">No comments yet.</p>}</div>
              <form onSubmit={addTaskComment} className="mt-3 flex gap-2"><input value={taskCommentDraft} onChange={(e)=>setTaskCommentDraft(e.target.value)} maxLength={3000} required placeholder="Add a task comment…" className="min-w-0 flex-1 rounded-xl border border-white/10 bg-background px-3 py-2 text-sm"/><button className="rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground">Post</button></form>
            </div>
            <div><h3 className="mb-2 text-sm font-semibold">History</h3><div className="max-h-96 space-y-2 overflow-y-auto">{(taskActivity?.history||[]).map((entry)=><div key={entry._id} className="rounded-xl border border-white/10 p-3"><div className="flex flex-wrap items-start justify-between gap-2"><b className="text-sm">{entry.action.replaceAll("_"," ")}</b><span className="text-xs text-muted-foreground">{dt(entry.createdAt)}</span></div><p className="mt-1 text-xs text-muted-foreground">Actor: {entry.actorUserId}</p>{entry.reason&&<p className="mt-1 text-xs">Reason: {entry.reason}</p>}{entry.afterValue&&<pre className="mt-2 whitespace-pre-wrap break-words text-[11px] text-muted-foreground">{JSON.stringify(entry.afterValue,null,2)}</pre>}</div>)}{taskActivity && taskActivity.history.length===0&&<p className="text-sm text-muted-foreground">No history events are available.</p>}</div></div>
          </div>
        </Panel>}
        {reassignTaskId && <Panel title={"Update assignees · " + (tasks.find((task) => task._id === reassignTaskId)?.title || "Task")} sub="Choose one or more active employees with linked login accounts. Completed assignments remain completed for employees who stay assigned.">
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{employees.filter((employee) => employee.accountUserId && employee.status !== "INACTIVE").map((employee) => <label key={employee.id} className="flex items-center gap-2 rounded-lg border border-white/10 p-3 text-sm"><input type="checkbox" checked={reassignEmployeeIds.includes(employee.id)} onChange={(event) => setReassignEmployeeIds((current) => event.target.checked ? Array.from(new Set([...current, employee.id])) : current.filter((id) => id !== employee.id))}/><span>{employee.name} · {employee.department}</span></label>)}</div>
          <div className="mt-4 flex flex-wrap gap-2"><button disabled={busy || !reassignEmployeeIds.length} onClick={()=>void saveTaskAssignees()} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">{busy?"Saving…":"Save assignees"}</button><button onClick={()=>{setReassignTaskId(null);setReassignEmployeeIds([]);}} className="rounded-xl border border-white/10 px-4 py-2.5 text-sm">Cancel</button></div>
        </Panel>}
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

      {tab === "reports" && <div className="space-y-4">
        <Panel title="Employee performance reports" sub="Metrics are calculated from central CRM records, task history, site visits, and explicit attendance records. These counts are not a complete measure of individual performance.">
          <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Field label="From date" type="date" value={perfFrom} onChange={setPerfFrom}/>
            <Field label="To date" type="date" value={perfTo} onChange={setPerfTo}/>
            <SelectField label="Department" value={perfDepartment} onChange={setPerfDepartment} options={[{value:"ALL",label:"All departments"},...Array.from(new Set(employees.map((e)=>e.department))).sort().map((d)=>({value:d,label:d}))]}/>
            <button disabled={busy} onClick={()=>void loadPerformance()} className="self-end rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">{busy?"Loading…":"Apply filters"}</button>
          </div>
          <div className="overflow-x-auto"><table className="w-full min-w-[1050px] text-left text-sm"><thead className="text-xs text-muted-foreground"><tr><th className="p-3">Employee</th><th className="p-3">Tasks completed</th><th className="p-3">Open / overdue</th><th className="p-3">Leads submitted</th><th className="p-3">Leads assigned</th><th className="p-3">Calls logged</th><th className="p-3">Visits scheduled / completed</th><th className="p-3">Present days</th></tr></thead><tbody>{performance.map((m)=><tr key={m.employeeId} className="border-t border-white/10"><td className="p-3"><b>{m.name}</b><p className="mt-1 text-xs text-muted-foreground">{m.employeeCode||"No ID"} · {m.department}</p><p className="text-xs text-muted-foreground">{m.designation}</p></td><td className="p-3">{m.tasksCompleted}</td><td className="p-3">{m.tasksOpen} / {m.tasksOverdue}</td><td className="p-3">{m.leadsSubmitted}</td><td className="p-3">{m.leadsAssigned}</td><td className="p-3">{m.callsLogged}</td><td className="p-3">{m.siteVisitsScheduled} / {m.siteVisitsCompleted}</td><td className="p-3">{m.attendancePresentDays}</td></tr>)}</tbody></table>{performance.length===0&&<p className="p-6 text-sm text-muted-foreground">No metrics are available for these filters.</p>}</div>
        </Panel>
        <p className="text-xs leading-5 text-muted-foreground">“Calls logged” means call outcomes entered by employees, not detected phone calls or call recordings. Missing attendance is not counted as absence. Conversion rate is omitted unless a reliable closed-won data field is verified.</p>
      </div>}

      {tab === "activity" && <Panel title="Employee activity and audit history" sub="Append-only audit entries for employee, task, lead, attendance, site-visit, permission, and salary actions. Passwords and tokens are not shown.">
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <div className="min-w-[240px] flex-1"><SelectField label="Filter by employee" value={auditEmployeeId} onChange={setAuditEmployeeId} options={[{value:"ALL",label:"All employee activity"},...employees.map((e)=>({value:e.id,label:e.name+" · "+(e.employeeCode||e.department)}))]}/></div>
          <button disabled={busy} onClick={()=>void loadAuditLogs()} className="rounded-xl border border-white/10 px-4 py-2.5 text-sm disabled:opacity-50">{busy?"Loading…":"Apply filter"}</button>
          <Link to="/admin/audit-logs" className="rounded-xl border border-white/10 px-4 py-2.5 text-sm">Open all system audit logs</Link>
        </div>
        <div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-sm"><thead className="text-xs text-muted-foreground"><tr><th className="p-3">Timestamp</th><th className="p-3">Action</th><th className="p-3">Actor</th><th className="p-3">Resource</th><th className="p-3">Details</th></tr></thead><tbody>{auditLogs.map((a)=><tr key={a._id} className="border-t border-white/10 align-top"><td className="whitespace-nowrap p-3">{dt(a.createdAt)}</td><td className="p-3"><span className="font-medium">{a.action}</span></td><td className="p-3">{a.actorName||"System"}<p className="mt-1 text-xs text-muted-foreground">{a.actorEmail}</p></td><td className="p-3">{a.resourceType||"—"}<p className="mt-1 max-w-[180px] break-all text-xs text-muted-foreground">{a.resourceId}</p></td><td className="max-w-[300px] p-3"><pre className="whitespace-pre-wrap break-words text-xs text-muted-foreground">{JSON.stringify(a.metadata||{},null,2)}</pre></td></tr>)}</tbody></table>{auditLogs.length===0&&<p className="p-6 text-sm text-muted-foreground">No employee-management audit events match this filter.</p>}</div>
      </Panel>}

      {tab === "leave" && <Panel title="Employee leave requests" sub="Approve or reject pending requests. Approval records ON_LEAVE days in attendance; conflicting check-ins must be resolved first.">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="text-xs text-muted-foreground"><tr><th className="p-3">Employee</th><th className="p-3">Type / dates</th><th className="p-3">Days</th><th className="p-3">Reason</th><th className="p-3">Status / review</th><th className="p-3">Actions</th></tr></thead>
            <tbody>{leaveRequests.map((request)=><tr key={request._id} className="border-t border-white/10 align-top">
              <td className="p-3"><b>{request.employeeName || employees.find((e)=>e.id===request.employeeId)?.name || "Employee"}</b><p className="mt-1 text-xs text-muted-foreground">{request.employeeCode || request.department}</p></td>
              <td className="p-3">{request.leaveType.replaceAll("_"," ")}<p className="mt-1 text-xs text-muted-foreground">{request.startDate} → {request.endDate}</p></td>
              <td className="p-3">{request.totalDays}</td><td className="max-w-[280px] whitespace-pre-wrap p-3">{request.reason}</td>
              <td className="p-3"><Status value={request.status}/>{request.reviewNotes && <p className="mt-1 max-w-[240px] text-xs text-muted-foreground">{request.reviewNotes}</p>}</td>
              <td className="p-3">{request.status === "PENDING" ? <div className="flex flex-wrap gap-2"><button onClick={()=>void reviewLeave(request,"APPROVED")} className="rounded-lg border border-emerald-500/30 px-2.5 py-1.5 text-xs text-emerald-300">Approve</button><button onClick={()=>void reviewLeave(request,"REJECTED")} className="rounded-lg border border-red-500/30 px-2.5 py-1.5 text-xs text-red-300">Reject</button></div> : "—"}</td>
            </tr>)}</tbody>
          </table>
          {leaveRequests.length===0 && <p className="p-6 text-center text-sm text-muted-foreground">No employee leave requests have been submitted.</p>}
        </div>
      </Panel>}

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

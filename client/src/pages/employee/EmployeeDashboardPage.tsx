import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Bell, Building2, Camera, CalendarCheck, CalendarClock, CalendarDays, CheckCircle2, ChevronRight, CircleHelp, CircleDollarSign, Clock3, Flame, Info, LayoutDashboard, ListChecks, MapPin, Megaphone, PhoneCall, RefreshCw, Search, ShieldAlert, Trash2, UserRound, Users, Wallet, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useSocketEvent } from "@/lib/socket";
import { NotificationBell } from "@/components/NotificationBell";
import { useAuthStore } from "@/store/authStore";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type Tab = "home" | "tasks" | "leads" | "telecalling" | "visits" | "attendance" | "leave" | "profile" | "salary" | "notifications";
type Employee = { id: string; accountUserId?: string; employeeCode?: string; name: string; officialEmail: string; phone?: string; department: string; designation?: string; joiningDate?: string; reportingManagerId?: string; recruitmentSource?: string; status: string; permissions?: string[] };
type TaskAttachment = { _id: string; originalFileName: string; mimeType: string; sizeBytes: number; uploadedByUserId: string; createdAt: string };
type TaskHistoryItem = { _id: string; actorUserId: string; action: string; beforeValue?: Record<string, unknown> | null; afterValue?: Record<string, unknown> | null; reason?: string | null; createdAt: string };
type TaskComment = { _id: string; authorUserId: string; body: string; createdAt: string };
type TaskActivity = { history: TaskHistoryItem[]; comments: TaskComment[] };
type TaskAssignee = { employeeId: string; name: string; employeeCode?: string | null; status: string };
type Task = { _id: string; title: string; description?: string; taskType: string; priority: string; status: string; taskStatus?: string; deadlineAt?: string | null; completionNotes?: string | null; assignees?: TaskAssignee[]; attachments?: TaskAttachment[] };
type LeaveRequest = { _id: string; employeeId: string; leaveType: string; startDate: string; endDate: string; totalDays: number; reason: string; status: string; reviewNotes?: string | null; createdAt: string };
type Lead = { _id: string; leadNo?: number; clientName: string; clientPhone: string; clientEmail?: string; projectId: string | { _id: string; name: string }; stage: string; source: string; leadTemperature?: string; nextFollowUpAt?: string | null; siteVisitStatus?: string; budgetRange?: string; createdAt: string };
type Project = { _id: string; name: string; city?: string; location?: string };
type SiteVisit = { _id: string; leadId?: string; projectId: string | { _id: string; name: string }; projectName?: string; clientName?: string; scheduledAt: string; status: string; reportNotes?: string };
type Attendance = { _id: string; attendanceDate: string; status: string; checkInAt?: string | null; checkOutAt?: string | null; workingMinutes?: number | null };
type Salary = { _id: string; monthKey: string; grossSalary: number; allowances: number; deductions: number; netPayable: number; status: string; paymentDate?: string | null; paymentReference?: string | null };
type Notice = { _id: string; title?: string; message: string; isRead: boolean; createdAt: string; type?: string; data?: { href?: string; [key: string]: unknown } };
const money = (n: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);
const fmtDate = (s?: string | null) => s ? new Date(s).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";
const fmtDateTime = (s?: string | null) => s ? new Date(s).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";
const badgeClass = (s: string) => ["COMPLETED","ACTIVE","PRESENT","CONFIRMED","PAID","APPROVED"].includes(s) ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300" : ["OVERDUE","ABSENT","INACTIVE","CANCELLED","LOST","ON_HOLD"].includes(s) ? "border-red-500/20 bg-red-500/10 text-red-300" : "border-amber-500/20 bg-amber-500/10 text-amber-200";
function Badge({ value }: { value: string }) { return <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-medium ${badgeClass(value)}`}>{value.replaceAll("_"," ")}</span>; }
function Kpi({ label, value, note, icon: Icon = LayoutDashboard, tone = "blue" }: { label: string; value: string | number; note?: string; icon?: LucideIcon; tone?: "blue" | "violet" | "cyan" | "amber" | "green" }) { return <div className="truvi-dashboard-kpi"><div className="truvi-dashboard-kpi__top"><p>{label}</p><span className={`truvi-dashboard-kpi__icon is-${tone}`}><Icon size={17} aria-hidden="true"/></span></div><p className="truvi-dashboard-kpi__value">{value}</p>{note && <p className="truvi-dashboard-kpi__note">{note}</p>}</div>; }
function Panel({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) { return <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-4 sm:p-5"><div className="mb-4"><h2 className="font-semibold">{title}</h2>{note && <p className="mt-1 text-xs leading-5 text-muted-foreground">{note}</p>}</div>{children}</section>; }
function Input({ label, value, onChange, type = "text", required = false, placeholder = "" }: { label: string; value: string; onChange: (v: string) => void; type?: string; required?: boolean; placeholder?: string }) { return <label className="block space-y-1.5 text-sm"><span className="text-muted-foreground">{label}</span><input type={type} required={required} value={value} placeholder={placeholder} onChange={(e)=>onChange(e.target.value)} className="w-full rounded-xl border border-white/10 bg-background px-3 py-2.5 outline-none focus:border-primary"/></label>; }
function Select({ label, value, onChange, options, required = false }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; required?: boolean }) { return <label className="block space-y-1.5 text-sm"><span className="text-muted-foreground">{label}</span><select required={required} value={value} onChange={(e)=>onChange(e.target.value)} className="w-full rounded-xl border border-white/10 bg-background px-3 py-2.5 outline-none focus:border-primary">{options.map((o)=><option key={o.value} value={o.value}>{o.label}</option>)}</select></label>; }

const tabItems: { id: Tab; label: string }[] = [
  { id:"home", label:"Overview" }, { id:"tasks", label:"My tasks" }, { id:"leads", label:"My leads" },
  { id:"telecalling", label:"Telecalling" }, { id:"visits", label:"Site visits" }, { id:"attendance", label:"Attendance" },
  { id:"leave", label:"Leave requests" }, { id:"profile", label:"My profile" }, { id:"salary", label:"My salary" }, { id:"notifications", label:"Notifications" },
];
const tabIcons = {
  home: LayoutDashboard, tasks: ListChecks, leads: Users, telecalling: PhoneCall,
  visits: MapPin, attendance: CalendarCheck, leave: CalendarDays, profile: UserRound,
  salary: Wallet, notifications: Bell,
} as const;

const navigationGroups: { label: string; items: Tab[] }[] = [
  { label: "Workspace", items: ["home", "tasks"] },
  { label: "Sales & field", items: ["leads", "telecalling", "visits"] },
  { label: "People & time", items: ["attendance", "leave"] },
  { label: "Account", items: ["profile", "salary", "notifications"] },
];

type QuickSearchItem = { id: string; kind: string; title: string; detail: string; tab: Tab; icon: LucideIcon };

function noticeVisual(type?: string): { Icon: LucideIcon; tone: string } {
  const key = (type ?? "").toLowerCase();
  if (key.includes("security") || key.includes("verification") || key.includes("account_disabled")) return { Icon: ShieldAlert, tone: "text-rose-300 bg-rose-500/10 border-rose-500/20" };
  if (key.includes("salary") || key.includes("payroll") || key.includes("payment") || key.includes("commission")) return { Icon: CircleDollarSign, tone: "text-amber-300 bg-amber-500/10 border-amber-500/20" };
  if (key.includes("leave") || key.includes("attendance") || key.includes("checkin") || key.includes("check_out")) return { Icon: CalendarDays, tone: "text-violet-300 bg-violet-500/10 border-violet-500/20" };
  if (key.includes("site_visit") || key.includes("sitevisit") || key.includes("meeting")) return { Icon: CalendarClock, tone: "text-indigo-300 bg-indigo-500/10 border-indigo-500/20" };
  if (key.includes("task")) return { Icon: ClipboardList, tone: "text-teal-300 bg-teal-500/10 border-teal-500/20" };
  if (key.includes("lead") || key.includes("call") || key.includes("followup") || key.includes("referr")) return { Icon: Users, tone: "text-sky-300 bg-sky-500/10 border-sky-500/20" };
  if (key.includes("project") || key.includes("property")) return { Icon: Building2, tone: "text-emerald-300 bg-emerald-500/10 border-emerald-500/20" };
  if (key.includes("announcement") || key.includes("campaign")) return { Icon: Megaphone, tone: "text-pink-300 bg-pink-500/10 border-pink-500/20" };
  if (key.includes("employee") || key.includes("invite") || key.includes("profile")) return { Icon: UserRound, tone: "text-blue-300 bg-blue-500/10 border-blue-500/20" };
  if (key === "general" || !key) return { Icon: Bell, tone: "text-slate-300 bg-slate-500/10 border-slate-500/20" };
  return { Icon: Info, tone: "text-sky-300 bg-sky-500/10 border-sky-500/20" };
}

export default function EmployeeDashboardPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("home");
  const [searchParams] = useSearchParams();
  const [loadIssues, setLoadIssues] = useState<string[]>([]);
  const notificationIdsRef = useRef(new Set<string>());
  const currentUser = useAuthStore((state) => state.user);
  const setAuthUser = useAuthStore((state) => state.setUser);
  const profilePhotoInputRef = useRef<HTMLInputElement>(null);
  const [profilePhotoBusy, setProfilePhotoBusy] = useState(false);
  const [quickSearch, setQuickSearch] = useState("");
  const [quickSearchOpen, setQuickSearchOpen] = useState(false);
  const [searchTarget, setSearchTarget] = useState<string | null>(null);
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [taskActivityId, setTaskActivityId] = useState<string | null>(null);
  const [taskActivity, setTaskActivity] = useState<TaskActivity | null>(null);
  const [taskCommentDraft, setTaskCommentDraft] = useState("");
  const [leads, setLeads] = useState<Lead[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [visits, setVisits] = useState<SiteVisit[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [salaries, setSalaries] = useState<Salary[]>([]);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);
  const [callCount, setCallCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [taskForm, setTaskForm] = useState({ title:"", description:"", priority:"MEDIUM", deadlineAt:"", estimatedMinutes:"" });
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [leadForm, setLeadForm] = useState({
    projectId:"", clientName:"", clientPhone:"", clientEmail:"", preferredContactMethod:"PHONE",
    preferredLocation:"", preferredPropertyType:"", budgetRange:"", source:"TELECALLER",
    leadTemperature:"WARM", purchaseTimeline:"", siteVisitRequired:false, visitDate:"", visitTime:"",
    siteVisitStatus:"NOT_DISCUSSED", lastContactAt:"", nextFollowUpAt:"", followUpNotes:"",
    additionalRequirements:"", contactConsent:false,
  });
  const [callForm, setCallForm] = useState({ leadId:"", outcome:"CONNECTED", notes:"", nextFollowUpAt:"", leadTemperature:"WARM" });
  const [followupForm, setFollowupForm] = useState({ leadId:"", dueAt:"", channel:"CALL", note:"" });
  const [visitForm, setVisitForm] = useState({ leadId:"", scheduledAt:"", timeSlot:"", notes:"" });
  const [leaveForm, setLeaveForm] = useState({ leaveType:"CASUAL", startDate:new Date(Date.now()+19800000).toISOString().slice(0,10), endDate:new Date(Date.now()+19800000).toISOString().slice(0,10), reason:"" });

  async function load() {
    setLoading(true);
    setLoadIssues([]);
    try {
      const results = await Promise.allSettled([
        api.get("/employees/me/overview"), api.get("/employees/tasks"), api.get("/employees/leads"),
        api.get("/projects"), api.get("/employees/site-visits"), api.get("/employees/attendance"),
        api.get("/employees/salaries"), api.get("/notifications"), api.get("/employees/leave-requests"),
      ]);
      const failures: string[] = [];
      const assign = (index: number, label: string, consume: (value: any) => void) => {
        const result = results[index];
        if (result.status === "fulfilled") {
          consume(result.value.data);
          return;
        }
        const status = result.reason?.response?.status;
        failures.push(status ? `${label} (HTTP ${status})` : label);
      };
      assign(0, "Employee profile", (d) => { setEmployee(d.employee); setCallCount(d.callsLoggedToday ?? 0); });
      assign(1, "Tasks", (d) => setTasks(d.tasks ?? []));
      assign(2, "Leads", (d) => setLeads(d.leads ?? []));
      assign(3, "Approved projects", (d) => setProjects(d.projects ?? []));
      assign(4, "Site visits", (d) => setVisits(d.siteVisits ?? []));
      assign(5, "Attendance", (d) => setAttendance(d.attendance ?? []));
      assign(6, "Salary records", (d) => setSalaries(d.salaries ?? []));
      assign(7, "Notifications", (d) => {
        const list: Notice[] = d.notifications ?? [];
        list.forEach((notice) => notificationIdsRef.current.add(notice._id));
        setNotices((current) => {
          const merged = new Map<string, Notice>([...list, ...current].map((notice) => [notice._id, notice] as const));
          return [...merged.values()].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 200);
        });
      });
      assign(8, "Leave requests", (d) => setLeaveRequests(d.leaveRequests ?? []));
      setLoadIssues(failures);
      if (failures.length === results.length) {
        toast.error("Your employee workspace could not load. Please check your session and try refreshing.");
      } else if (failures.length) {
        toast.warning(`${failures.length} workspace section(s) could not load. Your other sections remain available.`);
      }
    } catch (error: any) {
      toast.error(error?.response?.data?.error || "Unable to load your employee workspace.");
    } finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  useEffect(() => { const requested = searchParams.get("tab"); if (requested && tabItems.some((item) => item.id === requested)) setTab(requested as Tab); }, [searchParams]);
  useEffect(() => {
    if (!searchTarget) return;
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(searchTarget)?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [tab, searchTarget]);

  useSocketEvent<Notice>("notification:new", (notice) => {
    if (!notice?._id || notificationIdsRef.current.has(notice._id)) return;
    notificationIdsRef.current.add(notice._id);
    setNotices((current) => [notice, ...current.filter((item) => item._id !== notice._id)].slice(0, 200));
    // The shared NotificationBell owns the toast, preventing duplicate popups;
    // this listener keeps the employee's Notifications tab and unread badge live.
  });

  const today = (() => { const ps = new Intl.DateTimeFormat("en-CA", { timeZone:"Asia/Kolkata", year:"numeric", month:"2-digit", day:"2-digit" }).formatToParts(new Date()); const val = (k:string) => ps.find((p)=>p.type===k)?.value ?? ""; return `${val("year")}-${val("month")}-${val("day")}`; })();
  const todayAttendance = attendance.find((a)=>a.attendanceDate===today);
  const pendingTasks = useMemo(()=>tasks.filter((t)=>!["COMPLETED","CANCELLED"].includes(t.status)),[tasks]);
  const overdueTasks = useMemo(()=>pendingTasks.filter((t)=>t.deadlineAt && new Date(t.deadlineAt)<new Date()),[pendingTasks]);
  const myHotLeads = leads.filter((l)=>l.leadTemperature==="HOT").length;
  const projectName = (p: Lead["projectId"]) => typeof p === "string" ? projects.find((x)=>x._id===p)?.name ?? "Project" : p.name;
  const salaryTrend = useMemo(() => [...salaries]
    .sort((a, b) => a.monthKey.localeCompare(b.monthKey))
    .slice(-8)
    .map((salary) => ({
      month: salary.monthKey,
      netPayable: Number(salary.netPayable) || 0,
    })), [salaries]);
  const dashboardTodos = useMemo(() => [...pendingTasks].sort((a, b) => {
    if (!a.deadlineAt && !b.deadlineAt) return 0;
    if (!a.deadlineAt) return 1;
    if (!b.deadlineAt) return -1;
    return new Date(a.deadlineAt).getTime() - new Date(b.deadlineAt).getTime();
  }).slice(0, 4), [pendingTasks]);
  const quickSearchResults = useMemo<QuickSearchItem[]>(() => {
    const query = quickSearch.trim().toLowerCase();
    if (!query) return [];
    const taskItems: QuickSearchItem[] = tasks
      .filter((task) => `${task.title} ${task.description ?? ""} ${task.status} ${task.priority}`.toLowerCase().includes(query))
      .slice(0, 4)
      .map((task) => ({ id: `employee-task-${task._id}`, kind: "Task", title: task.title, detail: `${task.status.replaceAll("_", " ")} · ${task.priority}`, tab: "tasks", icon: ListChecks }));
    const leadItems: QuickSearchItem[] = leads
      .filter((lead) => `${lead.clientName} ${lead.clientPhone} ${lead.clientEmail ?? ""} ${lead.stage}`.toLowerCase().includes(query))
      .slice(0, 3)
      .map((lead) => ({ id: `employee-lead-${lead._id}`, kind: "Buyer lead", title: lead.clientName, detail: `${lead.stage.replaceAll("_", " ")} · ${projectName(lead.projectId)}`, tab: "leads", icon: Users }));
    const noticeItems: QuickSearchItem[] = notices
      .filter((notice) => `${notice.title ?? ""} ${notice.message}`.toLowerCase().includes(query))
      .slice(0, 2)
      .map((notice) => ({ id: `employee-notice-${notice._id}`, kind: "Notification", title: notice.title || "Truvi notification", detail: notice.message, tab: "notifications", icon: Bell }));
    return [...taskItems, ...leadItems, ...noticeItems].slice(0, 8);
  }, [quickSearch, tasks, leads, notices, projects]);

  async function createPersonalTask(e: FormEvent) {
    e.preventDefault(); setBusy(true);
    try {
      await api.post("/employees/tasks", { title:taskForm.title, description:taskForm.description, priority:taskForm.priority,
        deadlineAt:taskForm.deadlineAt ? new Date(taskForm.deadlineAt).toISOString() : null,
        estimatedMinutes:taskForm.estimatedMinutes ? Number(taskForm.estimatedMinutes) : undefined });
      toast.success("Personal task created."); setTaskForm({title:"",description:"",priority:"MEDIUM",deadlineAt:"",estimatedMinutes:""}); setShowTaskForm(false); await load();
    } catch (error: any) { toast.error(error?.response?.data?.error || "Could not create your task."); }
    finally { setBusy(false); }
  }
  async function updateTask(task: Task, status: string) {
    try { await api.patch(`/employees/tasks/${task._id}`,{status}); toast.success("Task updated."); await load(); }
    catch (error: any) { toast.error(error?.response?.data?.error || "Could not update task."); }
  }
  async function submitLead(e: FormEvent) {
    e.preventDefault(); setBusy(true);
    try {
      const response = await api.post("/employees/leads", {
        ...leadForm, visitDate:leadForm.visitDate||null, visitTime:leadForm.visitTime||null,
        lastContactAt:leadForm.lastContactAt ? new Date(leadForm.lastContactAt).toISOString() : null,
        nextFollowUpAt:leadForm.nextFollowUpAt ? new Date(leadForm.nextFollowUpAt).toISOString() : null,
      });
      toast.success(response.data?.lead?.leadNo ? `Lead TRV-L-${String(response.data.lead.leadNo).padStart(6,"0")} submitted.` : "Buyer lead submitted to Truvi CRM.");
      setLeadForm((s)=>({...s,projectId:"",clientName:"",clientPhone:"",clientEmail:"",preferredLocation:"",preferredPropertyType:"",budgetRange:"",purchaseTimeline:"",visitDate:"",visitTime:"",lastContactAt:"",nextFollowUpAt:"",followUpNotes:"",additionalRequirements:"",contactConsent:false}));
      await load(); setTab("leads");
    } catch (error: any) {
      const response = error?.response?.data;
      if (response?.warning === "DUPLICATE_DETECTED" && window.confirm(`${response.message}\n\nSubmit this as a separate duplicate record anyway?`)) {
        try {
          await api.post("/employees/leads", { ...leadForm, confirmDuplicate:true,
            visitDate:leadForm.visitDate||null, visitTime:leadForm.visitTime||null,
            lastContactAt:leadForm.lastContactAt ? new Date(leadForm.lastContactAt).toISOString() : null,
            nextFollowUpAt:leadForm.nextFollowUpAt ? new Date(leadForm.nextFollowUpAt).toISOString() : null });
          toast.success("Duplicate submission recorded and flagged for review."); await load(); setTab("leads");
        } catch (e2: any) { toast.error(e2?.response?.data?.error || "Could not submit lead."); }
      } else toast.error(response?.error || response?.message || "Could not submit buyer lead.");
    } finally { setBusy(false); }
  }
  async function logCall(e: FormEvent) {
    e.preventDefault();
    if (!callForm.leadId) { toast.error("Choose a buyer lead."); return; }
    try {
      await api.post(`/employees/leads/${callForm.leadId}/calls`,{ outcome:callForm.outcome, notes:callForm.notes,
        nextFollowUpAt:callForm.nextFollowUpAt ? new Date(callForm.nextFollowUpAt).toISOString() : null,
        leadTemperature:callForm.leadTemperature });
      toast.success("Call outcome recorded in the lead timeline."); setCallForm({leadId:"",outcome:"CONNECTED",notes:"",nextFollowUpAt:"",leadTemperature:"WARM"}); await load();
    } catch (error: any) { toast.error(error?.response?.data?.error || "Could not log call."); }
  }
  async function addFollowUp(e: FormEvent) {
    e.preventDefault();
    try {
      await api.post(`/employees/leads/${followupForm.leadId}/followups`,{ dueAt:new Date(followupForm.dueAt).toISOString(),channel:followupForm.channel,note:followupForm.note });
      toast.success("Follow-up added."); setFollowupForm({leadId:"",dueAt:"",channel:"CALL",note:""}); await load();
    } catch (error: any) { toast.error(error?.response?.data?.error || "Could not schedule follow-up."); }
  }
  async function createVisit(e: FormEvent) {
    e.preventDefault();
    try {
      await api.post("/employees/site-visits",{leadId:visitForm.leadId,scheduledAt:new Date(visitForm.scheduledAt).toISOString(),timeSlot:visitForm.timeSlot,notes:visitForm.notes});
      toast.success("Site visit proposed. Admins have been notified."); setVisitForm({leadId:"",scheduledAt:"",timeSlot:"",notes:""}); await load(); setTab("visits");
    } catch (error: any) { toast.error(error?.response?.data?.error || "Could not schedule site visit."); }
  }
  async function attendanceAction(action: "check-in"|"check-out") {
    try { const res=await api.post(`/employees/attendance/${action}`,{}); toast.success(action==="check-in"?"Checked in successfully.":"Checked out successfully."); setAttendance((old)=>[res.data.attendance,...old.filter((x)=>x._id!==res.data.attendance._id)]); await load(); }
    catch (error: any) { toast.error(error?.response?.data?.error || "Attendance could not be updated."); }
  }
  async function submitLeaveRequest(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post("/employees/leave-requests", leaveForm);
      toast.success("Leave request submitted for Admin review.");
      setLeaveForm({ leaveType:"CASUAL", startDate:today, endDate:today, reason:"" });
      await load();
      setTab("leave");
    } catch (error: any) { toast.error(error?.response?.data?.error || "Could not submit leave request."); }
    finally { setBusy(false); }
  }
  async function cancelLeaveRequest(request: LeaveRequest) {
    if (!window.confirm("Cancel your pending leave request from " + request.startDate + " to " + request.endDate + "?")) return;
    try {
      await api.patch("/employees/leave-requests/" + request._id, { status:"CANCELLED" });
      toast.success("Leave request cancelled.");
      await load();
    } catch (error: any) { toast.error(error?.response?.data?.error || "Could not cancel leave request."); }
  }
  async function uploadTaskAttachment(taskId: string, file: File) {
    const form = new FormData();
    form.append("file", file);
    try {
      await api.post("/employees/tasks/" + taskId + "/attachments", form);
      toast.success("Task attachment uploaded privately.");
      await load();
    } catch (error: any) { toast.error(error?.response?.data?.error || "Could not upload attachment."); }
  }
  async function downloadTaskAttachment(taskId: string, attachment: TaskAttachment) {
    try {
      const response = await api.get("/employees/tasks/" + taskId + "/attachments/" + attachment._id, { responseType:"blob" });
      const url = window.URL.createObjectURL(new Blob([response.data], { type:attachment.mimeType }));
      const link = document.createElement("a");
      link.href = url; link.download = attachment.originalFileName;
      document.body.appendChild(link); link.click(); link.remove(); window.URL.revokeObjectURL(url);
    } catch (error: any) { toast.error(error?.response?.data?.error || "Could not download attachment."); }
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
    } catch (error: any) { toast.error(error?.response?.data?.error || "Could not load task activity."); }
  }
  async function addTaskComment(e: FormEvent) {
    e.preventDefault();
    if (!taskActivityId || !taskCommentDraft.trim()) return;
    try {
      await api.post("/employees/tasks/" + taskActivityId + "/comments", { body: taskCommentDraft.trim() });
      setTaskCommentDraft("");
      const response = await api.get("/employees/tasks/" + taskActivityId + "/history");
      setTaskActivity(response.data);
      toast.success("Comment added to task.");
    } catch (error: any) { toast.error(error?.response?.data?.error || "Could not add task comment."); }
  }
  async function deleteTaskAttachment(taskId: string, attachment: TaskAttachment) {
    if (attachment.uploadedByUserId !== employee?.accountUserId) return;
    if (!window.confirm("Delete your attachment " + attachment.originalFileName + "?")) return;
    try {
      await api.delete("/employees/tasks/" + taskId + "/attachments/" + attachment._id);
      toast.success("Attachment deleted.");
      await load();
    } catch (error: any) { toast.error(error?.response?.data?.error || "Could not delete attachment."); }
  }
  async function markRead(n: Notice) {
    if (n.isRead) return;
    try { await api.patch(`/notifications/${n._id}/read`,{}); setNotices((old)=>old.map((x)=>x._id===n._id?{...x,isRead:true}:x)); }
    catch (error: any) { toast.error(error?.response?.data?.error || "Could not mark notification read."); }
  }
  function openNotice(n: Notice) {
    void markRead(n);
    const href = n.data?.href;
    if (typeof href === "string" && href.startsWith("/") && !href.startsWith("//")) navigate(href);
  }

  async function uploadProfilePhoto(file?: File) {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      toast.error("Choose a JPG, PNG or WEBP image.");
      if (profilePhotoInputRef.current) profilePhotoInputRef.current.value = "";
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Profile photos must be 5 MB or smaller.");
      if (profilePhotoInputRef.current) profilePhotoInputRef.current.value = "";
      return;
    }

    setProfilePhotoBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const uploadResponse = await api.post("/uploads/profile-image", form);
      const uploadedUrl = typeof uploadResponse.data?.url === "string" ? uploadResponse.data.url.trim() : "";
      if (!uploadedUrl) throw new Error("The image uploaded but no profile URL was returned.");

      const response = await api.patch("/auth/profile", { avatarUrl: uploadedUrl });
      if (currentUser) setAuthUser({ ...currentUser, avatarUrl: response.data?.user?.avatarUrl ?? uploadedUrl });
      toast.success("Profile photo updated.");
    } catch (error: any) {
      toast.error(error?.response?.data?.error || error?.message || "Could not update your profile photo.");
    } finally {
      setProfilePhotoBusy(false);
      if (profilePhotoInputRef.current) profilePhotoInputRef.current.value = "";
    }
  }

  async function removeProfilePhoto() {
    if (!currentUser?.avatarUrl || profilePhotoBusy) return;
    setProfilePhotoBusy(true);
    try {
      const response = await api.patch("/auth/profile", { avatarUrl: null });
      if (currentUser) setAuthUser({ ...currentUser, avatarUrl: response.data?.user?.avatarUrl ?? null });
      toast.success("Profile photo removed.");
    } catch (error: any) {
      toast.error(error?.response?.data?.error || "Could not remove your profile photo.");
    } finally {
      setProfilePhotoBusy(false);
    }
  }
  async function updateLeadStage(lead: Lead, stage: string) {
    try { await api.patch(`/employees/leads/${lead._id}`,{stage}); toast.success("Lead stage updated."); await load(); }
    catch (error: any) { toast.error(error?.response?.data?.error || "Could not update lead."); }
  }
  const [showLeadForm, setShowLeadForm] = useState(false);

  return (
    <main className="truvi-erm truvi-erm-employee">
      <div className="truvi-employee-app-shell">
        <aside className="truvi-employee-sidebar" aria-label="Employee navigation">
          <div className="truvi-employee-brand">
            <span className="truvi-employee-brand__mark">T</span>
            <span className="truvi-employee-brand__words">
              <strong>TRUVI VENTURES</strong>
              <small>EMPLOYEE WORKSPACE</small>
            </span>
          </div>

          <nav className="truvi-employee-sidebar-nav" aria-label="Workspace sections">
            {navigationGroups.map((group) => (
              <div className="truvi-employee-nav-group" key={group.label}>
                <p className="truvi-employee-nav-group__label">{group.label}</p>
                <div className="truvi-employee-nav-group__items">
                  {group.items.map((tabId) => {
                    const item = tabItems.find((candidate) => candidate.id === tabId);
                    if (!item) return null;
                    const Icon = tabIcons[item.id];
                    const unreadCount = item.id === "notifications" ? notices.filter((notice) => !notice.isRead).length : 0;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        aria-current={tab === item.id ? "page" : undefined}
                        className={"truvi-employee-nav-button" + (tab === item.id ? " is-active" : "")}
                        onClick={() => { setTab(item.id); setQuickSearchOpen(false); }}
                      >
                        <Icon size={17} aria-hidden="true" />
                        <span>{item.label}</span>
                        {unreadCount > 0 && <span className="truvi-erm-count">{unreadCount > 99 ? "99+" : unreadCount}</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>

          <button type="button" className="truvi-employee-sidebar-profile" onClick={() => setTab("profile")} title="Open my profile">
            <span className="truvi-employee-sidebar-profile__avatar">
              {currentUser?.avatarUrl
                ? <img src={currentUser.avatarUrl} alt="" />
                : <span>{(currentUser?.name || employee?.name || "Employee").trim().split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase()}</span>}
            </span>
            <span className="truvi-employee-sidebar-profile__text">
              <strong>{employee?.name || currentUser?.name || "Employee"}</strong>
              <small>{employee?.designation || employee?.department || "Employee account"}</small>
            </span>
            <ChevronRight size={15} aria-hidden="true" />
          </button>
        </aside>

        <div className="truvi-employee-main">
          <header className="truvi-employee-topbar">
            <div className="truvi-employee-breadcrumb">
              <span>EMPLOYEE WORKSPACE</span>
              <ChevronRight size={14} aria-hidden="true" />
              <strong>{tabItems.find((item) => item.id === tab)?.label || "Overview"}</strong>
            </div>

            <div className="truvi-employee-search">
              <Search size={17} aria-hidden="true" />
              <input
                aria-label="Search tasks, leads and notifications"
                value={quickSearch}
                onFocus={() => setQuickSearchOpen(true)}
                onChange={(event) => { setQuickSearch(event.target.value); setQuickSearchOpen(true); }}
                onKeyDown={(event) => { if (event.key === "Escape") setQuickSearchOpen(false); }}
                placeholder="Search tasks, buyer leads, notifications…"
              />
              {quickSearch && <button type="button" className="truvi-employee-search__clear" aria-label="Clear search" onClick={() => { setQuickSearch(""); setQuickSearchOpen(false); }}><X size={15}/></button>}
              {quickSearchOpen && quickSearch.trim() && (
                <div className="truvi-employee-search-results" role="listbox" aria-label="Search results">
                  {quickSearchResults.map((result) => {
                    const Icon = result.icon;
                    return (
                      <button
                        type="button"
                        role="option"
                        aria-selected="false"
                        key={result.id}
                        onClick={() => { setTab(result.tab); setQuickSearchOpen(false); setQuickSearch(""); setSearchTarget(result.id); }}
                      >
                        <span className="truvi-employee-search-results__icon"><Icon size={16} aria-hidden="true"/></span>
                        <span className="truvi-employee-search-results__copy"><strong>{result.title}</strong><small>{result.kind} · {result.detail}</small></span>
                        <ChevronRight size={15} aria-hidden="true"/>
                      </button>
                    );
                  })}
                  {quickSearchResults.length === 0 && <p className="truvi-employee-search-results__empty">No matching tasks, leads or notifications.</p>}
                </div>
              )}
            </div>

            <div className="truvi-employee-topbar-actions">
              <NotificationBell />
              <button type="button" className="truvi-employee-icon-button" onClick={() => void load()} disabled={loading} aria-label="Refresh workspace" title="Refresh workspace">
                <RefreshCw size={17} aria-hidden="true" className={loading ? "animate-spin" : ""} />
              </button>
              <Link to="/login" className="truvi-employee-icon-button" aria-label="Sign in help" title="Sign in help"><CircleHelp size={17} aria-hidden="true"/></Link>
              <button type="button" className="truvi-employee-topbar-user" onClick={() => setTab("profile")} aria-label="Open my profile">
                <span className="truvi-employee-topbar-user__avatar">
                  {currentUser?.avatarUrl
                    ? <img src={currentUser.avatarUrl} alt="" />
                    : <span>{(currentUser?.name || employee?.name || "Employee").trim().split(/\s+/).map((part) => part[0]).slice(0, 1).join("").toUpperCase()}</span>}
                </span>
                <span>{employee?.name || currentUser?.name || "My profile"}</span>
                <ChevronRight size={14} aria-hidden="true" />
              </button>
            </div>
          </header>

          <div className="truvi-erm-workspace-content">
            <div className="truvi-employee-page-heading">
              <div>
                <p className="truvi-employee-eyebrow">TRUVI VENTURES · PEOPLE & OPERATIONS</p>
                <h1>Hello{employee?.name ? ", " + employee.name.split(" ")[0] : ""}</h1>
                <p>{new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" })} <span>·</span> {employee?.designation || "Employee"} <span>·</span> {employee?.department || "Team"}</p>
              </div>
              <div className="truvi-employee-heading-status"><span className="truvi-employee-status-dot" /> Workspace active</div>
            </div>

            {loading && <div role="status" className="truvi-erm-loading-state">Loading your workspace data…</div>}
            {!loading && loadIssues.length > 0 && <div role="status" className="truvi-erm-load-warning flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4 text-sm"><div><p className="font-semibold">Some workspace sections need attention</p><p className="mt-1">The rest of your workspace remains available. Failed requests: {loadIssues.join(", ")}.</p></div><button type="button" onClick={() => void load()} className="inline-flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-sm"><Info size={15}/> Retry data</button></div>}

            {tab==="home" && <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5"><Kpi label="Pending tasks" value={pendingTasks.length}/><Kpi label="Overdue tasks" value={overdueTasks.length}/><Kpi label="Completed tasks" value={tasks.filter((t)=>t.status==="COMPLETED").length}/><Kpi label="My leads" value={leads.length}/><Kpi label="Hot leads" value={myHotLeads}/></div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Today's attendance" note="Check-in and check-out use server timestamps and the Asia/Kolkata work date.">
              <div className="flex flex-wrap items-center justify-between gap-3"><div><Badge value={todayAttendance?.status || "NOT_MARKED"}/><p className="mt-2 text-xs text-muted-foreground">In: {fmtDateTime(todayAttendance?.checkInAt)} · Out: {fmtDateTime(todayAttendance?.checkOutAt)}</p></div><div className="flex gap-2"><button disabled={!!todayAttendance?.checkInAt || ["ON_LEAVE","HOLIDAY"].includes(todayAttendance?.status || "")} onClick={()=>void attendanceAction("check-in")} className="rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-40">Check in</button><button disabled={!todayAttendance?.checkInAt||!!todayAttendance?.checkOutAt} onClick={()=>void attendanceAction("check-out")} className="rounded-xl border border-white/10 px-3 py-2 text-sm disabled:opacity-40">Check out</button></div></div>
            </Panel>
            <Panel title="Employee profile"><div className="grid grid-cols-2 gap-3 text-sm"><div><p className="text-xs text-muted-foreground">Employee ID</p><p className="mt-1 font-medium">{employee?.employeeCode||"—"}</p></div><div><p className="text-xs text-muted-foreground">Joining date</p><p className="mt-1 font-medium">{fmtDate(employee?.joiningDate)}</p></div><div><p className="text-xs text-muted-foreground">Reporting manager</p><p className="mt-1 break-all font-medium">{employee?.reportingManagerId||"Not assigned"}</p></div><div><p className="text-xs text-muted-foreground">Status</p><p className="mt-1"><Badge value={employee?.status||"UNKNOWN"}/></p></div></div></Panel>
            <Panel title="Upcoming deadlines"><div className="space-y-3">{pendingTasks.filter((t)=>t.deadlineAt).sort((a,b)=>new Date(a.deadlineAt!).getTime()-new Date(b.deadlineAt!).getTime()).slice(0,5).map((t)=><div key={t._id} className="flex items-start justify-between gap-3 border-b border-white/5 pb-3 last:border-0"><div><p className="text-sm font-medium">{t.title}</p><p className="mt-1 text-xs text-muted-foreground">{fmtDateTime(t.deadlineAt)}</p></div><Badge value={t.priority}/></div>)}{pendingTasks.filter((t)=>t.deadlineAt).length===0&&<p className="text-sm text-muted-foreground">No dated open tasks.</p>}</div><button className="mt-3 text-sm underline" onClick={()=>setTab("tasks")}>View all tasks</button></Panel>
            <Panel title="Recent notifications"><div className="space-y-3">{notices.slice(0,4).map((n)=><button key={n._id} onClick={()=>void markRead(n)} className={`block w-full rounded-xl border p-3 text-left ${n.isRead?"border-white/5 bg-white/[0.015]":"border-primary/20 bg-primary/5"}`}><div className="flex items-start justify-between gap-2"><p className="text-sm font-medium">{n.title||"Truvi update"}</p>{!n.isRead&&<span className="mt-1 size-2 rounded-full bg-primary"/>}</div><p className="mt-1 text-xs leading-5 text-muted-foreground">{n.message}</p><p className="mt-1 text-[11px] text-muted-foreground">{fmtDateTime(n.createdAt)}</p></button>)}{notices.length===0&&<p className="text-sm text-muted-foreground">No notifications yet.</p>}</div></Panel>
          </div>
        </>}

        {tab==="tasks" && <div className="space-y-4">
          <div className="flex flex-wrap justify-between gap-3"><div><h2 className="text-lg font-semibold">My tasks</h2><p className="mt-1 text-sm text-muted-foreground">Admin-assigned and personal tasks are labelled separately.</p></div><button onClick={()=>setShowTaskForm((v)=>!v)} className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">{showTaskForm?"Close":"Create personal task"}</button></div>
          {showTaskForm&&<Panel title="Create a personal task"><form onSubmit={createPersonalTask} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"><Input label="Title" required value={taskForm.title} onChange={(v)=>setTaskForm((s)=>({...s,title:v}))}/><Input label="Description" value={taskForm.description} onChange={(v)=>setTaskForm((s)=>({...s,description:v}))}/><Select label="Priority" value={taskForm.priority} onChange={(v)=>setTaskForm((s)=>({...s,priority:v}))} options={["LOW","MEDIUM","HIGH","URGENT"].map((v)=>({value:v,label:v}))}/><Input label="Deadline" type="datetime-local" value={taskForm.deadlineAt} onChange={(v)=>setTaskForm((s)=>({...s,deadlineAt:v}))}/><Input label="Estimated duration (minutes)" type="number" value={taskForm.estimatedMinutes} onChange={(v)=>setTaskForm((s)=>({...s,estimatedMinutes:v}))}/><button disabled={busy} className="self-end rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground">{busy?"Saving…":"Save personal task"}</button></form></Panel>}
          <Panel title={`Task list · ${tasks.length}`}><div className="space-y-3">{tasks.map((t)=><article key={t._id} className="rounded-xl border border-white/10 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{t.title}</h3><button onClick={()=>void openTaskActivity(t._id)} className="rounded-lg border border-white/10 px-2 py-1 text-xs">{taskActivityId===t._id?"Hide activity":"History & comments"}</button><Badge value={t.taskType}/><Badge value={t.priority}/></div>{t.description&&<p className="mt-2 text-sm text-muted-foreground">{t.description}</p>}<p className="mt-2 text-xs text-muted-foreground">Deadline: {fmtDateTime(t.deadlineAt)}</p>{t.completionNotes&&<p className="mt-1 text-xs text-muted-foreground">Completion note: {t.completionNotes}</p>}{t.assignees && t.assignees.length>1 && <p className="mt-1 text-xs text-muted-foreground">Shared with: {t.assignees.filter((a)=>a.employeeId!==employee?.id).map((a)=>a.name).join(", ") || "your team"}</p>}<div className="mt-3 flex flex-wrap gap-2">{(t.attachments||[]).map((a)=><span key={a._id} className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2 py-1"><button onClick={()=>void downloadTaskAttachment(t._id,a)} className="text-xs underline">{a.originalFileName}</button>{a.uploadedByUserId===employee?.accountUserId&&<button aria-label={"Delete "+a.originalFileName} onClick={()=>void deleteTaskAttachment(t._id,a)} className="px-1 text-xs text-red-300">×</button>}</span>)}<label className="cursor-pointer rounded-lg border border-white/10 px-2 py-1 text-xs">+ Attach file<input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" className="sr-only" onChange={(event)=>{const file=event.target.files?.[0];if(file)void uploadTaskAttachment(t._id,file);event.target.value="";}}/></label></div></div><Badge value={t.status}/></div><div className="mt-3 flex flex-wrap gap-2">{t.status!=="COMPLETED"&&t.status!=="CANCELLED"&&<><button onClick={()=>void updateTask(t,"IN_PROGRESS")} className="rounded-lg border border-white/10 px-3 py-1.5 text-xs">Start / in progress</button><button onClick={()=>void updateTask(t,"ON_HOLD")} className="rounded-lg border border-white/10 px-3 py-1.5 text-xs">On hold</button><button onClick={()=>void updateTask(t,"COMPLETED")} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">Complete</button></>}</div></article>)}{tasks.length===0&&<p className="py-8 text-center text-sm text-muted-foreground">You have no tasks assigned yet.</p>}</div></Panel>
        </div>}

        {taskActivityId && <Panel title={"Task history & comments · " + (tasks.find((task) => task._id === taskActivityId)?.title || "Task")} note="Activity is available only for tasks assigned to you or created in your own workspace.">
          <div className="grid gap-4 lg:grid-cols-2">
            <div><h3 className="mb-2 text-sm font-semibold">Comments</h3><div className="max-h-72 space-y-2 overflow-y-auto">{(taskActivity?.comments||[]).map((comment)=><div key={comment._id} className="rounded-xl border border-white/10 p-3"><p className="whitespace-pre-wrap text-sm">{comment.body}</p><p className="mt-2 text-xs text-muted-foreground">{comment.authorUserId} · {fmtDateTime(comment.createdAt)}</p></div>)}{taskActivity && taskActivity.comments.length===0&&<p className="text-sm text-muted-foreground">No comments yet.</p>}</div>
              <form onSubmit={addTaskComment} className="mt-3 flex gap-2"><input value={taskCommentDraft} onChange={(e)=>setTaskCommentDraft(e.target.value)} maxLength={3000} required placeholder="Add a task comment…" className="min-w-0 flex-1 rounded-xl border border-white/10 bg-background px-3 py-2 text-sm"/><button className="rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground">Post</button></form>
            </div>
            <div><h3 className="mb-2 text-sm font-semibold">History</h3><div className="max-h-96 space-y-2 overflow-y-auto">{(taskActivity?.history||[]).map((entry)=><div key={entry._id} className="rounded-xl border border-white/10 p-3"><div className="flex flex-wrap items-start justify-between gap-2"><b className="text-sm">{entry.action.replaceAll("_"," ")}</b><span className="text-xs text-muted-foreground">{fmtDateTime(entry.createdAt)}</span></div>{entry.reason&&<p className="mt-1 text-xs">Reason: {entry.reason}</p>}{entry.afterValue&&<pre className="mt-2 whitespace-pre-wrap break-words text-[11px] text-muted-foreground">{JSON.stringify(entry.afterValue,null,2)}</pre>}</div>)}{taskActivity && taskActivity.history.length===0&&<p className="text-sm text-muted-foreground">No history events are available.</p>}</div></div>
          </div>
        </Panel>}

        {tab==="leads" && <div className="space-y-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-semibold">My buyer leads</h2><p className="mt-1 text-sm text-muted-foreground">Submitted leads are saved to Truvi's central CRM and are visible to authorised Admins.</p></div><button onClick={()=>setShowLeadForm((v)=>!v)} className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">{showLeadForm?"Close form":"Submit buyer lead"}</button></div>
          {showLeadForm&&<Panel title="Buyer lead submission" note="Only submit buyer contact data after the buyer has consented to its use by Truvi. Potential duplicates are flagged for review."><form onSubmit={submitLead} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <Select label="Interested project" required value={leadForm.projectId} onChange={(v)=>setLeadForm((s)=>({...s,projectId:v}))} options={[{value:"",label:"Choose a project"},...projects.map((p)=>({value:p._id,label:`${p.name}${p.city?` · ${p.city}`:""}`}))]}/>
            <Input label="Buyer full name" required value={leadForm.clientName} onChange={(v)=>setLeadForm((s)=>({...s,clientName:v}))}/>
            <Input label="Buyer phone" required value={leadForm.clientPhone} onChange={(v)=>setLeadForm((s)=>({...s,clientPhone:v}))} placeholder="10-digit Indian mobile"/>
            <Input label="Buyer email (optional)" type="email" value={leadForm.clientEmail} onChange={(v)=>setLeadForm((s)=>({...s,clientEmail:v}))}/>
            <Select label="Preferred contact method" value={leadForm.preferredContactMethod} onChange={(v)=>setLeadForm((s)=>({...s,preferredContactMethod:v}))} options={["PHONE","EMAIL","WHATSAPP","OTHER"].map((v)=>({value:v,label:v}))}/>
            <Input label="Preferred location" value={leadForm.preferredLocation} onChange={(v)=>setLeadForm((s)=>({...s,preferredLocation:v}))}/>
            <Input label="Preferred property type" value={leadForm.preferredPropertyType} onChange={(v)=>setLeadForm((s)=>({...s,preferredPropertyType:v}))}/>
            <Input label="Budget range" value={leadForm.budgetRange} onChange={(v)=>setLeadForm((s)=>({...s,budgetRange:v}))} placeholder="e.g. ₹40–60 lakh"/>
            <Select label="Lead source" value={leadForm.source} onChange={(v)=>setLeadForm((s)=>({...s,source:v}))} options={["TELECALLER","DIRECT_ENQUIRY","WHATSAPP","INSTAGRAM","FACEBOOK","ORGANIC_WEBSITE","PAID_ADVERTISEMENT","CUSTOMER_REFERRAL","CHANNEL_PARTNER","AMBASSADOR_REFERRAL","OTHER"].map((v)=>({value:v,label:v.replaceAll("_"," ")}))}/>
            <Select label="Lead temperature" value={leadForm.leadTemperature} onChange={(v)=>setLeadForm((s)=>({...s,leadTemperature:v}))} options={["HOT","WARM","COLD"].map((v)=>({value:v,label:v}))}/>
            <Input label="Purchase timeline" value={leadForm.purchaseTimeline} onChange={(v)=>setLeadForm((s)=>({...s,purchaseTimeline:v}))}/>
            <Select label="Site visit status" value={leadForm.siteVisitStatus} onChange={(v)=>setLeadForm((s)=>({...s,siteVisitStatus:v,siteVisitRequired:["INTERESTED","PROPOSED","CONFIRMED"].includes(v)}))} options={["NOT_DISCUSSED","INTERESTED","PROPOSED","CONFIRMED","COMPLETED","RESCHEDULED","CANCELLED"].map((v)=>({value:v,label:v.replaceAll("_"," ")}))}/>
            <Input label="Proposed visit date" type="date" value={leadForm.visitDate} onChange={(v)=>setLeadForm((s)=>({...s,visitDate:v,siteVisitRequired:!!v||s.siteVisitRequired}))}/>
            <Input label="Proposed visit time" type="time" value={leadForm.visitTime} onChange={(v)=>setLeadForm((s)=>({...s,visitTime:v}))}/>
            <Input label="Last contact date/time" type="datetime-local" value={leadForm.lastContactAt} onChange={(v)=>setLeadForm((s)=>({...s,lastContactAt:v}))}/>
            <Input label="Next follow-up date/time" type="datetime-local" value={leadForm.nextFollowUpAt} onChange={(v)=>setLeadForm((s)=>({...s,nextFollowUpAt:v}))}/>
            <Input label="Follow-up notes" value={leadForm.followUpNotes} onChange={(v)=>setLeadForm((s)=>({...s,followUpNotes:v}))}/>
            <Input label="Additional requirements" value={leadForm.additionalRequirements} onChange={(v)=>setLeadForm((s)=>({...s,additionalRequirements:v}))}/>
            <label className="flex items-start gap-3 rounded-xl border border-white/10 p-3 text-sm sm:col-span-2 xl:col-span-3"><input className="mt-1" required type="checkbox" checked={leadForm.contactConsent} onChange={(e)=>setLeadForm((s)=>({...s,contactConsent:e.target.checked}))}/><span>I confirm the buyer has consented to share their contact information with Truvi for property enquiry and follow-up.</span></label>
            <button disabled={busy} className="w-fit rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">{busy?"Submitting…":"Submit to central CRM"}</button>
          </form></Panel>}
          <Panel title="Lead history"><div className="space-y-3">{leads.map((l)=><article key={l._id} className="rounded-xl border border-white/10 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold">{l.clientName}</h3><p className="mt-1 text-xs text-muted-foreground">{l.clientPhone} · {projectName(l.projectId)} · {l.source}</p><p className="mt-1 text-xs text-muted-foreground">TRV-L-{String(l.leadNo||"").padStart(6,"0")} · Created {fmtDate(l.createdAt)}</p></div><div className="flex flex-wrap gap-2"><Badge value={l.stage}/><Badge value={l.leadTemperature||"UNRATED"}/></div></div><div className="mt-3 flex flex-wrap items-center gap-2"><label className="text-xs text-muted-foreground">Update stage</label><select aria-label={`Stage for ${l.clientName}`} value={l.stage} onChange={(e)=>void updateLeadStage(l,e.target.value)} className="rounded-lg border border-white/10 bg-background px-2 py-1.5 text-xs">{["GENERATED","CONTACTED","INTERESTED","SITE_VISIT","NEGOTIATION","LOST"].map((v)=><option key={v}>{v}</option>)}</select><button onClick={()=>{setCallForm((s)=>({...s,leadId:l._id}));setTab("telecalling");}} className="rounded-lg border border-white/10 px-3 py-1.5 text-xs">Log a call</button><button onClick={()=>{setVisitForm((s)=>({...s,leadId:l._id}));setTab("visits");}} className="rounded-lg border border-white/10 px-3 py-1.5 text-xs">Propose visit</button></div><p className="mt-2 text-xs text-muted-foreground">Next follow-up: {fmtDateTime(l.nextFollowUpAt)}</p></article>)}{leads.length===0&&<p className="py-8 text-center text-sm text-muted-foreground">No submitted or assigned leads yet.</p>}</div></Panel>
        </div>}

        {tab==="telecalling" && <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><Kpi label="Leads I can access" value={leads.length}/><Kpi label="Hot leads" value={myHotLeads}/><Kpi label="Follow-ups due" value={leads.filter((l)=>l.nextFollowUpAt&&new Date(l.nextFollowUpAt)<new Date()).length}/><Kpi label="Calls logged today" value={callCount} note="Attempts recorded in the lead timeline"/></div>
          <Panel title="Record a call" note="This records the employee-submitted outcome in the existing lead activity timeline; it does not place or record a phone call."><form onSubmit={logCall} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <Select label="Buyer lead" required value={callForm.leadId} onChange={(v)=>setCallForm((s)=>({...s,leadId:v}))} options={[{value:"",label:"Choose buyer"},...leads.map((l)=>({value:l._id,label:`${l.clientName} · ${l.clientPhone}`}))]}/>
            <Select label="Call outcome" value={callForm.outcome} onChange={(v)=>setCallForm((s)=>({...s,outcome:v}))} options={["CONNECTED","NO_ANSWER","BUSY","SWITCHED_OFF","CALL_BACK_REQUESTED","INTERESTED","NOT_INTERESTED","FOLLOW_UP_REQUIRED"].map((v)=>({value:v,label:v.replaceAll("_"," ")}))}/>
            <Select label="Lead temperature" value={callForm.leadTemperature} onChange={(v)=>setCallForm((s)=>({...s,leadTemperature:v}))} options={["HOT","WARM","COLD"].map((v)=>({value:v,label:v}))}/>
            <Input label="Call notes" value={callForm.notes} onChange={(v)=>setCallForm((s)=>({...s,notes:v}))}/>
            <Input label="Next follow-up" type="datetime-local" value={callForm.nextFollowUpAt} onChange={(v)=>setCallForm((s)=>({...s,nextFollowUpAt:v}))}/>
            <button className="self-end rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground">Save call activity</button>
          </form></Panel>
          <Panel title="Schedule a follow-up"><form onSubmit={addFollowUp} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Select label="Buyer lead" required value={followupForm.leadId} onChange={(v)=>setFollowupForm((s)=>({...s,leadId:v}))} options={[{value:"",label:"Choose buyer"},...leads.map((l)=>({value:l._id,label:`${l.clientName} · ${l.clientPhone}`}))]}/><Input label="Due date/time" required type="datetime-local" value={followupForm.dueAt} onChange={(v)=>setFollowupForm((s)=>({...s,dueAt:v}))}/><Select label="Channel" value={followupForm.channel} onChange={(v)=>setFollowupForm((s)=>({...s,channel:v}))} options={["CALL","WHATSAPP","EMAIL","MEETING"].map((v)=>({value:v,label:v}))}/><Input label="Notes" value={followupForm.note} onChange={(v)=>setFollowupForm((s)=>({...s,note:v}))}/><button className="w-fit rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground">Schedule follow-up</button></form></Panel>
        </div>}

        {tab==="visits" && <div className="space-y-4">
          <Panel title="Propose a site visit" note="Choose a lead assigned to you or submitted by you. Admins can confirm, reschedule or complete visits."><form onSubmit={createVisit} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Select label="Buyer lead" required value={visitForm.leadId} onChange={(v)=>setVisitForm((s)=>({...s,leadId:v}))} options={[{value:"",label:"Choose buyer"},...leads.map((l)=>({value:l._id,label:`${l.clientName} · ${projectName(l.projectId)}`}))]}/><Input label="Date and time" required type="datetime-local" value={visitForm.scheduledAt} onChange={(v)=>setVisitForm((s)=>({...s,scheduledAt:v}))}/><Input label="Time slot / preference" value={visitForm.timeSlot} onChange={(v)=>setVisitForm((s)=>({...s,timeSlot:v}))}/><Input label="Visit notes" value={visitForm.notes} onChange={(v)=>setVisitForm((s)=>({...s,notes:v}))}/><button className="w-fit rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground">Propose visit</button></form></Panel>
          <Panel title="My upcoming and past visits"><div className="overflow-x-auto"><table className="w-full min-w-[650px] text-left text-sm"><thead className="text-xs text-muted-foreground"><tr><th className="p-3">Buyer</th><th className="p-3">Project</th><th className="p-3">Scheduled</th><th className="p-3">Status</th><th className="p-3">Update</th></tr></thead><tbody>{visits.map((v)=><tr key={v._id} className="border-t border-white/10"><td className="p-3">{v.clientName||"Buyer"}</td><td className="p-3">{v.projectName||projectName(v.projectId)}</td><td className="p-3">{fmtDateTime(v.scheduledAt)}</td><td className="p-3"><Badge value={v.status}/></td><td className="p-3"><select value={v.status} onChange={async(e)=>{try{await api.patch(`/employees/site-visits/${v._id}`,{status:e.target.value});toast.success("Visit updated.");await load();}catch(err:any){toast.error(err?.response?.data?.error||"Update failed.");}}} className="rounded-lg border border-white/10 bg-background p-2 text-xs">{["SCHEDULED","CONFIRMED","COMPLETED","CANCELLED","NO_SHOW"].map((s)=><option key={s}>{s}</option>)}</select></td></tr>)}</tbody></table>{visits.length===0&&<p className="p-6 text-sm text-muted-foreground">No site visits scheduled.</p>}</div></Panel>
        </div>}

        {tab==="attendance" && <div className="space-y-4">
          <Panel title="Daily attendance" note="Missing activity is not automatically treated as absence. Your check-in date is calculated in Asia/Kolkata.">
            <div className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-sm text-muted-foreground">Today · {today}</p><div className="mt-2"><Badge value={todayAttendance?.status||"NOT_MARKED"}/></div><p className="mt-2 text-xs text-muted-foreground">Check-in: {fmtDateTime(todayAttendance?.checkInAt)} · Check-out: {fmtDateTime(todayAttendance?.checkOutAt)}</p>{todayAttendance?.workingMinutes!=null&&<p className="mt-1 text-xs text-muted-foreground">Recorded duration: {Math.floor(todayAttendance.workingMinutes/60)}h {todayAttendance.workingMinutes%60}m</p>}</div><div className="flex gap-2"><button disabled={!!todayAttendance?.checkInAt} onClick={()=>void attendanceAction("check-in")} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-40">Check in</button><button disabled={!todayAttendance?.checkInAt||!!todayAttendance?.checkOutAt} onClick={()=>void attendanceAction("check-out")} className="rounded-xl border border-white/10 px-4 py-2.5 text-sm disabled:opacity-40">Check out</button></div></div>
          </Panel>
          <Panel title="Attendance history"><div className="overflow-x-auto"><table className="w-full min-w-[600px] text-left text-sm"><thead className="text-xs text-muted-foreground"><tr><th className="p-3">Date</th><th className="p-3">Status</th><th className="p-3">Check in</th><th className="p-3">Check out</th><th className="p-3">Duration</th></tr></thead><tbody>{attendance.map((a)=><tr key={a._id} className="border-t border-white/10"><td className="p-3">{a.attendanceDate}</td><td className="p-3"><Badge value={a.status}/></td><td className="p-3">{fmtDateTime(a.checkInAt)}</td><td className="p-3">{fmtDateTime(a.checkOutAt)}</td><td className="p-3">{a.workingMinutes==null?"—":`${Math.floor(a.workingMinutes/60)}h ${a.workingMinutes%60}m`}</td></tr>)}</tbody></table>{attendance.length===0&&<p className="p-6 text-sm text-muted-foreground">No attendance history yet.</p>}</div></Panel>
        </div>}

        {tab==="leave" && <div className="space-y-4">
          <Panel title="Request time off" note="Requests are reviewed by Admin. Once approved, eligible dates are reflected in the attendance history.">
            <form onSubmit={submitLeaveRequest} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Select label="Leave type" value={leaveForm.leaveType} onChange={(v)=>setLeaveForm((current)=>({...current,leaveType:v}))} options={["ANNUAL","SICK","CASUAL","UNPAID","OTHER"].map((v)=>({value:v,label:v.replaceAll("_"," ")}))}/>
              <Input label="Start date" type="date" required value={leaveForm.startDate} onChange={(v)=>setLeaveForm((current)=>({...current,startDate:v,endDate:current.endDate<v?v:current.endDate}))}/>
              <Input label="End date" type="date" required value={leaveForm.endDate} onChange={(v)=>setLeaveForm((current)=>({...current,endDate:v}))}/>
              <label className="block space-y-1.5 text-sm sm:col-span-2 xl:col-span-4"><span className="text-muted-foreground">Reason for leave</span><textarea required minLength={5} maxLength={2000} rows={3} value={leaveForm.reason} onChange={(e)=>setLeaveForm((current)=>({...current,reason:e.target.value}))} className="w-full rounded-xl border border-white/10 bg-background px-3 py-2.5 outline-none focus:border-primary" placeholder="Please include enough detail for your manager to review"/></label>
              <button disabled={busy} className="w-fit rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">{busy?"Submitting…":"Submit leave request"}</button>
            </form>
          </Panel>
          <Panel title="My leave history" note="Pending requests can be cancelled. Approved or rejected requests are retained in your history.">
            <div className="space-y-3">{leaveRequests.map((request)=><article key={request._id} className="rounded-xl border border-white/10 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold">{request.leaveType.replaceAll("_"," ")} · {request.totalDays} day(s)</p><p className="mt-1 text-sm text-muted-foreground">{request.startDate} → {request.endDate}</p><p className="mt-2 whitespace-pre-wrap text-sm">{request.reason}</p>{request.reviewNotes&&<p className="mt-2 text-xs text-muted-foreground">Review note: {request.reviewNotes}</p>}<p className="mt-2 text-xs text-muted-foreground">Submitted {fmtDateTime(request.createdAt)}</p></div><div className="flex items-center gap-2"><Badge value={request.status}/>{request.status==="PENDING"&&<button onClick={()=>void cancelLeaveRequest(request)} className="rounded-lg border border-white/10 px-2.5 py-1.5 text-xs">Cancel</button>}</div></div>
            </article>)}{leaveRequests.length===0&&<p className="py-8 text-center text-sm text-muted-foreground">No leave requests yet.</p>}</div>
          </Panel>
        </div>}

        {tab==="profile" && <Panel title="My employee profile" note="Sensitive employment and permission fields can only be updated by an authorised administrator.">
          <section className="truvi-erm-profile-photo">
            <div className="truvi-erm-profile-photo__avatar">
              {currentUser?.avatarUrl
                ? <img src={currentUser.avatarUrl} alt="Your profile" />
                : <span>{(currentUser?.name || employee?.name || "Employee").trim().split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase()}</span>}
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold">Profile photo</h3>
              <p className="mt-1 text-sm text-muted-foreground">Add a clear photo so your team can recognise you across Truvi.</p>
              <p className="mt-1 text-xs text-muted-foreground">JPG, PNG or WEBP · maximum 5 MB</p>
              <div className="truvi-erm-profile-photo__actions">
                <button type="button" onClick={() => profilePhotoInputRef.current?.click()} disabled={profilePhotoBusy}>
                  <Camera size={15} aria-hidden="true"/>{profilePhotoBusy ? "Saving photo…" : currentUser?.avatarUrl ? "Change photo" : "Upload photo"}
                </button>
                {currentUser?.avatarUrl && <button type="button" onClick={() => void removeProfilePhoto()} disabled={profilePhotoBusy}><Trash2 size={15} aria-hidden="true"/>Remove photo</button>}
              </div>
              <input ref={profilePhotoInputRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(event) => void uploadProfilePhoto(event.target.files?.[0])}/>
            </div>
          </section>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{[
            ["Full name",employee?.name],["Employee ID",employee?.employeeCode],["Official email",employee?.officialEmail],["Phone",employee?.phone],["Department",employee?.department],["Designation",employee?.designation],["Joining date",fmtDate(employee?.joiningDate)],["Recruitment source",employee?.recruitmentSource],["Reporting manager",employee?.reportingManagerId||"Not assigned"],["Employment status",employee?.status],
          ].map(([label,value])=><div key={label} className="rounded-xl border border-white/10 p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 break-words text-sm font-medium">{value||"—"}</p></div>)}</div>
          <div className="mt-4 rounded-xl border border-white/10 p-4"><p className="text-xs text-muted-foreground">My assigned permissions</p><div className="mt-2 flex flex-wrap gap-2">{(employee?.permissions||[]).map((p)=><span key={p} className="rounded-lg border border-white/10 px-2 py-1 text-xs">{p}</span>)}</div></div>
        </Panel>}

        {tab==="salary" && <Panel title="My salary records" note="You can only see salary records linked to your own employee profile.">
          <div className="overflow-x-auto"><table className="w-full min-w-[650px] text-left text-sm"><thead className="text-xs text-muted-foreground"><tr><th className="p-3">Payroll month</th><th className="p-3">Gross</th><th className="p-3">Allowances</th><th className="p-3">Deductions</th><th className="p-3">Net payable</th><th className="p-3">Status</th><th className="p-3">Payment date / reference</th></tr></thead><tbody>{salaries.map((s)=><tr key={s._id} className="border-t border-white/10"><td className="p-3">{s.monthKey}</td><td className="p-3">{money(s.grossSalary)}</td><td className="p-3">{money(s.allowances)}</td><td className="p-3">{money(s.deductions)}</td><td className="p-3 font-semibold">{money(s.netPayable)}</td><td className="p-3"><Badge value={s.status}/></td><td className="p-3">{s.status==="PAID"?`${fmtDate(s.paymentDate)} · ${s.paymentReference||"—"}`:"—"}</td></tr>)}</tbody></table>{salaries.length===0&&<p className="p-6 text-sm text-muted-foreground">No salary record is available for your account. Contact Admin if you believe this is an error.</p>}</div>
        </Panel>}

        {tab==="notifications" && <Panel title="Notifications" note="Personal updates for tasks, buyer leads, attendance, leave, site visits and payroll. Select an item to open its workspace and mark it read."><div className="space-y-2">{notices.map((n)=>{const {Icon,tone}=noticeVisual(n.type); return <button key={n._id} onClick={()=>openNotice(n)} className={`truvi-erm-notification flex w-full items-start gap-3 rounded-xl border p-4 text-left transition ${n.isRead?"is-read border-white/5":"is-unread border-primary/25 bg-primary/5"}`}><span className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${tone}`}><Icon size={19} aria-hidden="true"/></span><span className="min-w-0 flex-1"><span className="flex flex-wrap items-start justify-between gap-2"><span className="font-semibold">{n.title||"Truvi notification"}</span><Badge value={n.isRead?"READ":"UNREAD"}/></span><span className="mt-1 block text-sm text-muted-foreground">{n.message}</span><span className="mt-2 block text-xs text-muted-foreground">{fmtDateTime(n.createdAt)}</span></span>{!n.isRead&&<span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-sky-400" aria-label="Unread"/>}</button>;})}{notices.length===0&&<div className="truvi-erm-empty py-10 text-center"><Bell className="mx-auto mb-3 h-8 w-8 text-muted-foreground" aria-hidden="true"/><p className="font-semibold">You’re all caught up</p><p className="mt-1 text-sm text-muted-foreground">New Truvi notifications will appear here.</p></div>}</div></Panel>}
          </div>
        </div>
      </div>
    </main>
  );
}
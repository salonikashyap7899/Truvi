import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { toast } from "sonner";

type Tab = "home" | "tasks" | "leads" | "telecalling" | "visits" | "attendance" | "profile" | "salary" | "notifications";
type Employee = { id: string; accountUserId?: string; employeeCode?: string; name: string; officialEmail: string; phone?: string; department: string; designation?: string; joiningDate?: string; reportingManagerId?: string; recruitmentSource?: string; status: string; permissions?: string[] };
type Task = { _id: string; title: string; description?: string; taskType: string; priority: string; status: string; deadlineAt?: string | null; completionNotes?: string | null };
type Lead = { _id: string; leadNo?: number; clientName: string; clientPhone: string; clientEmail?: string; projectId: string | { _id: string; name: string }; stage: string; source: string; leadTemperature?: string; nextFollowUpAt?: string | null; siteVisitStatus?: string; budgetRange?: string; createdAt: string };
type Project = { _id: string; name: string; city?: string; location?: string };
type SiteVisit = { _id: string; leadId?: string; projectId: string | { _id: string; name: string }; projectName?: string; clientName?: string; scheduledAt: string; status: string; reportNotes?: string };
type Attendance = { _id: string; attendanceDate: string; status: string; checkInAt?: string | null; checkOutAt?: string | null; workingMinutes?: number | null };
type Salary = { _id: string; monthKey: string; grossSalary: number; allowances: number; deductions: number; netPayable: number; status: string; paymentDate?: string | null; paymentReference?: string | null };
type Notice = { _id: string; title?: string; message: string; isRead: boolean; createdAt: string };
const money = (n: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);
const fmtDate = (s?: string | null) => s ? new Date(s).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";
const fmtDateTime = (s?: string | null) => s ? new Date(s).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";
const badgeClass = (s: string) => ["COMPLETED","ACTIVE","PRESENT","CONFIRMED","PAID","APPROVED"].includes(s) ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300" : ["OVERDUE","ABSENT","INACTIVE","CANCELLED","LOST","ON_HOLD"].includes(s) ? "border-red-500/20 bg-red-500/10 text-red-300" : "border-amber-500/20 bg-amber-500/10 text-amber-200";
function Badge({ value }: { value: string }) { return <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-medium ${badgeClass(value)}`}>{value.replaceAll("_"," ")}</span>; }
function Kpi({ label, value, note }: { label: string; value: string | number; note?: string }) { return <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-semibold">{value}</p>{note && <p className="mt-1 text-xs text-muted-foreground">{note}</p>}</div>; }
function Panel({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) { return <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-4 sm:p-5"><div className="mb-4"><h2 className="font-semibold">{title}</h2>{note && <p className="mt-1 text-xs leading-5 text-muted-foreground">{note}</p>}</div>{children}</section>; }
function Input({ label, value, onChange, type = "text", required = false, placeholder = "" }: { label: string; value: string; onChange: (v: string) => void; type?: string; required?: boolean; placeholder?: string }) { return <label className="block space-y-1.5 text-sm"><span className="text-muted-foreground">{label}</span><input type={type} required={required} value={value} placeholder={placeholder} onChange={(e)=>onChange(e.target.value)} className="w-full rounded-xl border border-white/10 bg-background px-3 py-2.5 outline-none focus:border-primary"/></label>; }
function Select({ label, value, onChange, options, required = false }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; required?: boolean }) { return <label className="block space-y-1.5 text-sm"><span className="text-muted-foreground">{label}</span><select required={required} value={value} onChange={(e)=>onChange(e.target.value)} className="w-full rounded-xl border border-white/10 bg-background px-3 py-2.5 outline-none focus:border-primary">{options.map((o)=><option key={o.value} value={o.value}>{o.label}</option>)}</select></label>; }

const tabItems: { id: Tab; label: string }[] = [
  { id:"home", label:"Overview" }, { id:"tasks", label:"My tasks" }, { id:"leads", label:"My leads" },
  { id:"telecalling", label:"Telecalling" }, { id:"visits", label:"Site visits" }, { id:"attendance", label:"Attendance" },
  { id:"profile", label:"My profile" }, { id:"salary", label:"My salary" }, { id:"notifications", label:"Notifications" },
];

export default function EmployeeDashboardPage() {
  const [tab, setTab] = useState<Tab>("home");
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [visits, setVisits] = useState<SiteVisit[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [salaries, setSalaries] = useState<Salary[]>([]);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);
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

  async function load() {
    setLoading(true);
    try {
      const results = await Promise.allSettled([
        api.get("/employees/me"), api.get("/employees/tasks"), api.get("/employees/leads"),
        api.get("/projects"), api.get("/employees/site-visits"), api.get("/employees/attendance"),
        api.get("/employees/salaries"), api.get("/notifications"),
      ]);
      const assign = <T,>(index: number, fn: (value: any) => void) => { const r = results[index]; if (r.status === "fulfilled") fn(r.value.data as T); };
      assign(0,(d)=>setEmployee(d.employee));
      assign(1,(d)=>setTasks(d.tasks ?? []));
      assign(2,(d)=>setLeads(d.leads ?? []));
      assign(3,(d)=>setProjects(d.projects ?? []));
      assign(4,(d)=>setVisits(d.siteVisits ?? []));
      assign(5,(d)=>setAttendance(d.attendance ?? []));
      assign(6,(d)=>setSalaries(d.salaries ?? []));
      assign(7,(d)=>setNotices(d.notifications ?? []));
      const firstError = results.find((r) => r.status === "rejected");
      if (firstError?.status === "rejected") {
        const status = firstError.reason?.response?.status;
        if (status === 401 || status === 403) toast.error(firstError.reason?.response?.data?.error || "Some workspace data is not available.");
      }
    } catch (error: any) { toast.error(error?.response?.data?.error || "Unable to load your employee workspace."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  const today = (() => { const ps = new Intl.DateTimeFormat("en-CA", { timeZone:"Asia/Kolkata", year:"numeric", month:"2-digit", day:"2-digit" }).formatToParts(new Date()); const val = (k:string) => ps.find((p)=>p.type===k)?.value ?? ""; return `${val("year")}-${val("month")}-${val("day")}`; })();
  const todayAttendance = attendance.find((a)=>a.attendanceDate===today);
  const pendingTasks = useMemo(()=>tasks.filter((t)=>!["COMPLETED","CANCELLED"].includes(t.status)),[tasks]);
  const overdueTasks = useMemo(()=>pendingTasks.filter((t)=>t.deadlineAt && new Date(t.deadlineAt)<new Date()),[pendingTasks]);
  const myHotLeads = leads.filter((l)=>l.leadTemperature==="HOT").length;
  const projectName = (p: Lead["projectId"]) => typeof p === "string" ? projects.find((x)=>x._id===p)?.name ?? "Project" : p.name;

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
  async function markRead(n: Notice) {
    if (n.isRead) return;
    try { await api.patch(`/notifications/${n._id}/read`,{}); setNotices((old)=>old.map((x)=>x._id===n._id?{...x,isRead:true}:x)); }
    catch (error: any) { toast.error(error?.response?.data?.error || "Could not mark notification read."); }
  }
  async function updateLeadStage(lead: Lead, stage: string) {
    try { await api.patch(`/employees/leads/${lead._id}`,{stage}); toast.success("Lead stage updated."); await load(); }
    catch (error: any) { toast.error(error?.response?.data?.error || "Could not update lead."); }
  }
  const [showLeadForm, setShowLeadForm] = useState(false);

  return (
    <main className="min-h-screen bg-background px-3 py-5 text-foreground sm:px-6 sm:py-8">
      <div className="mx-auto max-w-[1450px] space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Truvi Ventures · Employee Workspace</p><h1 className="mt-2 text-2xl font-semibold sm:text-3xl">Hello{employee?.name ? `, ${employee.name.split(" ")[0]}` : ""}</h1><p className="mt-2 text-sm text-muted-foreground">{new Date().toLocaleDateString("en-IN",{weekday:"long",day:"numeric",month:"long",year:"numeric",timeZone:"Asia/Kolkata"})} · {employee?.designation || "Employee"} · {employee?.department || "Team"}</p></div>
          <div className="flex gap-2"><button onClick={()=>void load()} className="rounded-xl border border-white/10 px-3 py-2 text-sm">Refresh</button><Link to="/login" className="rounded-xl border border-white/10 px-3 py-2 text-sm">Sign in help</Link></div>
        </header>

        <nav className="flex gap-2 overflow-x-auto border-b border-white/10 pb-2" aria-label="Employee workspace">
          {tabItems.map((t)=><button key={t.id} onClick={()=>setTab(t.id)} className={`shrink-0 rounded-xl px-3 py-2 text-sm ${t.id===tab?"bg-primary text-primary-foreground":"text-muted-foreground hover:bg-white/5 hover:text-foreground"}`}>{t.label}{t.id==="notifications"&&notices.filter((n)=>!n.isRead).length>0? ` (${notices.filter((n)=>!n.isRead).length})`:""}</button>)}
        </nav>

        {loading && <div className="rounded-xl border border-white/10 p-4 text-sm text-muted-foreground">Loading your work…</div>}

        {tab==="home" && <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5"><Kpi label="Pending tasks" value={pendingTasks.length}/><Kpi label="Overdue tasks" value={overdueTasks.length}/><Kpi label="Completed tasks" value={tasks.filter((t)=>t.status==="COMPLETED").length}/><Kpi label="My leads" value={leads.length}/><Kpi label="Hot leads" value={myHotLeads}/></div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Today's attendance" note="Check-in and check-out use server timestamps and the Asia/Kolkata work date.">
              <div className="flex flex-wrap items-center justify-between gap-3"><div><Badge value={todayAttendance?.status || "NOT_MARKED"}/><p className="mt-2 text-xs text-muted-foreground">In: {fmtDateTime(todayAttendance?.checkInAt)} · Out: {fmtDateTime(todayAttendance?.checkOutAt)}</p></div><div className="flex gap-2"><button disabled={!!todayAttendance?.checkInAt} onClick={()=>void attendanceAction("check-in")} className="rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-40">Check in</button><button disabled={!todayAttendance?.checkInAt||!!todayAttendance?.checkOutAt} onClick={()=>void attendanceAction("check-out")} className="rounded-xl border border-white/10 px-3 py-2 text-sm disabled:opacity-40">Check out</button></div></div>
            </Panel>
            <Panel title="Employee profile"><div className="grid grid-cols-2 gap-3 text-sm"><div><p className="text-xs text-muted-foreground">Employee ID</p><p className="mt-1 font-medium">{employee?.employeeCode||"—"}</p></div><div><p className="text-xs text-muted-foreground">Joining date</p><p className="mt-1 font-medium">{fmtDate(employee?.joiningDate)}</p></div><div><p className="text-xs text-muted-foreground">Reporting manager</p><p className="mt-1 break-all font-medium">{employee?.reportingManagerId||"Not assigned"}</p></div><div><p className="text-xs text-muted-foreground">Status</p><p className="mt-1"><Badge value={employee?.status||"UNKNOWN"}/></p></div></div></Panel>
            <Panel title="Upcoming deadlines"><div className="space-y-3">{pendingTasks.filter((t)=>t.deadlineAt).sort((a,b)=>new Date(a.deadlineAt!).getTime()-new Date(b.deadlineAt!).getTime()).slice(0,5).map((t)=><div key={t._id} className="flex items-start justify-between gap-3 border-b border-white/5 pb-3 last:border-0"><div><p className="text-sm font-medium">{t.title}</p><p className="mt-1 text-xs text-muted-foreground">{fmtDateTime(t.deadlineAt)}</p></div><Badge value={t.priority}/></div>)}{pendingTasks.filter((t)=>t.deadlineAt).length===0&&<p className="text-sm text-muted-foreground">No dated open tasks.</p>}</div><button className="mt-3 text-sm underline" onClick={()=>setTab("tasks")}>View all tasks</button></Panel>
            <Panel title="Recent notifications"><div className="space-y-3">{notices.slice(0,4).map((n)=><button key={n._id} onClick={()=>void markRead(n)} className={`block w-full rounded-xl border p-3 text-left ${n.isRead?"border-white/5 bg-white/[0.015]":"border-primary/20 bg-primary/5"}`}><div className="flex items-start justify-between gap-2"><p className="text-sm font-medium">{n.title||"Truvi update"}</p>{!n.isRead&&<span className="mt-1 size-2 rounded-full bg-primary"/>}</div><p className="mt-1 text-xs leading-5 text-muted-foreground">{n.message}</p><p className="mt-1 text-[11px] text-muted-foreground">{fmtDateTime(n.createdAt)}</p></button>)}{notices.length===0&&<p className="text-sm text-muted-foreground">No notifications yet.</p>}</div></Panel>
          </div>
        </>}

        {tab==="tasks" && <div className="space-y-4">
          <div className="flex flex-wrap justify-between gap-3"><div><h2 className="text-lg font-semibold">My tasks</h2><p className="mt-1 text-sm text-muted-foreground">Admin-assigned and personal tasks are labelled separately.</p></div><button onClick={()=>setShowTaskForm((v)=>!v)} className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">{showTaskForm?"Close":"Create personal task"}</button></div>
          {showTaskForm&&<Panel title="Create a personal task"><form onSubmit={createPersonalTask} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"><Input label="Title" required value={taskForm.title} onChange={(v)=>setTaskForm((s)=>({...s,title:v}))}/><Input label="Description" value={taskForm.description} onChange={(v)=>setTaskForm((s)=>({...s,description:v}))}/><Select label="Priority" value={taskForm.priority} onChange={(v)=>setTaskForm((s)=>({...s,priority:v}))} options={["LOW","MEDIUM","HIGH","URGENT"].map((v)=>({value:v,label:v}))}/><Input label="Deadline" type="datetime-local" value={taskForm.deadlineAt} onChange={(v)=>setTaskForm((s)=>({...s,deadlineAt:v}))}/><Input label="Estimated duration (minutes)" type="number" value={taskForm.estimatedMinutes} onChange={(v)=>setTaskForm((s)=>({...s,estimatedMinutes:v}))}/><button disabled={busy} className="self-end rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground">{busy?"Saving…":"Save personal task"}</button></form></Panel>}
          <Panel title={`Task list · ${tasks.length}`}><div className="space-y-3">{tasks.map((t)=><article key={t._id} className="rounded-xl border border-white/10 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{t.title}</h3><Badge value={t.taskType}/><Badge value={t.priority}/></div>{t.description&&<p className="mt-2 text-sm text-muted-foreground">{t.description}</p>}<p className="mt-2 text-xs text-muted-foreground">Deadline: {fmtDateTime(t.deadlineAt)}</p>{t.completionNotes&&<p className="mt-1 text-xs text-muted-foreground">Completion note: {t.completionNotes}</p>}</div><Badge value={t.status}/></div><div className="mt-3 flex flex-wrap gap-2">{t.status!=="COMPLETED"&&t.status!=="CANCELLED"&&<><button onClick={()=>void updateTask(t,"IN_PROGRESS")} className="rounded-lg border border-white/10 px-3 py-1.5 text-xs">Start / in progress</button><button onClick={()=>void updateTask(t,"ON_HOLD")} className="rounded-lg border border-white/10 px-3 py-1.5 text-xs">On hold</button><button onClick={()=>void updateTask(t,"COMPLETED")} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">Complete</button></>}</div></article>)}{tasks.length===0&&<p className="py-8 text-center text-sm text-muted-foreground">You have no tasks assigned yet.</p>}</div></Panel>
        </div>}

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
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><Kpi label="Leads I can access" value={leads.length}/><Kpi label="Hot leads" value={myHotLeads}/><Kpi label="Follow-ups due" value={leads.filter((l)=>l.nextFollowUpAt&&new Date(l.nextFollowUpAt)<new Date()).length}/><Kpi label="Call records logged" value={leads.length} note="Lead count, not call count"/></div>
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

        {tab==="profile" && <Panel title="My employee profile" note="Sensitive employment and permission fields can only be updated by an authorised administrator.">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{[
            ["Full name",employee?.name],["Employee ID",employee?.employeeCode],["Official email",employee?.officialEmail],["Phone",employee?.phone],["Department",employee?.department],["Designation",employee?.designation],["Joining date",fmtDate(employee?.joiningDate)],["Recruitment source",employee?.recruitmentSource],["Reporting manager",employee?.reportingManagerId||"Not assigned"],["Employment status",employee?.status],
          ].map(([label,value])=><div key={label} className="rounded-xl border border-white/10 p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 break-words text-sm font-medium">{value||"—"}</p></div>)}</div>
          <div className="mt-4 rounded-xl border border-white/10 p-4"><p className="text-xs text-muted-foreground">My assigned permissions</p><div className="mt-2 flex flex-wrap gap-2">{(employee?.permissions||[]).map((p)=><span key={p} className="rounded-lg border border-white/10 px-2 py-1 text-xs">{p}</span>)}</div></div>
        </Panel>}

        {tab==="salary" && <Panel title="My salary records" note="You can only see salary records linked to your own employee profile.">
          <div className="overflow-x-auto"><table className="w-full min-w-[650px] text-left text-sm"><thead className="text-xs text-muted-foreground"><tr><th className="p-3">Payroll month</th><th className="p-3">Gross</th><th className="p-3">Allowances</th><th className="p-3">Deductions</th><th className="p-3">Net payable</th><th className="p-3">Status</th><th className="p-3">Payment date / reference</th></tr></thead><tbody>{salaries.map((s)=><tr key={s._id} className="border-t border-white/10"><td className="p-3">{s.monthKey}</td><td className="p-3">{money(s.grossSalary)}</td><td className="p-3">{money(s.allowances)}</td><td className="p-3">{money(s.deductions)}</td><td className="p-3 font-semibold">{money(s.netPayable)}</td><td className="p-3"><Badge value={s.status}/></td><td className="p-3">{s.status==="PAID"?`${fmtDate(s.paymentDate)} · ${s.paymentReference||"—"}`:"—"}</td></tr>)}</tbody></table>{salaries.length===0&&<p className="p-6 text-sm text-muted-foreground">No salary record is available for your account. Contact Admin if you believe this is an error.</p>}</div>
        </Panel>}

        {tab==="notifications" && <Panel title="Notifications" note="Notifications are personal to your account. Select a notification to mark it read."><div className="space-y-3">{notices.map((n)=><button key={n._id} onClick={()=>void markRead(n)} className={`block w-full rounded-xl border p-4 text-left ${n.isRead?"border-white/5":"border-primary/25 bg-primary/5"}`}><div className="flex items-start justify-between gap-3"><p className="font-medium">{n.title||"Truvi notification"}</p><Badge value={n.isRead?"READ":"UNREAD"}/></div><p className="mt-1 text-sm text-muted-foreground">{n.message}</p><p className="mt-2 text-xs text-muted-foreground">{fmtDateTime(n.createdAt)}</p></button>)}{notices.length===0&&<p className="py-8 text-center text-sm text-muted-foreground">No notifications available.</p>}</div></Panel>}
      </div>
    </main>
  );
}

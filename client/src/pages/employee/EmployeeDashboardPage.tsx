import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { ArrowRight, Bell, Building2, Camera, CalendarCheck, CalendarClock, CalendarDays, CheckCircle2, ChevronDown, ChevronRight, ChevronUp, CircleDollarSign, ClipboardList, Clock3, Flame, Info, LayoutDashboard, ListChecks, MapPin, Megaphone, MessageCircle, Phone, PhoneCall, Plus, RefreshCw, Search, ShieldAlert, Trash2, UserRound, Users, Wallet, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useSocketEvent } from "@/lib/socket";
import { NotificationBell } from "@/components/NotificationBell";
import UserMenu from "@/components/UserMenu";
import { ThemeToggle } from "@/components/theme/ThemeProvider";
import { DashboardSkeleton } from "@/components/ui/PageSkeleton";
import { useAuthStore } from "@/store/authStore";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type Tab = "home" | "tasks" | "leads" | "buyer_leads" | "telecalling" | "visits" | "projects" | "attendance" | "leave" | "profile" | "salary" | "notifications";
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
type ProjectDeveloperOption = { id: string; name: string; companyName?: string | null };
type EmployeeProjectSubmission = { _id: string; name: string; city: string; location: string; description: string; projectType?: string | null; approvalStatus: string; totalUnits?: number | null; createdAt: string; developerName: string; coverImageUrl?: string | null };
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

const baseTabItems: { id: Tab; label: string }[] = [
  { id:"home", label:"Overview" }, { id:"tasks", label:"My tasks" }, { id:"leads", label:"My leads" },
  { id:"buyer_leads", label:"Buyer leads (CRM)" },
  { id:"telecalling", label:"Telecalling" }, { id:"visits", label:"Site visits" }, { id:"attendance", label:"Attendance" },
  { id:"leave", label:"Leave requests" }, { id:"profile", label:"My profile" }, { id:"salary", label:"My salary" }, { id:"notifications", label:"Notifications" },
];
const tabIcons = {
  home: LayoutDashboard, tasks: ListChecks, leads: Users, buyer_leads: Megaphone, telecalling: PhoneCall,
  visits: MapPin, projects: Building2, attendance: CalendarCheck, leave: CalendarDays, profile: UserRound,
  salary: Wallet, notifications: Bell,
} as const;

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
  const clearAuth = useAuthStore((state) => state.clearAuth);
  const profilePhotoInputRef = useRef<HTMLInputElement>(null);
  const [profilePhotoBusy, setProfilePhotoBusy] = useState(false);
  const [profileNameDraft, setProfileNameDraft] = useState("");
  const [profileBioDraft, setProfileBioDraft] = useState("");
  const [profileEmailDraft, setProfileEmailDraft] = useState("");
  const [profilePhoneDraft, setProfilePhoneDraft] = useState("");
  const [emailChangeOtp, setEmailChangeOtp] = useState("");
  const [phoneChangeOtp, setPhoneChangeOtp] = useState("");
  const [emailChangeRequested, setEmailChangeRequested] = useState(false);
  const [phoneChangeRequested, setPhoneChangeRequested] = useState(false);
  const [contactBusy, setContactBusy] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [passwordBusy, setPasswordBusy] = useState(false);
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
  const [projectSubmissions, setProjectSubmissions] = useState<EmployeeProjectSubmission[]>([]);
  const [projectDevelopers, setProjectDevelopers] = useState<ProjectDeveloperOption[]>([]);
  const [projectCenterLoading, setProjectCenterLoading] = useState(false);
  const [projectSaving, setProjectSaving] = useState(false);
  const [projectActionBusyId, setProjectActionBusyId] = useState<string | null>(null);
  const [projectPhoto, setProjectPhoto] = useState<File | null>(null);
  const [projectForm, setProjectForm] = useState({
    name: "", description: "", city: "", location: "", developerId: "",
    projectType: "VILLA", approvalAuthority: "RERA", reraNumber: "",
    totalUnits: "", possessionDate: "",
  });
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

  // Buyer CRM (Meta Leads / Site Leads) State
  const [crmLeads, setCrmLeads] = useState<any[]>([]);
  const [_crmSummary, setCrmSummary] = useState<any>(null);
  const [crmLoading, setCrmLoading] = useState(false);
  const [crmSite, setCrmSite] = useState("");
  const [crmStage, setCrmStage] = useState("");
  const [crmSearch, setCrmSearch] = useState("");
  const [crmQuickFilter, setCrmQuickFilter] = useState<string>("ALL");
  const [crmExpandedId, setCrmExpandedId] = useState<string | null>(null);
  const [crmActivities, setCrmActivities] = useState<any[]>([]);
  const [crmNote, setCrmNote] = useState("");
  const [crmActType, setCrmActType] = useState<"CALL" | "WHATSAPP" | "NOTE">("CALL");

  // Mobile Lead Creation Modal State
  const [showAddLeadModal, setShowAddLeadModal] = useState(false);
  const [addLeadBusy, setAddLeadBusy] = useState(false);
  const [newLeadForm, setNewLeadForm] = useState({
    fullName: "",
    phone: "",
    email: "",
    source: "TELECALLER",
    projectId: "",
    budgetRange: "",
    propertyType: "",
    preferredLocation: "",
    purchasePurpose: "SELF_USE",
    purchaseTimeline: "IMMEDIATE",
    requirement: "",
    nextFollowUpAt: "",
  });

  // Mobile Site Visit Scheduling State
  const [visitScheduleLead, setVisitScheduleLead] = useState<any | null>(null);
  const [visitScheduleForm, setVisitScheduleForm] = useState({
    scheduledAt: "",
    notes: "",
  });
  const [visitScheduleBusy, setVisitScheduleBusy] = useState(false);

  // Mobile Custom Follow-up Scheduling State
  const [followUpScheduleLead, setFollowUpScheduleLead] = useState<any | null>(null);
  const [followUpCustomDate, setFollowUpCustomDate] = useState("");
  const [followUpBusy, setFollowUpBusy] = useState(false);

  const canSubmitProjects = employee?.permissions?.includes("project.listing.submit") === true;
  const tabItems = useMemo(() => (
    canSubmitProjects
      ? [...baseTabItems, { id: "projects" as Tab, label: "Project listings" }]
      : baseTabItems
  ), [canSubmitProjects]);

  const navigationGroups = useMemo(() => {
    const groups: { label: string; items: Tab[] }[] = [
      { label: "Workspace", items: ["home", "tasks"] },
      { label: "Sales & field", items: ["buyer_leads", "leads", "telecalling", "visits"] },
      { label: "People & time", items: ["attendance", "leave"] },
      { label: "Account", items: ["profile", "salary", "notifications"] },
    ];
    if (canSubmitProjects) groups.splice(2, 0, { label: "Project tools", items: ["projects"] });
    return groups;
  }, [canSubmitProjects]);

  const loadCrmLeads = useCallback(async () => {
    setCrmLoading(true);
    try {
      const [leadsRes, sumRes] = await Promise.all([
        api.get("/buyer-crm/admin/leads", {
          params: {
            projectId: crmSite || undefined,
            status: crmStage || undefined,
            q: crmSearch.trim() || undefined,
            limit: 100,
          },
        }),
        api.get("/buyer-crm/admin/summary"),
      ]);
      setCrmLeads(leadsRes.data.leads ?? []);
      setCrmSummary(sumRes.data);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Could not load buyer CRM leads.");
    } finally {
      setCrmLoading(false);
    }
  }, [crmSite, crmStage, crmSearch]);

  useEffect(() => {
    if (tab === "buyer_leads") {
      void loadCrmLeads();
    }
  }, [tab, loadCrmLeads]);

  async function updateCrmLeadStage(leadId: string, newStatus: string) {
    try {
      await api.patch(`/buyer-crm/admin/leads/${leadId}`, { status: newStatus });
      toast.success("Lead stage updated.");
      await loadCrmLeads();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Could not update lead stage.");
    }
  }

  async function updateCrmLeadFollowUp(leadId: string, dateIso: string | null, noteMessage?: string) {
    try {
      await api.patch(`/buyer-crm/admin/leads/${leadId}`, { nextFollowUpAt: dateIso });
      if (noteMessage) {
        await api.post(`/buyer-crm/admin/leads/${leadId}/activities`, {
          type: "FOLLOW_UP",
          content: noteMessage,
        }).catch(() => null);
      }
      toast.success(dateIso ? "Follow-up reminder set." : "Follow-up reminder cleared.");
      await loadCrmLeads();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Could not update follow-up.");
    }
  }

  async function handleQuickFollowUp(lead: any, preset: "today_5pm" | "tomorrow_11am" | "tomorrow_4pm" | "in_2d" | "weekend") {
    const d = new Date();
    let noteDesc = "";
    if (preset === "today_5pm") {
      d.setHours(17, 0, 0, 0);
      if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1);
      noteDesc = "Follow-up scheduled for Today 5:00 PM.";
    } else if (preset === "tomorrow_11am") {
      d.setDate(d.getDate() + 1);
      d.setHours(11, 0, 0, 0);
      noteDesc = "Follow-up scheduled for Tomorrow 11:00 AM.";
    } else if (preset === "tomorrow_4pm") {
      d.setDate(d.getDate() + 1);
      d.setHours(16, 0, 0, 0);
      noteDesc = "Follow-up scheduled for Tomorrow 4:00 PM.";
    } else if (preset === "in_2d") {
      d.setDate(d.getDate() + 2);
      d.setHours(11, 0, 0, 0);
      noteDesc = "Follow-up scheduled in 2 days at 11:00 AM.";
    } else if (preset === "weekend") {
      const day = d.getDay();
      const daysUntilSaturday = (6 - day + 7) % 7 || 7;
      d.setDate(d.getDate() + daysUntilSaturday);
      d.setHours(11, 0, 0, 0);
      noteDesc = "Follow-up scheduled for Saturday 11:00 AM.";
    }
    await updateCrmLeadFollowUp(lead._id, d.toISOString(), noteDesc);
  }

  async function handleSaveCustomFollowUp(e: FormEvent) {
    e.preventDefault();
    if (!followUpScheduleLead || !followUpCustomDate) return;
    setFollowUpBusy(true);
    try {
      const dateIso = new Date(followUpCustomDate).toISOString();
      await updateCrmLeadFollowUp(
        followUpScheduleLead._id,
        dateIso,
        `Follow-up scheduled for ${fmtDateTime(followUpCustomDate)}.`
      );
      setFollowUpScheduleLead(null);
      setFollowUpCustomDate("");
    } finally {
      setFollowUpBusy(false);
    }
  }

  async function handleSaveSiteVisit(e: FormEvent) {
    e.preventDefault();
    if (!visitScheduleLead || !visitScheduleForm.scheduledAt) {
      toast.error("Choose visit date and time.");
      return;
    }
    setVisitScheduleBusy(true);
    try {
      const dateIso = new Date(visitScheduleForm.scheduledAt).toISOString();
      await api.patch(`/buyer-crm/admin/leads/${visitScheduleLead._id}`, {
        status: "SITE_VISIT_SCHEDULED",
        nextFollowUpAt: dateIso,
      });
      const noteContent = `Site visit scheduled for ${fmtDateTime(visitScheduleForm.scheduledAt)}${
        visitScheduleForm.notes ? " · Notes: " + visitScheduleForm.notes : ""
      }`;
      await api.post(`/buyer-crm/admin/leads/${visitScheduleLead._id}/activities`, {
        type: "FOLLOW_UP",
        content: noteContent,
      });
      toast.success("Site visit scheduled successfully.");
      setVisitScheduleLead(null);
      setVisitScheduleForm({ scheduledAt: "", notes: "" });
      await loadCrmLeads();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Could not schedule site visit.");
    } finally {
      setVisitScheduleBusy(false);
    }
  }

  async function toggleCrmLeadHistory(leadId: string) {
    if (crmExpandedId === leadId) {
      setCrmExpandedId(null);
      return;
    }
    setCrmExpandedId(leadId);
    setCrmNote("");
    try {
      const res = await api.get(`/buyer-crm/admin/leads/${leadId}/activities`);
      setCrmActivities(res.data.activities ?? []);
    } catch {
      toast.error("Could not load activity history.");
    }
  }

  async function logCrmActivity(leadId: string) {
    if (crmNote.trim().length < 2) {
      toast.error("Add a short activity note.");
      return;
    }
    try {
      await api.post(`/buyer-crm/admin/leads/${leadId}/activities`, {
        type: crmActType,
        content: crmNote.trim(),
      });
      setCrmNote("");
      toast.success("Activity logged.");
      const res = await api.get(`/buyer-crm/admin/leads/${leadId}/activities`);
      setCrmActivities(res.data.activities ?? []);
      await loadCrmLeads();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Could not log activity.");
    }
  }

  async function logPresetActivity(leadId: string, type: "CALL" | "WHATSAPP" | "NOTE", text: string) {
    try {
      await api.post(`/buyer-crm/admin/leads/${leadId}/activities`, {
        type,
        content: text,
      });
      toast.success("Activity logged: " + text);
      const res = await api.get(`/buyer-crm/admin/leads/${leadId}/activities`);
      setCrmActivities(res.data.activities ?? []);
      await loadCrmLeads();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Could not log activity.");
    }
  }

  async function submitCreateBuyerLead(e: FormEvent) {
    e.preventDefault();
    if (newLeadForm.fullName.trim().length < 2) {
      toast.error("Enter buyer's full name (at least 2 characters).");
      return;
    }
    const cleanDigits = newLeadForm.phone.replace(/\D/g, "");
    if (cleanDigits.length < 10) {
      toast.error("Enter a valid 10-digit mobile number.");
      return;
    }
    setAddLeadBusy(true);
    try {
      await api.post("/buyer-crm/admin/leads", {
        fullName: newLeadForm.fullName.trim(),
        phone: newLeadForm.phone.trim(),
        email: newLeadForm.email.trim() || undefined,
        source: newLeadForm.source || "TELECALLER",
        projectId: newLeadForm.projectId || undefined,
        budgetRange: newLeadForm.budgetRange || undefined,
        propertyType: newLeadForm.propertyType || undefined,
        preferredLocation: newLeadForm.preferredLocation || undefined,
        purchasePurpose: newLeadForm.purchasePurpose || undefined,
        purchaseTimeline: newLeadForm.purchaseTimeline || undefined,
        requirement: newLeadForm.requirement.trim() || undefined,
        nextFollowUpAt: newLeadForm.nextFollowUpAt ? new Date(newLeadForm.nextFollowUpAt).toISOString() : undefined,
        contactConsent: true,
        consentBasis: "Lead added via Mobile CRM by sales executive",
      });
      toast.success("Buyer lead added successfully.");
      setShowAddLeadModal(false);
      setNewLeadForm({
        fullName: "",
        phone: "",
        email: "",
        source: "TELECALLER",
        projectId: "",
        budgetRange: "",
        propertyType: "",
        preferredLocation: "",
        purchasePurpose: "SELF_USE",
        purchaseTimeline: "IMMEDIATE",
        requirement: "",
        nextFollowUpAt: "",
      });
      await loadCrmLeads();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Could not create lead.");
    } finally {
      setAddLeadBusy(false);
    }
  }

  const filteredCrmLeads = useMemo(() => {
    return crmLeads.filter((l) => {
      if (crmQuickFilter === "DUE") {
        if (!l.nextFollowUpAt) return false;
        const dueTime = new Date(l.nextFollowUpAt).getTime();
        return dueTime <= Date.now() + 24 * 60 * 60 * 1000 && !["CONVERTED", "LOST"].includes(l.status);
      }
      if (crmQuickFilter === "NEW") return l.status === "NEW";
      if (crmQuickFilter === "CONTACTED") return l.status === "CONTACTED";
      if (crmQuickFilter === "QUALIFIED") return l.status === "QUALIFIED";
      if (crmQuickFilter === "VISITS") return ["SITE_VISIT_SCHEDULED", "SITE_VISIT_COMPLETED"].includes(l.status);
      if (crmQuickFilter === "WON") return ["BOOKING_TOKEN", "CONVERTED"].includes(l.status);
      if (crmQuickFilter === "LOST") return l.status === "LOST";
      return true;
    });
  }, [crmLeads, crmQuickFilter]);

  const filterCounts = useMemo(() => {
    const now = Date.now();
    return {
      all: crmLeads.length,
      due: crmLeads.filter((l) => l.nextFollowUpAt && new Date(l.nextFollowUpAt).getTime() <= now + 24 * 60 * 60 * 1000 && !["CONVERTED", "LOST"].includes(l.status)).length,
      new: crmLeads.filter((l) => l.status === "NEW").length,
      contacted: crmLeads.filter((l) => l.status === "CONTACTED").length,
      qualified: crmLeads.filter((l) => l.status === "QUALIFIED").length,
      visits: crmLeads.filter((l) => ["SITE_VISIT_SCHEDULED", "SITE_VISIT_COMPLETED"].includes(l.status)).length,
      won: crmLeads.filter((l) => ["BOOKING_TOKEN", "CONVERTED"].includes(l.status)).length,
      lost: crmLeads.filter((l) => l.status === "LOST").length,
    };
  }, [crmLeads]);

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
        failures.push(status === 403
          ? `${label} (permission not enabled — ask an Admin to update access)`
          : status ? `${label} (HTTP ${status})` : label);
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

  async function refreshProjectCenter() {
    if (!canSubmitProjects) return;
    setProjectCenterLoading(true);
    try {
      const [developerResponse, projectResponse] = await Promise.all([
        api.get("/employees/project-developers"),
        api.get("/employees/projects"),
      ]);
      setProjectDevelopers(developerResponse.data.developers ?? []);
      setProjectSubmissions(projectResponse.data.projects ?? []);
    } catch (error: any) {
      toast.error(error?.response?.data?.error || "Could not load project listings.");
    } finally {
      setProjectCenterLoading(false);
    }
  }

  useEffect(() => {
    if (tab === "projects" && canSubmitProjects) void refreshProjectCenter();
  }, [tab, canSubmitProjects]);

  async function uploadProjectGalleryPhoto(projectId: string, file: File) {
    if (!file.type.startsWith("image/") || file.size > 12 * 1024 * 1024) {
      throw new Error("Choose an image file up to 12 MB.");
    }
    const form = new FormData();
    form.append("file", file);
    form.append("category", "GALLERY_IMAGE");
    form.append("title", file.name.replace(/\\.[^.]+$/, "") || "Project cover photo");
    await api.post("/presentation/" + projectId + "/assets", form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  }

  async function submitSavedProject(projectId: string, photo?: File) {
    if (!canSubmitProjects) return;
    setProjectActionBusyId(projectId);
    try {
      if (photo) await uploadProjectGalleryPhoto(projectId, photo);
      await api.post("/employees/projects/" + projectId + "/submit", {});
      toast.success("Project submitted to Admin for review.");
      await refreshProjectCenter();
    } catch (error: any) {
      toast.error(error?.response?.data?.error || error?.message || "Could not submit this project.");
    } finally {
      setProjectActionBusyId(null);
    }
  }

  async function createEmployeeProject(event: FormEvent) {
    event.preventDefault();
    if (!canSubmitProjects) return;
    if (projectForm.name.trim().length < 2 || projectForm.description.trim().length < 10 ||
        projectForm.city.trim().length < 2 || projectForm.location.trim().length < 2 ||
        !projectForm.developerId || !projectForm.projectType || !projectForm.totalUnits ||
        Number(projectForm.totalUnits) <= 0) {
      toast.error("Complete the required project details and choose a registered developer.");
      return;
    }
    setProjectSaving(true);
    try {
      const response = await api.post("/employees/projects", {
        name: projectForm.name.trim(),
        description: projectForm.description.trim(),
        city: projectForm.city.trim(),
        location: projectForm.location.trim(),
        developerId: projectForm.developerId,
        projectType: projectForm.projectType,
        approvalAuthority: projectForm.approvalAuthority,
        reraNumber: projectForm.reraNumber.trim() || undefined,
        totalUnits: Number(projectForm.totalUnits),
        possessionDate: projectForm.possessionDate || undefined,
      });
      const projectId = String(response.data.project?._id || "");
      if (!projectId) throw new Error("The project draft was saved but no project ID was returned.");
      if (projectPhoto) {
        await uploadProjectGalleryPhoto(projectId, projectPhoto);
        await api.post("/employees/projects/" + projectId + "/submit", {});
        toast.success("Project submitted to Admin for review.");
      } else {
        toast.success("Project draft saved. Add a cover photo to submit it for review.");
      }
      setProjectForm({
        name: "", description: "", city: "", location: "", developerId: "",
        projectType: "VILLA", approvalAuthority: "RERA", reraNumber: "",
        totalUnits: "", possessionDate: "",
      });
      setProjectPhoto(null);
      await refreshProjectCenter();
    } catch (error: any) {
      toast.error(error?.response?.data?.error || error?.message || "Could not create project listing.");
      await refreshProjectCenter();
    } finally {
      setProjectSaving(false);
    }
  }

  useEffect(() => {
    setProfileNameDraft(employee?.name || currentUser?.name || "");
    setProfileBioDraft(currentUser?.bio || "");
    setProfileEmailDraft(currentUser?.email || employee?.officialEmail || "");
    setProfilePhoneDraft(employee?.phone || currentUser?.phone || "");
  }, [employee?.id, currentUser?._id]);
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

  async function savePersonalProfile(event: FormEvent) {
    event.preventDefault();
    if (profileNameDraft.trim().length < 2) {
      toast.error("Name must be at least 2 characters.");
      return;
    }
    setContactBusy(true);
    try {
      const response = await api.patch("/auth/profile", {
        name: profileNameDraft.trim(),
        bio: profileBioDraft.trim(),
      });
      const updated = response.data?.user;
      if (currentUser && updated) setAuthUser({ ...currentUser, name: updated.name, bio: updated.bio ?? null, avatarUrl: updated.avatarUrl ?? currentUser.avatarUrl });
      toast.success("Personal profile updated.");
      await load();
    } catch (error: any) {
      toast.error(error?.response?.data?.error || "Could not update your personal profile.");
    } finally {
      setContactBusy(false);
    }
  }

  async function requestEmailChange(event: FormEvent) {
    event.preventDefault();
    if (profileEmailDraft.trim().toLowerCase() === (currentUser?.email || employee?.officialEmail || "").toLowerCase()) {
      toast.error("Enter a different email address.");
      return;
    }
    setContactBusy(true);
    try {
      await api.post("/auth/profile/request-email-change", { email: profileEmailDraft.trim() });
      setEmailChangeRequested(true);
      setEmailChangeOtp("");
      toast.success("Verification code sent to your new email.");
    } catch (error: any) {
      toast.error(error?.response?.data?.error || "Could not request email change.");
    } finally {
      setContactBusy(false);
    }
  }

  async function verifyEmailChange(event: FormEvent) {
    event.preventDefault();
    setContactBusy(true);
    try {
      await api.post("/auth/profile/verify-email-change", { otp: emailChangeOtp.trim() });
      toast.success("Email verified. Sign in with your new email address.");
      clearAuth();
      navigate("/login", { replace: true });
    } catch (error: any) {
      toast.error(error?.response?.data?.error || "Email verification failed.");
    } finally {
      setContactBusy(false);
    }
  }

  async function requestPhoneChange(event: FormEvent) {
    event.preventDefault();
    setContactBusy(true);
    try {
      await api.post("/auth/profile/request-phone-change", { phone: profilePhoneDraft.trim() });
      setPhoneChangeRequested(true);
      setPhoneChangeOtp("");
      toast.success("Verification code sent to your new phone number.");
    } catch (error: any) {
      toast.error(error?.response?.data?.error || "Could not request phone change.");
    } finally {
      setContactBusy(false);
    }
  }

  async function verifyPhoneChange(event: FormEvent) {
    event.preventDefault();
    setContactBusy(true);
    try {
      const response = await api.post("/auth/profile/verify-phone-change", { otp: phoneChangeOtp.trim() });
      if (currentUser && response.data?.user) setAuthUser({
        ...currentUser,
        phone: response.data.user.phone ?? profilePhoneDraft.trim(),
        phoneVerified: true,
        email: response.data.user.email ?? currentUser.email,
      });
      setPhoneChangeRequested(false);
      setPhoneChangeOtp("");
      toast.success("Phone number updated and verified.");
      await load();
    } catch (error: any) {
      toast.error(error?.response?.data?.error || "Phone verification failed.");
    } finally {
      setContactBusy(false);
    }
  }

  async function changePassword(event: FormEvent) {
    event.preventDefault();
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast.error("The new passwords do not match.");
      return;
    }
    setPasswordBusy(true);
    try {
      await api.post("/auth/change-password", {
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
      });
      toast.success("Password changed. Please sign in again.");
      clearAuth();
      navigate("/login", { replace: true });
    } catch (error: any) {
      toast.error(error?.response?.data?.error || "Could not change password.");
    } finally {
      setPasswordBusy(false);
    }
  }
  async function updateLeadStage(lead: Lead, stage: string) {
    try { await api.patch(`/employees/leads/${lead._id}`,{stage}); toast.success("Lead stage updated."); await load(); }
    catch (error: any) { toast.error(error?.response?.data?.error || "Could not update lead."); }
  }
  const [showLeadForm, setShowLeadForm] = useState(false);

  if (loading) return <DashboardSkeleton variant="employee" />;

  return (
    <main className="truvi-erm truvi-erm-employee">
      <div className="truvi-employee-app-shell">
        <aside className="truvi-employee-sidebar" aria-label="Employee navigation">
          <div className="truvi-employee-brand">
            <span className="truvi-employee-brand__mark"><img src="/brand/icon.png" alt="Truvi" /></span>
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
              <ThemeToggle showLabel={false} />
              <NotificationBell />
              <button type="button" className="truvi-employee-icon-button" onClick={() => void load()} disabled={loading} aria-label="Refresh workspace" title="Refresh workspace">
                <RefreshCw size={17} aria-hidden="true" className={loading ? "animate-spin" : ""} />
              </button>
              <div className="truvi-employee-account-menu">
                <UserMenu />
              </div>
            </div>
          </header>

          <div className="truvi-erm-workspace-content">
            <div className="truvi-employee-page-heading">
              <div>
                <p className="truvi-employee-eyebrow">TRUVI VENTURES · PEOPLE & OPERATIONS</p>
                <h1>Hello{employee?.name ? ", " + employee.name.split(" ")[0] : ""}</h1>
                <p>{new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" })} <span>·</span> {employee?.designation || "Employee"} <span>·</span> {employee?.department || "Team"}</p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                {employee?.permissions?.includes("lead.create") && (
                  <button
                    type="button"
                    onClick={() => navigate("/requirements")}
                    className="inline-flex items-center gap-2 rounded-full border border-teal-400/30 bg-teal-400/10 px-4 py-2 text-sm font-medium text-teal-200 transition hover:bg-teal-400/15"
                  >
                    <Users size={15} aria-hidden="true" /> Share Lead Requirement
                  </button>
                )}
                
              </div>
            </div>

            {loading && <div role="status" className="truvi-erm-loading-state">Loading your workspace data…</div>}
            {!loading && loadIssues.length > 0 && <div role="status" className="truvi-erm-load-warning flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4 text-sm"><div><p className="font-semibold">Some workspace sections need attention</p><p className="mt-1">The rest of your workspace remains available. Failed requests: {loadIssues.join(", ")}.</p></div><button type="button" onClick={() => void load()} className="inline-flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-sm"><Info size={15}/> Retry data</button></div>}

            {tab==="home" && <div className="truvi-dashboard-home">
              <div className="truvi-dashboard-kpis">
                <Kpi label="Pending tasks" value={pendingTasks.length} note="Awaiting completion" icon={ListChecks} tone="blue"/>
                <Kpi label="Overdue tasks" value={overdueTasks.length} note="Need your attention" icon={Clock3} tone="amber"/>
                <Kpi label="Completed tasks" value={tasks.filter((task) => task.status === "COMPLETED").length} note="All-time completion" icon={CheckCircle2} tone="green"/>
                <Kpi label="My buyer leads" value={leads.length} note="Assigned or submitted" icon={Users} tone="violet"/>
                <Kpi label="Hot leads" value={myHotLeads} note="Priority follow-ups" icon={Flame} tone="cyan"/>
              </div>

              <div className="truvi-dashboard-grid">
                <div className="truvi-dashboard-primary-column">
                  <Panel title="Payroll & finance" note="Your own salary records, shown by payroll month. No sample or estimated figures are added.">
                    {salaryTrend.length > 0 ? <div className="truvi-dashboard-payroll">
                      <div className="truvi-dashboard-payroll__summary">
                        <div><p>Latest net payable</p><strong>{money(salaryTrend[salaryTrend.length - 1].netPayable)}</strong></div>
                        <span className="truvi-dashboard-payroll__status"><span/> {salaries.slice().sort((a, b) => b.monthKey.localeCompare(a.monthKey))[0]?.status?.replaceAll("_", " ") || "RECORDED"}</span>
                      </div>
                      <div className="truvi-dashboard-chart">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={salaryTrend} margin={{ top: 12, right: 10, left: 0, bottom: 0 }}>
                            <defs>
                              <linearGradient id="truvi-payroll-gradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#718cff" stopOpacity={0.34}/>
                                <stop offset="95%" stopColor="#718cff" stopOpacity={0.015}/>
                              </linearGradient>
                            </defs>
                            <CartesianGrid vertical={false} stroke="rgba(148,163,184,.13)" strokeDasharray="4 4"/>
                            <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: "#8fa0ba", fontSize: 11 }} tickFormatter={(value) => { const parts = String(value).split("-"); return parts.length > 1 ? new Date(Number(parts[0]), Number(parts[1]) - 1, 1).toLocaleDateString("en-IN", { month: "short" }) : String(value); }}/>
                            <YAxis width={58} axisLine={false} tickLine={false} tick={{ fill: "#8fa0ba", fontSize: 10 }} tickFormatter={(value) => Number(value) >= 1000 ? "₹" + Math.round(Number(value) / 1000) + "k" : "₹" + value}/>
                            <Tooltip contentStyle={{ background: "#101a2a", border: "1px solid rgba(148,163,184,.22)", borderRadius: 12, color: "#e8eef8" }} labelStyle={{ color: "#cbd7eb" }} formatter={(value) => [money(Number(value)), "Net payable"]}/>
                            <Area type="monotone" dataKey="netPayable" stroke="#718cff" strokeWidth={2.5} fill="url(#truvi-payroll-gradient)" activeDot={{ r: 4, fill: "#718cff", stroke: "#e8eef8", strokeWidth: 2 }}/>
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </div> : <div className="truvi-dashboard-empty">
                      <span><Wallet size={22} aria-hidden="true"/></span>
                      <strong>No payroll trend yet</strong>
                      <p>Your salary trend will appear here once payroll records are available.</p>
                      <button type="button" onClick={() => setTab("salary")}>View my salary records <ChevronRight size={14}/></button>
                    </div>}
                  </Panel>

                  <Panel title="My tasks" note="Your assigned work at a glance. Open a task to view comments, attachments and its full activity history.">
                    <div className="truvi-dashboard-table-wrap">
                      <table className="truvi-dashboard-table">
                        <thead><tr><th>Task</th><th>Priority</th><th>Due date</th><th>Status</th></tr></thead>
                        <tbody>
                          {tasks.slice(0, 6).map((task) => (
                            <tr id={"employee-task-" + task._id} key={task._id} tabIndex={0} onClick={() => setTab("tasks")} onKeyDown={(event) => { if (event.key === "Enter") setTab("tasks"); }}>
                              <td><div className="truvi-dashboard-table__main"><span className="truvi-dashboard-table__task-icon"><ListChecks size={15}/></span><span><strong>{task.title}</strong><small>{task.taskType.replaceAll("_", " ")}</small></span></div></td>
                              <td><Badge value={task.priority}/></td>
                              <td>{task.deadlineAt ? fmtDate(task.deadlineAt) : "No deadline"}</td>
                              <td><Badge value={task.status}/></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {tasks.length === 0 && <div className="truvi-dashboard-empty truvi-dashboard-empty--compact"><span><ListChecks size={20}/></span><strong>No tasks assigned yet</strong><p>New work assigned to you will appear in this list.</p></div>}
                    </div>
                    <div className="truvi-dashboard-panel-footer"><span>{tasks.length} task{tasks.length === 1 ? "" : "s"} in your workspace</span><button type="button" onClick={() => setTab("tasks")}>View all tasks <ArrowRight size={14} aria-hidden="true"/></button></div>
                  </Panel>

                  <Panel title="Today's attendance" note="Check-in and check-out times are recorded by the server using the Asia/Kolkata work date.">
                    <div className="truvi-dashboard-attendance">
                      <div className="truvi-dashboard-attendance__status">
                        <span className="truvi-dashboard-attendance__icon"><CalendarCheck size={21}/></span>
                        <div><strong>{todayAttendance?.status?.replaceAll("_", " ") || "Not checked in"}</strong><p>Today · {today}</p></div>
                        <Badge value={todayAttendance?.status || "NOT_MARKED"}/>
                      </div>
                      <div className="truvi-dashboard-attendance__times">
                        <div><span>Check in</span><strong>{todayAttendance?.checkInAt ? fmtDateTime(todayAttendance.checkInAt) : "—"}</strong></div>
                        <div><span>Check out</span><strong>{todayAttendance?.checkOutAt ? fmtDateTime(todayAttendance.checkOutAt) : "—"}</strong></div>
                        <div className="truvi-dashboard-attendance__actions">
                          <button type="button" disabled={!!todayAttendance?.checkInAt || ["ON_LEAVE", "HOLIDAY"].includes(todayAttendance?.status || "")} onClick={() => void attendanceAction("check-in")}>Check in</button>
                          <button type="button" disabled={!todayAttendance?.checkInAt || !!todayAttendance?.checkOutAt} onClick={() => void attendanceAction("check-out")}>Check out</button>
                        </div>
                      </div>
                    </div>
                  </Panel>
                </div>

                <aside className="truvi-dashboard-side-column">
                  <Panel title="Things to do" note="Open work and upcoming deadlines.">
                    <div className="truvi-dashboard-todo-list">
                      {dashboardTodos.map((task) => (
                        <button type="button" key={task._id} className="truvi-dashboard-todo" onClick={() => { setTab("tasks"); setSearchTarget("employee-task-" + task._id); }}>
                          <span className="truvi-dashboard-todo__check"><ListChecks size={16}/></span>
                          <span className="truvi-dashboard-todo__copy"><strong>{task.title}</strong><small>{task.deadlineAt ? "Due " + fmtDate(task.deadlineAt) : "No deadline set"}</small><span><Badge value={task.priority}/><Badge value={task.status}/></span></span>
                          <ChevronRight size={15} aria-hidden="true"/>
                        </button>
                      ))}
                      {dashboardTodos.length === 0 && <div className="truvi-dashboard-empty truvi-dashboard-empty--compact"><span><CheckCircle2 size={20}/></span><strong>You're all caught up</strong><p>There are no open tasks needing attention.</p></div>}
                    </div>
                    <div className="truvi-dashboard-panel-footer"><span>{pendingTasks.length} open</span><button type="button" onClick={() => setTab("tasks")}>View tasks <ArrowRight size={14} aria-hidden="true"/></button></div>
                  </Panel>

                  <Panel title="Employee profile" note="Your account at a glance.">
                    <button type="button" className="truvi-dashboard-profile" onClick={() => setTab("profile")}>
                      <span className="truvi-dashboard-profile__avatar">
                        {currentUser?.avatarUrl ? <img src={currentUser.avatarUrl} alt=""/> : <span>{(employee?.name || currentUser?.name || "Employee").trim().split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase()}</span>}
                      </span>
                      <span className="truvi-dashboard-profile__identity"><strong>{employee?.name || currentUser?.name || "Employee"}</strong><small>{employee?.designation || "Employee"} · {employee?.department || "Team"}</small><span><i/> {employee?.status || "ACTIVE"}</span></span>
                      <ChevronRight size={16} aria-hidden="true"/>
                    </button>
                    <div className="truvi-dashboard-profile-meta">
                      <div><span>Employee ID</span><strong>{employee?.employeeCode || "—"}</strong></div>
                      <div><span>Joining date</span><strong>{fmtDate(employee?.joiningDate)}</strong></div>
                      <div><span>Reporting manager</span><strong>{employee?.reportingManagerId || "Not assigned"}</strong></div>
                    </div>
                    <div className="truvi-dashboard-panel-footer"><span>Profile & personal details</span><button type="button" onClick={() => setTab("profile")}>View profile <ArrowRight size={14} aria-hidden="true"/></button></div>
                  </Panel>

                  <Panel title="Recent notifications" note="The latest updates sent to your account.">
                    <div className="truvi-dashboard-notifications">
                      {notices.slice(0, 4).map((notice) => {
                        const visual = noticeVisual(notice.type);
                        const Icon = visual.Icon;
                        return <button type="button" id={"employee-notice-" + notice._id} key={notice._id} className={"truvi-dashboard-notification" + (notice.isRead ? " is-read" : " is-unread")} onClick={() => { void markRead(notice); setTab("notifications"); setSearchTarget("employee-notice-" + notice._id); }}>
                          <span className={"truvi-dashboard-notification__icon " + visual.tone}><Icon size={16} aria-hidden="true"/></span>
                          <span className="truvi-dashboard-notification__copy"><strong>{notice.title || "Truvi update"}</strong><small>{notice.message}</small><time>{fmtDateTime(notice.createdAt)}</time></span>
                          {!notice.isRead && <i className="truvi-dashboard-notification__unread" aria-label="Unread"/>}
                        </button>;
                      })}
                      {notices.length === 0 && <div className="truvi-dashboard-empty truvi-dashboard-empty--compact"><span><Bell size={20}/></span><strong>No notifications yet</strong><p>Updates from your workspace will appear here.</p></div>}
                    </div>
                    <div className="truvi-dashboard-panel-footer"><span>{notices.filter((notice) => !notice.isRead).length} unread</span><button type="button" onClick={() => setTab("notifications")}>All notifications <ArrowRight size={14} aria-hidden="true"/></button></div>
                  </Panel>
                </aside>
              </div>
            </div>}
        {tab==="tasks" && <div className="space-y-4">
          <div className="flex flex-wrap justify-between gap-3"><div><h2 className="text-lg font-semibold">My tasks</h2><p className="mt-1 text-sm text-muted-foreground">Admin-assigned and personal tasks are labelled separately.</p></div><button onClick={()=>setShowTaskForm((v)=>!v)} className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">{showTaskForm?"Close":"Create personal task"}</button></div>
          {showTaskForm&&<Panel title="Create a personal task"><form onSubmit={createPersonalTask} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"><Input label="Title" required value={taskForm.title} onChange={(v)=>setTaskForm((s)=>({...s,title:v}))}/><Input label="Description" value={taskForm.description} onChange={(v)=>setTaskForm((s)=>({...s,description:v}))}/><Select label="Priority" value={taskForm.priority} onChange={(v)=>setTaskForm((s)=>({...s,priority:v}))} options={["LOW","MEDIUM","HIGH","URGENT"].map((v)=>({value:v,label:v}))}/><Input label="Deadline" type="datetime-local" value={taskForm.deadlineAt} onChange={(v)=>setTaskForm((s)=>({...s,deadlineAt:v}))}/><Input label="Estimated duration (minutes)" type="number" value={taskForm.estimatedMinutes} onChange={(v)=>setTaskForm((s)=>({...s,estimatedMinutes:v}))}/><button disabled={busy} className="self-end rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground">{busy?"Saving…":"Save personal task"}</button></form></Panel>}
          <Panel title={`Task list · ${tasks.length}`}><div className="space-y-3">{tasks.map((t)=><article id={"employee-task-"+t._id} key={t._id} className="rounded-xl border border-white/10 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{t.title}</h3><button onClick={()=>void openTaskActivity(t._id)} className="rounded-lg border border-white/10 px-2 py-1 text-xs">{taskActivityId===t._id?"Hide activity":"History & comments"}</button><Badge value={t.taskType}/><Badge value={t.priority}/></div>{t.description&&<p className="mt-2 text-sm text-muted-foreground">{t.description}</p>}<p className="mt-2 text-xs text-muted-foreground">Deadline: {fmtDateTime(t.deadlineAt)}</p>{t.completionNotes&&<p className="mt-1 text-xs text-muted-foreground">Completion note: {t.completionNotes}</p>}{t.assignees && t.assignees.length>1 && <p className="mt-1 text-xs text-muted-foreground">Shared with: {t.assignees.filter((a)=>a.employeeId!==employee?.id).map((a)=>a.name).join(", ") || "your team"}</p>}<div className="mt-3 flex flex-wrap gap-2">{(t.attachments||[]).map((a)=><span key={a._id} className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2 py-1"><button onClick={()=>void downloadTaskAttachment(t._id,a)} className="text-xs underline">{a.originalFileName}</button>{a.uploadedByUserId===employee?.accountUserId&&<button aria-label={"Delete "+a.originalFileName} onClick={()=>void deleteTaskAttachment(t._id,a)} className="px-1 text-xs text-red-300">×</button>}</span>)}<label className="cursor-pointer rounded-lg border border-white/10 px-2 py-1 text-xs">+ Attach file<input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" className="sr-only" onChange={(event)=>{const file=event.target.files?.[0];if(file)void uploadTaskAttachment(t._id,file);event.target.value="";}}/></label></div></div><Badge value={t.status}/></div><div className="mt-3 flex flex-wrap gap-2">{t.status!=="COMPLETED"&&t.status!=="CANCELLED"&&<><button onClick={()=>void updateTask(t,"IN_PROGRESS")} className="rounded-lg border border-white/10 px-3 py-1.5 text-xs">Start / in progress</button><button onClick={()=>void updateTask(t,"ON_HOLD")} className="rounded-lg border border-white/10 px-3 py-1.5 text-xs">On hold</button><button onClick={()=>void updateTask(t,"COMPLETED")} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">Complete</button></>}</div></article>)}{tasks.length===0&&<p className="py-8 text-center text-sm text-muted-foreground">You have no tasks assigned yet.</p>}</div></Panel>
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
          <Panel title="Lead history"><div className="space-y-3">{leads.map((l)=><article id={"employee-lead-"+l._id} key={l._id} className="rounded-xl border border-white/10 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold">{l.clientName}</h3><p className="mt-1 text-xs text-muted-foreground">{l.clientPhone} · {projectName(l.projectId)} · {l.source}</p><p className="mt-1 text-xs text-muted-foreground">TRV-L-{String(l.leadNo||"").padStart(6,"0")} · Created {fmtDate(l.createdAt)}</p></div><div className="flex flex-wrap gap-2"><Badge value={l.stage}/><Badge value={l.leadTemperature||"UNRATED"}/></div></div><div className="mt-3 flex flex-wrap items-center gap-2"><label className="text-xs text-muted-foreground">Update stage</label><select aria-label={`Stage for ${l.clientName}`} value={l.stage} onChange={(e)=>void updateLeadStage(l,e.target.value)} className="rounded-lg border border-white/10 bg-background px-2 py-1.5 text-xs">{["GENERATED","CONTACTED","INTERESTED","SITE_VISIT","NEGOTIATION","LOST"].map((v)=><option key={v}>{v}</option>)}</select><button onClick={()=>{setCallForm((s)=>({...s,leadId:l._id}));setTab("telecalling");}} className="rounded-lg border border-white/10 px-3 py-1.5 text-xs">Log a call</button><button onClick={()=>{setVisitForm((s)=>({...s,leadId:l._id}));setTab("visits");}} className="rounded-lg border border-white/10 px-3 py-1.5 text-xs">Propose visit</button></div><p className="mt-2 text-xs text-muted-foreground">Next follow-up: {fmtDateTime(l.nextFollowUpAt)}</p></article>)}{leads.length===0&&<p className="py-8 text-center text-sm text-muted-foreground">No submitted or assigned leads yet.</p>}</div></Panel>
        </div>}

        {tab==="buyer_leads" && <div className="space-y-4">
          {/* Header & Quick Action */}
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold flex items-center gap-2">
                <Megaphone size={19} className="text-sky-400" />
                Buyer CRM Hub
              </h2>
              <p className="mt-1 text-xs sm:text-sm text-muted-foreground">
                Inbound buyer leads, Meta Ads inquiries, and direct telecalling. 1-tap Call, WhatsApp, and Site Visits.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowAddLeadModal(true)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 px-3.5 py-2 text-xs font-semibold text-white shadow-md shadow-sky-500/25 hover:from-sky-400 hover:to-blue-500 active:scale-95 transition"
              >
                <Plus size={14} /> Add Buyer Lead
              </button>
              <button
                type="button"
                onClick={() => void loadCrmLeads()}
                disabled={crmLoading}
                aria-label="Refresh buyer leads"
                className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold hover:bg-white/10 active:scale-95 transition"
              >
                <RefreshCw size={13} className={crmLoading ? "animate-spin" : ""} />
                <span className="hidden sm:inline">Refresh</span>
              </button>
            </div>
          </div>

          {/* Quick Metrics KPI Bar */}
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <button
              type="button"
              onClick={() => setCrmQuickFilter("ALL")}
              className={`text-left rounded-xl border p-3 transition ${
                crmQuickFilter === "ALL"
                  ? "border-sky-500/50 bg-sky-500/10 shadow-sm"
                  : "border-white/10 bg-card/60 hover:bg-white/5"
              }`}
            >
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Total Leads</span>
                <Users size={14} className="text-sky-400" />
              </div>
              <p className="mt-1.5 text-xl font-bold">{filterCounts.all}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">In active pipeline</p>
            </button>

            <button
              type="button"
              onClick={() => setCrmQuickFilter("DUE")}
              className={`text-left rounded-xl border p-3 transition ${
                crmQuickFilter === "DUE"
                  ? "border-amber-500/50 bg-amber-500/10 shadow-sm"
                  : "border-white/10 bg-card/60 hover:bg-white/5"
              }`}
            >
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Follow-ups Due</span>
                <Clock3 size={14} className="text-amber-400" />
              </div>
              <p className="mt-1.5 text-xl font-bold text-amber-400">{filterCounts.due}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">Action needed</p>
            </button>

            <button
              type="button"
              onClick={() => setCrmQuickFilter("VISITS")}
              className={`text-left rounded-xl border p-3 transition ${
                crmQuickFilter === "VISITS"
                  ? "border-cyan-500/50 bg-cyan-500/10 shadow-sm"
                  : "border-white/10 bg-card/60 hover:bg-white/5"
              }`}
            >
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Site Visits</span>
                <MapPin size={14} className="text-cyan-400" />
              </div>
              <p className="mt-1.5 text-xl font-bold text-cyan-400">{filterCounts.visits}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">Scheduled & done</p>
            </button>

            <button
              type="button"
              onClick={() => setCrmQuickFilter("WON")}
              className={`text-left rounded-xl border p-3 transition ${
                crmQuickFilter === "WON"
                  ? "border-emerald-500/50 bg-emerald-500/10 shadow-sm"
                  : "border-white/10 bg-card/60 hover:bg-white/5"
              }`}
            >
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Booked & Won</span>
                <CheckCircle2 size={14} className="text-emerald-400" />
              </div>
              <p className="mt-1.5 text-xl font-bold text-emerald-400">{filterCounts.won}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">Token received</p>
            </button>
          </div>

          {/* Sticky Search & Filter Strip */}
          <div className="space-y-2.5 rounded-2xl border border-white/10 bg-card/70 p-3 sm:p-3.5 backdrop-blur-sm">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              <div className="relative">
                <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  aria-label="Search buyer leads"
                  value={crmSearch}
                  onChange={(e) => setCrmSearch(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-background/80 pl-9 pr-8 py-2 text-xs text-foreground outline-none focus:border-sky-400"
                  placeholder="Search name, phone, notes, ad campaign…"
                />
                {crmSearch && (
                  <button
                    type="button"
                    onClick={() => setCrmSearch("")}
                    aria-label="Clear search"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              <select
                aria-label="Filter by project site"
                value={crmSite}
                onChange={(e) => setCrmSite(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-background/80 px-3 py-2 text-xs text-foreground outline-none focus:border-sky-400"
              >
                <option value="">All Projects & Sites ({projects.length})</option>
                {projects.map((p) => (
                  <option key={p._id} value={p._id}>
                    {p.name} {p.city ? `(${p.city})` : ""}
                  </option>
                ))}
              </select>

              <select
                aria-label="Filter by stage"
                value={crmStage}
                onChange={(e) => setCrmStage(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-background/80 px-3 py-2 text-xs text-foreground outline-none focus:border-sky-400 sm:col-span-2 lg:col-span-1"
              >
                <option value="">All Pipeline Stages</option>
                <option value="NEW">New ({crmLeads.filter((l) => l.status === "NEW").length})</option>
                <option value="CONTACTED">Contacted ({crmLeads.filter((l) => l.status === "CONTACTED").length})</option>
                <option value="QUALIFIED">Qualified ({crmLeads.filter((l) => l.status === "QUALIFIED").length})</option>
                <option value="SITE_VISIT_SCHEDULED">Visit Scheduled ({crmLeads.filter((l) => l.status === "SITE_VISIT_SCHEDULED").length})</option>
                <option value="SITE_VISIT_COMPLETED">Visit Completed ({crmLeads.filter((l) => l.status === "SITE_VISIT_COMPLETED").length})</option>
                <option value="BOOKING_TOKEN">Booking Token ({crmLeads.filter((l) => l.status === "BOOKING_TOKEN").length})</option>
                <option value="CONVERTED">Converted / Won ({crmLeads.filter((l) => l.status === "CONVERTED").length})</option>
                <option value="LOST">Lost ({crmLeads.filter((l) => l.status === "LOST").length})</option>
              </select>
            </div>

            {/* Quick Filter Pill Slider */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-0.5 no-scrollbar">
              {[
                { id: "ALL", label: `All (${filterCounts.all})` },
                { id: "DUE", label: `⏰ Due (${filterCounts.due})`, highlight: filterCounts.due > 0 },
                { id: "NEW", label: `New (${filterCounts.new})` },
                { id: "CONTACTED", label: `Contacted (${filterCounts.contacted})` },
                { id: "QUALIFIED", label: `Qualified (${filterCounts.qualified})` },
                { id: "VISITS", label: `Visits (${filterCounts.visits})` },
                { id: "WON", label: `Won (${filterCounts.won})` },
                { id: "LOST", label: `Lost (${filterCounts.lost})` },
              ].map((pill) => (
                <button
                  key={pill.id}
                  type="button"
                  onClick={() => setCrmQuickFilter(pill.id)}
                  className={`shrink-0 rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                    crmQuickFilter === pill.id
                      ? "bg-sky-500 text-white shadow-sm shadow-sky-500/30"
                      : pill.highlight
                      ? "border border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20"
                      : "border border-white/10 bg-white/5 text-muted-foreground hover:bg-white/10"
                  }`}
                >
                  {pill.label}
                </button>
              ))}
            </div>
          </div>

          {/* Lead Card Feed */}
          <div className="space-y-3">
            {crmLoading ? (
              <div className="rounded-2xl border border-white/10 bg-card/50 p-8 text-center text-xs text-muted-foreground">
                <RefreshCw size={18} className="mx-auto mb-2 animate-spin text-sky-400" />
                Loading buyer leads…
              </div>
            ) : filteredCrmLeads.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-card/50 p-8 text-center text-xs text-muted-foreground">
                <Users size={24} className="mx-auto mb-2 text-muted-foreground/60" />
                <p className="font-semibold text-foreground">No buyer leads found</p>
                <p className="mt-1">Try clearing your filters or adding a new buyer inquiry.</p>
                <button
                  type="button"
                  onClick={() => { setCrmQuickFilter("ALL"); setCrmSearch(""); setCrmStage(""); setCrmSite(""); }}
                  className="mt-3 inline-flex items-center gap-1 rounded-lg border border-white/15 px-3 py-1.5 text-xs text-foreground hover:bg-white/5"
                >
                  Clear all filters
                </button>
              </div>
            ) : (
              filteredCrmLeads.map((lead: any) => {
                const cleanPhone = (lead.phone || "").replace(/\D/g, "").slice(-10);
                const agentName = employee?.name ? employee.name.split(" ")[0] : "Truvi Team";
                const projName = lead.project?.name || "premium residential projects";
                const waMessage = `Hello ${lead.fullName || "Sir/Madam"},\n\nThis is ${agentName} from *Truvi* regarding your enquiry for *${projName}*.\n\nI have the complete digital brochure, floor plans, and pricing ready to share with you. When is a good time to speak or arrange an exclusive site walkthrough?\n\nBest regards,\n${agentName} · Truvi`;
                const waUrl = `https://wa.me/91${cleanPhone}?text=${encodeURIComponent(waMessage)}`;
                const telUrl = `tel:+91${cleanPhone}`;

                // Calculate follow-up status
                let followUpStatus: { label: string; tone: string; isOverdue?: boolean } | null = null;
                if (lead.nextFollowUpAt) {
                  const d = new Date(lead.nextFollowUpAt);
                  const diffHours = (d.getTime() - Date.now()) / (1000 * 60 * 60);
                  const timeFormatted = d.toLocaleDateString("en-IN", { month: "short", day: "numeric" }) + " " + d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true });
                  if (diffHours < 0) {
                    followUpStatus = { label: `Overdue: ${timeFormatted}`, tone: "border-rose-500/40 bg-rose-500/10 text-rose-300", isOverdue: true };
                  } else if (diffHours <= 14) {
                    followUpStatus = { label: `Due Today: ${timeFormatted}`, tone: "border-amber-500/40 bg-amber-500/10 text-amber-300" };
                  } else if (diffHours <= 38) {
                    followUpStatus = { label: `Tomorrow: ${timeFormatted}`, tone: "border-sky-500/40 bg-sky-500/10 text-sky-300" };
                  } else {
                    followUpStatus = { label: timeFormatted, tone: "border-white/10 bg-white/5 text-muted-foreground" };
                  }
                }

                return (
                  <article
                    key={lead._id}
                    className="rounded-2xl border border-white/10 bg-card/90 backdrop-blur-sm p-4 sm:p-5 shadow-sm space-y-3.5 transition hover:border-white/20"
                  >
                    {/* Header Row: Name, Duplicate Tag, Project Pill, Source */}
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-base font-bold text-foreground truncate">{lead.fullName}</h3>
                          {lead.isDuplicate && (
                            <span className="rounded-full border border-purple-500/30 bg-purple-500/10 px-2 py-0.5 text-[10px] font-semibold text-purple-300">
                              Repeat x{lead.duplicateCount || 2}
                            </span>
                          )}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <a href={telUrl} className="inline-flex items-center gap-1 font-semibold text-emerald-400 hover:text-emerald-300">
                            <Phone size={12} /> +91 {cleanPhone}
                          </a>
                          {lead.email && <span className="truncate">· {lead.email}</span>}
                          <span>· {fmtDate(lead.createdAt)}</span>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                        {lead.project ? (
                          <span className="inline-flex items-center gap-1 rounded-lg border border-sky-500/30 bg-sky-500/10 px-2.5 py-1 text-xs font-semibold text-sky-300">
                            <Building2 size={12} /> {lead.project.name}
                          </span>
                        ) : (
                          <span className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-muted-foreground">
                            General Requirement
                          </span>
                        )}
                        {lead.source === "META_AD" ? (
                          <span className="inline-flex items-center gap-1 rounded-lg border border-blue-500/30 bg-blue-500/10 px-2 py-1 text-xs font-medium text-blue-300" title={lead.providerCampaignName || "Meta Ad"}>
                            <Megaphone size={11} /> Meta Ad
                          </span>
                        ) : (
                          <span className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-muted-foreground">
                            {lead.source.replaceAll("_", " ")}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Key Buying Intent / Requirements */}
                    {(lead.budgetRange || lead.propertyType || lead.preferredLocation || lead.requirement) && (
                      <div className="rounded-xl border border-white/5 bg-white/[0.02] p-2.5 text-xs text-muted-foreground space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          {lead.budgetRange && (
                            <span className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 font-semibold text-emerald-300">
                              Budget: {lead.budgetRange}
                            </span>
                          )}
                          {lead.propertyType && (
                            <span className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-foreground font-medium">
                              {lead.propertyType}
                            </span>
                          )}
                          {lead.preferredLocation && (
                            <span className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-foreground font-medium">
                              📍 {lead.preferredLocation}
                            </span>
                          )}
                        </div>
                        {lead.requirement && (
                          <p className="text-foreground/90 italic line-clamp-2">“{lead.requirement}”</p>
                        )}
                      </div>
                    )}

                    {/* Follow-up Strip */}
                    <div className="rounded-xl border border-white/5 bg-white/[0.015] p-2.5 text-xs flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-muted-foreground">Follow-up:</span>
                        {followUpStatus ? (
                          <span className={`inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 font-semibold text-[11px] ${followUpStatus.tone}`}>
                            <Clock3 size={11} />
                            {followUpStatus.label}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/70">None scheduled</span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-1">
                        {lead.nextFollowUpAt ? (
                          <>
                            <button
                              type="button"
                              onClick={() => { setFollowUpScheduleLead(lead); setFollowUpCustomDate(""); }}
                              className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[11px] font-medium text-muted-foreground hover:bg-white/10"
                            >
                              Reschedule
                            </button>
                            <button
                              type="button"
                              onClick={() => void updateCrmLeadFollowUp(lead._id, null, "Follow-up reminder cleared.")}
                              className="rounded-lg border border-white/10 bg-white/5 px-1.5 py-1 text-[11px] text-muted-foreground hover:text-rose-400 hover:bg-white/10"
                              title="Clear follow-up"
                            >
                              <X size={12} />
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => void handleQuickFollowUp(lead, "today_5pm")}
                              className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[11px] hover:border-amber-500/40 hover:bg-amber-500/10 hover:text-amber-300"
                            >
                              Today 5 PM
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleQuickFollowUp(lead, "tomorrow_11am")}
                              className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[11px] hover:border-sky-500/40 hover:bg-sky-500/10 hover:text-sky-300"
                            >
                              Tomorrow 11 AM
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleQuickFollowUp(lead, "in_2d")}
                              className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[11px] hover:border-sky-500/40 hover:bg-sky-500/10 hover:text-sky-300"
                            >
                              In 2 Days
                            </button>
                            <button
                              type="button"
                              onClick={() => { setFollowUpScheduleLead(lead); setFollowUpCustomDate(""); }}
                              className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[11px] font-medium text-sky-400 hover:bg-white/10"
                            >
                              Custom 📅
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Primary 1-Tap Action Bar (44px+ min touch targets for phone) */}
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 pt-1">
                      {/* Direct Phone Call Button */}
                      <a
                        href={telUrl}
                        className="flex h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white font-bold text-xs shadow-md shadow-emerald-950/40 active:scale-[0.98] transition"
                      >
                        <Phone size={15} /> Call Now
                      </a>

                      {/* Direct WhatsApp Button */}
                      <a
                        href={waUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex h-11 items-center justify-center gap-2 rounded-xl bg-[#25D366]/20 border border-[#25D366]/40 hover:bg-[#25D366]/30 text-emerald-300 font-bold text-xs active:scale-[0.98] transition"
                      >
                        <MessageCircle size={16} /> WhatsApp
                      </a>

                      {/* Direct Site Visit Scheduler Button */}
                      <button
                        type="button"
                        onClick={() => {
                          setVisitScheduleLead(lead);
                          const tomorrow = new Date();
                          tomorrow.setDate(tomorrow.getDate() + 1);
                          tomorrow.setHours(11, 0, 0, 0);
                          setVisitScheduleForm({ scheduledAt: tomorrow.toISOString().slice(0, 16), notes: "" });
                        }}
                        className="flex h-11 items-center justify-center gap-1.5 rounded-xl border border-sky-500/40 bg-sky-500/15 hover:bg-sky-500/25 text-sky-300 font-semibold text-xs active:scale-[0.98] transition"
                      >
                        <MapPin size={14} /> Schedule Visit
                      </button>

                      {/* Activity & History Toggle */}
                      <button
                        type="button"
                        onClick={() => void toggleCrmLeadHistory(lead._id)}
                        className={`flex h-11 items-center justify-center gap-1.5 rounded-xl border text-xs font-semibold active:scale-[0.98] transition ${
                          crmExpandedId === lead._id
                            ? "border-sky-500/50 bg-sky-500/20 text-sky-300"
                            : "border-white/10 bg-white/5 hover:bg-white/10 text-foreground"
                        }`}
                      >
                        <ClipboardList size={14} />
                        <span>Activity & Notes</span>
                        {crmExpandedId === lead._id ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                      </button>
                    </div>

                    {/* Stage Selector Dropdown Strip */}
                    <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2 border-t border-white/5">
                      <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                        <label className="text-xs font-semibold text-muted-foreground shrink-0">Pipeline Stage:</label>
                        <select
                          aria-label={`Stage for ${lead.fullName}`}
                          value={lead.status}
                          onChange={(e) => void updateCrmLeadStage(lead._id, e.target.value)}
                          className="w-full max-w-[260px] rounded-xl border border-white/15 bg-background px-3 py-1.5 text-xs font-semibold text-foreground outline-none focus:border-sky-400"
                        >
                          <option value="NEW">🆕 New Lead</option>
                          <option value="CONTACTED">📞 Contacted</option>
                          <option value="QUALIFIED">🎯 Qualified</option>
                          <option value="SITE_VISIT_SCHEDULED">🚗 Visit Scheduled</option>
                          <option value="SITE_VISIT_COMPLETED">✅ Visit Completed</option>
                          <option value="BOOKING_TOKEN">💰 Booking Token</option>
                          <option value="CONVERTED">🏆 Converted / Won</option>
                          <option value="LOST">❌ Lost</option>
                        </select>
                      </div>

                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <span>Assigned to:</span>
                        <strong className="text-foreground">
                          {lead.assignedTo?.name ? (lead.assignedTo.name === employee?.name ? "You" : lead.assignedTo.name) : "You"}
                        </strong>
                      </div>
                    </div>

                    {/* Activity Panel Drawer (Expanded) */}
                    {crmExpandedId === lead._id && (
                      <div className="border-t border-white/10 pt-3.5 space-y-3">
                        <div className="flex items-center justify-between">
                          <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                            <ClipboardList size={13} className="text-sky-400" />
                            Activity Timeline & Notes
                          </h4>
                          <span className="text-[11px] text-muted-foreground">{crmActivities.length} logs recorded</span>
                        </div>

                        {/* 1-Tap Quick Action Log Buttons for Telecallers */}
                        <div className="space-y-1.5">
                          <p className="text-[11px] font-semibold text-muted-foreground">1-Tap Quick Log Preset:</p>
                          <div className="flex flex-wrap gap-1.5">
                            {[
                              { type: "CALL" as const, label: "📵 Not Reachable" },
                              { type: "CALL" as const, label: "🔄 Callback Requested" },
                              { type: "WHATSAPP" as const, label: "📄 Brochure Shared on WA" },
                              { type: "NOTE" as const, label: "🚗 Visit Confirmed" },
                              { type: "NOTE" as const, label: "💰 Price Negotiation" },
                              { type: "NOTE" as const, label: "❌ Budget Mismatch" },
                            ].map((preset) => (
                              <button
                                key={preset.label}
                                type="button"
                                onClick={() => void logPresetActivity(lead._id, preset.type, preset.label)}
                                className="rounded-lg border border-white/10 bg-white/5 hover:border-sky-500/40 hover:bg-sky-500/10 hover:text-sky-300 px-2.5 py-1 text-[11px] font-medium text-muted-foreground active:scale-95 transition"
                              >
                                {preset.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Custom Note Logger */}
                        <div className="flex flex-wrap gap-2 pt-1">
                          <select
                            value={crmActType}
                            onChange={(e) => setCrmActType(e.target.value as any)}
                            className="rounded-xl border border-white/15 bg-background px-2.5 py-2 text-xs font-medium text-foreground outline-none shrink-0"
                          >
                            <option value="CALL">📞 Call</option>
                            <option value="WHATSAPP">💬 WhatsApp</option>
                            <option value="NOTE">📝 Note</option>
                          </select>
                          <input
                            value={crmNote}
                            onChange={(e) => setCrmNote(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") void logCrmActivity(lead._id); }}
                            className="flex-1 min-w-[200px] rounded-xl border border-white/15 bg-background px-3 py-2 text-xs outline-none focus:border-sky-400"
                            placeholder="Add call outcome or conversation note…"
                          />
                          <button
                            type="button"
                            onClick={() => void logCrmActivity(lead._id)}
                            className="rounded-xl bg-sky-600 hover:bg-sky-500 px-4 py-2 text-xs font-bold text-white shadow-sm active:scale-95 transition shrink-0"
                          >
                            Save Note
                          </button>
                        </div>

                        {/* Activity History Feed */}
                        {crmActivities.length ? (
                          <div className="max-h-52 space-y-2 overflow-y-auto pr-1">
                            {crmActivities.map((act: any) => (
                              <div key={act._id} className="rounded-xl border border-white/5 bg-white/[0.025] p-2.5 text-xs space-y-1">
                                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                                  <strong className="text-foreground">
                                    {act.type === "CALL" ? "📞 Call" : act.type === "WHATSAPP" ? "💬 WhatsApp" : act.type === "FOLLOW_UP" ? "⏰ Follow-up" : act.type === "STATUS" ? "🔄 Status" : "📝 Note"}
                                    {act.actor ? ` · ${act.actor}` : ""}
                                  </strong>
                                  <span>{fmtDateTime(act.createdAt)}</span>
                                </div>
                                <p className="text-muted-foreground whitespace-pre-wrap">{act.content}</p>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="py-2 text-center text-xs text-muted-foreground">No notes logged yet.</p>
                        )}
                      </div>
                    )}
                  </article>
                );
              })
            )}
          </div>

          {/* Modal: Add New Buyer Lead (Mobile Bottom Sheet / Desktop Modal) */}
          {showAddLeadModal && (
            <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4">
              <div className="w-full max-w-lg rounded-t-3xl sm:rounded-2xl border border-white/15 bg-slate-900/95 p-5 sm:p-6 text-foreground shadow-2xl max-h-[92vh] overflow-y-auto space-y-4">
                <div className="flex items-center justify-between border-b border-white/10 pb-3">
                  <div>
                    <h3 className="text-base font-bold flex items-center gap-2">
                      <Plus size={16} className="text-sky-400" />
                      Add Buyer Lead
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">Quickly record a walk-in, call enquiry, or direct buyer.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowAddLeadModal(false)}
                    className="rounded-lg p-1.5 text-muted-foreground hover:bg-white/10 hover:text-foreground"
                  >
                    <X size={18} />
                  </button>
                </div>

                <form onSubmit={submitCreateBuyerLead} className="space-y-3.5">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block space-y-1 text-xs">
                      <span className="font-semibold text-muted-foreground">Buyer Full Name *</span>
                      <input
                        required
                        value={newLeadForm.fullName}
                        onChange={(e) => setNewLeadForm((s) => ({ ...s, fullName: e.target.value }))}
                        className="w-full rounded-xl border border-white/15 bg-background px-3 py-2.5 text-xs outline-none focus:border-sky-400"
                        placeholder="e.g. Rahul Sharma"
                      />
                    </label>

                    <label className="block space-y-1 text-xs">
                      <span className="font-semibold text-muted-foreground">Phone Number *</span>
                      <input
                        required
                        type="tel"
                        value={newLeadForm.phone}
                        onChange={(e) => setNewLeadForm((s) => ({ ...s, phone: e.target.value }))}
                        className="w-full rounded-xl border border-white/15 bg-background px-3 py-2.5 text-xs outline-none focus:border-sky-400"
                        placeholder="10-digit mobile number"
                      />
                    </label>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block space-y-1 text-xs">
                      <span className="font-semibold text-muted-foreground">Interested Project / Site</span>
                      <select
                        value={newLeadForm.projectId}
                        onChange={(e) => setNewLeadForm((s) => ({ ...s, projectId: e.target.value }))}
                        className="w-full rounded-xl border border-white/15 bg-background px-3 py-2.5 text-xs outline-none focus:border-sky-400"
                      >
                        <option value="">General Requirement (Not project specific)</option>
                        {projects.map((p) => (
                          <option key={p._id} value={p._id}>
                            {p.name} {p.city ? `(${p.city})` : ""}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="block space-y-1 text-xs">
                      <span className="font-semibold text-muted-foreground">Enquiry Source</span>
                      <select
                        value={newLeadForm.source}
                        onChange={(e) => setNewLeadForm((s) => ({ ...s, source: e.target.value }))}
                        className="w-full rounded-xl border border-white/15 bg-background px-3 py-2.5 text-xs outline-none focus:border-sky-400"
                      >
                        <option value="TELECALLER">Telecalling</option>
                        <option value="WHATSAPP">WhatsApp</option>
                        <option value="CUSTOMER_REFERRAL">Customer Referral</option>
                        <option value="WEBSITE">Website Enquiry</option>
                        <option value="OTHER">Other / Walk-in</option>
                      </select>
                    </label>
                  </div>

                  {/* Budget & Property Type */}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block space-y-1 text-xs">
                      <span className="font-semibold text-muted-foreground">Budget Range</span>
                      <input
                        value={newLeadForm.budgetRange}
                        onChange={(e) => setNewLeadForm((s) => ({ ...s, budgetRange: e.target.value }))}
                        className="w-full rounded-xl border border-white/15 bg-background px-3 py-2.5 text-xs outline-none focus:border-sky-400"
                        placeholder="e.g. ₹1.5 - 2 Cr"
                      />
                    </label>

                    <label className="block space-y-1 text-xs">
                      <span className="font-semibold text-muted-foreground">Property Type</span>
                      <select
                        value={newLeadForm.propertyType}
                        onChange={(e) => setNewLeadForm((s) => ({ ...s, propertyType: e.target.value }))}
                        className="w-full rounded-xl border border-white/15 bg-background px-3 py-2.5 text-xs outline-none focus:border-sky-400"
                      >
                        <option value="">Select Property Type</option>
                        <option value="1 BHK">1 BHK</option>
                        <option value="2 BHK">2 BHK</option>
                        <option value="3 BHK">3 BHK</option>
                        <option value="4 BHK">4 BHK</option>
                        <option value="Penthouse">Penthouse</option>
                        <option value="Luxury Villa">Luxury Villa</option>
                        <option value="Commercial Space">Commercial Space</option>
                        <option value="Residential Plot">Residential Plot</option>
                      </select>
                    </label>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block space-y-1 text-xs">
                      <span className="font-semibold text-muted-foreground">Email (Optional)</span>
                      <input
                        type="email"
                        value={newLeadForm.email}
                        onChange={(e) => setNewLeadForm((s) => ({ ...s, email: e.target.value }))}
                        className="w-full rounded-xl border border-white/15 bg-background px-3 py-2.5 text-xs outline-none focus:border-sky-400"
                        placeholder="buyer@example.com"
                      />
                    </label>

                    <label className="block space-y-1 text-xs">
                      <span className="font-semibold text-muted-foreground">Preferred Location</span>
                      <input
                        value={newLeadForm.preferredLocation}
                        onChange={(e) => setNewLeadForm((s) => ({ ...s, preferredLocation: e.target.value }))}
                        className="w-full rounded-xl border border-white/15 bg-background px-3 py-2.5 text-xs outline-none focus:border-sky-400"
                        placeholder="e.g. Golf Course Extn, Sector 65"
                      />
                    </label>
                  </div>

                  <label className="block space-y-1 text-xs">
                    <span className="font-semibold text-muted-foreground">Buyer Requirement Notes</span>
                    <textarea
                      rows={2}
                      value={newLeadForm.requirement}
                      onChange={(e) => setNewLeadForm((s) => ({ ...s, requirement: e.target.value }))}
                      className="w-full rounded-xl border border-white/15 bg-background px-3 py-2 text-xs outline-none focus:border-sky-400"
                      placeholder="Any specific preferences, timeline, family requirements…"
                    />
                  </label>

                  <label className="block space-y-1 text-xs">
                    <span className="font-semibold text-muted-foreground">Initial Follow-up Date/Time (Optional)</span>
                    <input
                      type="datetime-local"
                      value={newLeadForm.nextFollowUpAt}
                      onChange={(e) => setNewLeadForm((s) => ({ ...s, nextFollowUpAt: e.target.value }))}
                      className="w-full rounded-xl border border-white/15 bg-background px-3 py-2.5 text-xs outline-none focus:border-sky-400"
                    />
                  </label>

                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/10">
                    <button
                      type="button"
                      onClick={() => setShowAddLeadModal(false)}
                      className="rounded-xl border border-white/15 px-4 py-2.5 text-xs font-semibold text-muted-foreground hover:bg-white/5"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={addLeadBusy}
                      className="rounded-xl bg-sky-600 hover:bg-sky-500 px-5 py-2.5 text-xs font-bold text-white shadow-md disabled:opacity-50"
                    >
                      {addLeadBusy ? "Saving Lead…" : "Save Buyer Lead"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Modal: Schedule Site Visit (Mobile Optimized) */}
          {visitScheduleLead && (
            <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4">
              <div className="w-full max-w-md rounded-t-3xl sm:rounded-2xl border border-white/15 bg-slate-900/95 p-5 sm:p-6 text-foreground shadow-2xl space-y-4">
                <div className="flex items-center justify-between border-b border-white/10 pb-3">
                  <div>
                    <h3 className="text-base font-bold flex items-center gap-2">
                      <MapPin size={16} className="text-sky-400" />
                      Schedule Site Visit
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      For {visitScheduleLead.fullName} · {visitScheduleLead.phone}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setVisitScheduleLead(null)}
                    className="rounded-lg p-1.5 text-muted-foreground hover:bg-white/10 hover:text-foreground"
                  >
                    <X size={18} />
                  </button>
                </div>

                <form onSubmit={handleSaveSiteVisit} className="space-y-3.5">
                  <div className="rounded-xl border border-sky-500/20 bg-sky-500/10 p-3 text-xs text-sky-200">
                    Project: <strong>{visitScheduleLead.project?.name || "Premier Residential Site"}</strong>
                  </div>

                  <label className="block space-y-1 text-xs">
                    <span className="font-semibold text-muted-foreground">Visit Date & Time *</span>
                    <input
                      required
                      type="datetime-local"
                      value={visitScheduleForm.scheduledAt}
                      onChange={(e) => setVisitScheduleForm((s) => ({ ...s, scheduledAt: e.target.value }))}
                      className="w-full rounded-xl border border-white/15 bg-background px-3 py-2.5 text-xs outline-none focus:border-sky-400"
                    />
                  </label>

                  <label className="block space-y-1 text-xs">
                    <span className="font-semibold text-muted-foreground">Visit Notes / Client Preference</span>
                    <textarea
                      rows={3}
                      value={visitScheduleForm.notes}
                      onChange={(e) => setVisitScheduleForm((s) => ({ ...s, notes: e.target.value }))}
                      className="w-full rounded-xl border border-white/15 bg-background px-3 py-2 text-xs outline-none focus:border-sky-400"
                      placeholder="e.g. Visiting with family on Sunday 11 AM to see 3 BHK sample flat…"
                    />
                  </label>

                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/10">
                    <button
                      type="button"
                      onClick={() => setVisitScheduleLead(null)}
                      className="rounded-xl border border-white/15 px-4 py-2.5 text-xs font-semibold text-muted-foreground hover:bg-white/5"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={visitScheduleBusy}
                      className="rounded-xl bg-sky-600 hover:bg-sky-500 px-5 py-2.5 text-xs font-bold text-white shadow-md disabled:opacity-50"
                    >
                      {visitScheduleBusy ? "Scheduling…" : "Confirm Site Visit"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Modal: Custom Follow-up Reminder */}
          {followUpScheduleLead && (
            <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4">
              <div className="w-full max-w-md rounded-t-3xl sm:rounded-2xl border border-white/15 bg-slate-900/95 p-5 text-foreground shadow-2xl space-y-4">
                <div className="flex items-center justify-between border-b border-white/10 pb-3">
                  <div>
                    <h3 className="text-base font-bold flex items-center gap-2">
                      <Clock3 size={16} className="text-amber-400" />
                      Set Follow-up Reminder
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      For {followUpScheduleLead.fullName} · {followUpScheduleLead.phone}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFollowUpScheduleLead(null)}
                    className="rounded-lg p-1.5 text-muted-foreground hover:bg-white/10 hover:text-foreground"
                  >
                    <X size={18} />
                  </button>
                </div>

                <form onSubmit={handleSaveCustomFollowUp} className="space-y-3.5">
                  <label className="block space-y-1 text-xs">
                    <span className="font-semibold text-muted-foreground">Next Follow-up Date & Time *</span>
                    <input
                      required
                      type="datetime-local"
                      value={followUpCustomDate}
                      onChange={(e) => setFollowUpCustomDate(e.target.value)}
                      className="w-full rounded-xl border border-white/15 bg-background px-3 py-2.5 text-xs outline-none focus:border-sky-400"
                    />
                  </label>

                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/10">
                    <button
                      type="button"
                      onClick={() => setFollowUpScheduleLead(null)}
                      className="rounded-xl border border-white/15 px-4 py-2.5 text-xs font-semibold text-muted-foreground hover:bg-white/5"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={followUpBusy || !followUpCustomDate}
                      className="rounded-xl bg-amber-600 hover:bg-amber-500 px-5 py-2.5 text-xs font-bold text-white shadow-md disabled:opacity-50"
                    >
                      {followUpBusy ? "Saving…" : "Save Follow-up"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
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

        {tab==="projects" && canSubmitProjects && <div className="space-y-4">
          <Panel
            title="Submit a project listing"
            note="Use your own employee login. Choose the registered developer whose project this is; Truvi keeps your employee ID privately for tracking. Every listing is reviewed by Admin before it can appear publicly."
          >
            <form onSubmit={createEmployeeProject} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <Input label="Project name *" value={projectForm.name} onChange={(v)=>setProjectForm((s)=>({...s,name:v}))} required />
              <Select label="Registered developer *" required value={projectForm.developerId} onChange={(v)=>setProjectForm((s)=>({...s,developerId:v}))}
                options={[{value:"",label:"Choose developer"},...projectDevelopers.map((d)=>({value:d.id,label:d.companyName ? d.name + " · " + d.companyName : d.name}))]} />
              <Select label="Project type *" required value={projectForm.projectType} onChange={(v)=>setProjectForm((s)=>({...s,projectType:v}))}
                options={[
                  {value:"VILLA",label:"Villa"},{value:"PLOTTED",label:"Plotted development"},
                  {value:"APARTMENT",label:"Apartment"},{value:"COMMERCIAL",label:"Commercial"},
                  {value:"LAND",label:"Land"},{value:"INDUSTRIAL",label:"Industrial"},
                  {value:"MIXED_USE",label:"Mixed use"},{value:"RESIDENTIAL",label:"Residential"},
                ]} />
              <Input label="City *" value={projectForm.city} onChange={(v)=>setProjectForm((s)=>({...s,city:v}))} required />
              <Input label="Locality / location *" value={projectForm.location} onChange={(v)=>setProjectForm((s)=>({...s,location:v}))} required />
              <Input label="Total plots / units *" type="number" value={projectForm.totalUnits} onChange={(v)=>setProjectForm((s)=>({...s,totalUnits:v}))} required />
              <Select label="Approval authority" value={projectForm.approvalAuthority} onChange={(v)=>setProjectForm((s)=>({...s,approvalAuthority:v}))}
                options={[{value:"RERA",label:"RERA"},{value:"DISTRICT_PANCHAYAT",label:"District Panchayat"},{value:"DTCP",label:"DTCP"}]} />
              <Input label="RERA / approval number" value={projectForm.reraNumber} onChange={(v)=>setProjectForm((s)=>({...s,reraNumber:v}))} />
              <Input label="Expected possession date" type="date" value={projectForm.possessionDate} onChange={(v)=>setProjectForm((s)=>({...s,possessionDate:v}))} />
              <label className="block space-y-1.5 text-sm sm:col-span-2 xl:col-span-3">
                <span className="text-muted-foreground">Project description *</span>
                <textarea required minLength={10} maxLength={8000} rows={4} value={projectForm.description}
                  onChange={(e)=>setProjectForm((s)=>({...s,description:e.target.value}))}
                  className="w-full rounded-xl border border-white/10 bg-background px-3 py-2.5 outline-none focus:border-primary"
                  placeholder="Describe the project, facilities, development and key details…" />
              </label>
              <label className="block space-y-1.5 text-sm sm:col-span-2 xl:col-span-3">
                <span className="text-muted-foreground">Cover photo (JPG, PNG, WEBP) · optional while saving a draft</span>
                <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={(e)=>setProjectPhoto(e.target.files?.[0] ?? null)}
                  className="block w-full rounded-xl border border-white/10 bg-background px-3 py-2 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-primary file:px-3 file:py-2 file:text-primary-foreground" />
                {projectPhoto && <span className="text-xs text-emerald-300">Selected: {projectPhoto.name}</span>}
              </label>
              <div className="flex flex-wrap items-center gap-3 sm:col-span-2 xl:col-span-3">
                <button type="submit" disabled={projectSaving || projectDevelopers.length===0}
                  className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50">
                  <Plus size={16}/>{projectSaving ? "Saving listing…" : "Create project draft & submit"}
                </button>
                <span className="text-xs text-muted-foreground">No admin credentials are needed. Your employee account remains separate.</span>
              </div>
              {projectDevelopers.length===0 && <p className="text-xs text-amber-300 sm:col-span-2 xl:col-span-3">No active developer accounts are available. Ask Admin to register or activate the developer profile for this project.</p>}
            </form>
          </Panel>

          <Panel title="My submitted project listings" note="Track drafts and review status. Only listings submitted by your own employee account appear here.">
            {projectCenterLoading ? <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground"><RefreshCw size={16} className="animate-spin"/>Loading your project listings…</div>
              : projectSubmissions.length===0 ? <div className="py-8 text-center text-sm text-muted-foreground"><Building2 size={24} className="mx-auto mb-2"/>No project listings submitted yet.</div>
              : <div className="grid gap-3 lg:grid-cols-2">
                {projectSubmissions.map((project)=>(
                  <article key={project._id} className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.025]">
                    {project.coverImageUrl ? <img src={project.coverImageUrl} alt={project.name} className="h-40 w-full object-cover"/> : <div className="grid h-32 place-items-center bg-white/[0.03] text-muted-foreground"><Building2 size={28}/></div>}
                    <div className="space-y-3 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div><h3 className="font-semibold">{project.name}</h3><p className="mt-1 text-xs text-muted-foreground">{project.location}, {project.city} · {project.developerName}</p></div>
                        <Badge value={project.approvalStatus}/>
                      </div>
                      <p className="text-xs text-muted-foreground">{project.projectType || "Type pending"} · {project.totalUnits ?? "—"} plots / units · Created {fmtDate(project.createdAt)}</p>
                      {project.approvalStatus==="DRAFT" && <div className="space-y-2 border-t border-white/10 pt-3">
                        {!project.coverImageUrl && <label className="block text-xs text-muted-foreground">Upload a project photo to complete your listing<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="mt-2 block w-full text-xs" onChange={(e)=>{const file=e.target.files?.[0];if(file)void submitSavedProject(project._id,file);e.currentTarget.value="";}}/></label>}
                        {project.coverImageUrl && <button type="button" disabled={projectActionBusyId===project._id} onClick={()=>void submitSavedProject(project._id)} className="rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50">{projectActionBusyId===project._id?"Submitting…":"Submit draft for Admin review"}</button>}
                      </div>}
                      {project.approvalStatus==="PENDING" && <p className="border-t border-amber-500/20 pt-3 text-xs text-amber-300">Submitted. Waiting for Admin review.</p>}
                      {project.approvalStatus==="APPROVED" && <p className="border-t border-emerald-500/20 pt-3 text-xs text-emerald-300">Approved by Admin.</p>}
                      {project.approvalStatus==="REJECTED" && <p className="border-t border-rose-500/20 pt-3 text-xs text-rose-300">Returned by Admin. Contact Admin for the correction notes before creating a revised listing.</p>}
                    </div>
                  </article>
                ))}
              </div>}
          </Panel>
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

        {tab==="profile" && <Panel title="My employee profile" note="Update your personal details, verified contact information and account security. Employment records and permissions remain administrator-managed.">
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
          <form onSubmit={savePersonalProfile} className="truvi-profile-settings-card">
            <div className="truvi-profile-settings-card__heading"><div><h3>Personal details</h3><p>These details appear on your Truvi employee profile.</p></div></div>
            <div className="truvi-profile-personal-fields grid min-w-0 gap-4 sm:grid-cols-2">
              <label className="flex min-w-0 flex-col gap-2 text-sm"><span className="text-muted-foreground">Display name</span><input className="w-full min-w-0 rounded-xl border border-white/10 bg-background px-3 py-3 outline-none focus:border-primary" required minLength={2} maxLength={80} value={profileNameDraft} onChange={(event) => setProfileNameDraft(event.target.value)} autoComplete="name"/></label>
              <label className="flex min-w-0 flex-col gap-2 text-sm"><span className="text-muted-foreground">Bio / role summary</span><input className="w-full min-w-0 rounded-xl border border-white/10 bg-background px-3 py-3 outline-none focus:border-primary" maxLength={500} value={profileBioDraft} onChange={(event) => setProfileBioDraft(event.target.value)} placeholder="A short introduction (optional)"/></label>
            </div>
            <div className="truvi-profile-settings-actions"><span>Changes are saved to your own account.</span><button type="submit" disabled={contactBusy}>{contactBusy ? "Saving…" : "Save personal details"}</button></div>
          </form>

          <div className="truvi-profile-settings-grid">
            <section className="truvi-profile-settings-card">
              <div className="truvi-profile-settings-card__heading"><div><h3>Email address</h3><p>Verify the new address before it replaces your current email.</p></div><span className={"truvi-profile-verified " + (currentUser?.emailVerified ? "is-verified" : "is-pending")}>{currentUser?.emailVerified ? "Verified" : "Not verified"}</span></div>
              <form onSubmit={emailChangeRequested ? verifyEmailChange : requestEmailChange} className="space-y-3">
                <label className="block space-y-1.5 text-sm"><span className="text-muted-foreground">Current email</span><input value={currentUser?.email || employee?.officialEmail || ""} readOnly aria-label="Current email address"/></label>
                {!emailChangeRequested ? <>
                  <label className="block space-y-1.5 text-sm"><span className="text-muted-foreground">New email address</span><input type="email" required maxLength={254} value={profileEmailDraft} onChange={(event) => setProfileEmailDraft(event.target.value)} autoComplete="email" placeholder="name@company.com"/></label>
                  <button type="submit" disabled={contactBusy}>{contactBusy ? "Sending code…" : "Send email verification code"}</button>
                </> : <>
                  <label className="block space-y-1.5 text-sm"><span className="text-muted-foreground">6-digit code sent to {profileEmailDraft}</span><input inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="[0-9]{6}" required value={emailChangeOtp} onChange={(event) => setEmailChangeOtp(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="000000"/></label>
                  <div className="truvi-profile-settings-actions"><button type="submit" disabled={contactBusy}>{contactBusy ? "Verifying…" : "Verify and update email"}</button><button type="button" className="is-secondary" onClick={() => { setEmailChangeRequested(false); setEmailChangeOtp(""); }} disabled={contactBusy}>Cancel</button></div>
                  <p className="text-xs text-muted-foreground">For account security, Truvi signs you out after a successful email change.</p>
                </>}
              </form>
            </section>

            <section className="truvi-profile-settings-card">
              <div className="truvi-profile-settings-card__heading"><div><h3>Phone number</h3><p>An SMS code confirms that you own the new number.</p></div><span className={"truvi-profile-verified " + (currentUser?.phoneVerified ? "is-verified" : "is-pending")}>{currentUser?.phoneVerified ? "Verified" : "Not verified"}</span></div>
              <form onSubmit={phoneChangeRequested ? verifyPhoneChange : requestPhoneChange} className="space-y-3">
                <label className="block space-y-1.5 text-sm"><span className="text-muted-foreground">Current phone</span><input value={employee?.phone || currentUser?.phone || ""} readOnly aria-label="Current phone number"/></label>
                {!phoneChangeRequested ? <>
                  <label className="block space-y-1.5 text-sm"><span className="text-muted-foreground">New phone number</span><input type="tel" required minLength={10} maxLength={20} value={profilePhoneDraft} onChange={(event) => setProfilePhoneDraft(event.target.value)} autoComplete="tel" placeholder="+91 98765 43210"/></label>
                  <button type="submit" disabled={contactBusy}>{contactBusy ? "Sending code…" : "Send SMS verification code"}</button>
                </> : <>
                  <label className="block space-y-1.5 text-sm"><span className="text-muted-foreground">6-digit SMS code</span><input inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="[0-9]{6}" required value={phoneChangeOtp} onChange={(event) => setPhoneChangeOtp(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="000000"/></label>
                  <div className="truvi-profile-settings-actions"><button type="submit" disabled={contactBusy}>{contactBusy ? "Verifying…" : "Verify and update phone"}</button><button type="button" className="is-secondary" onClick={() => { setPhoneChangeRequested(false); setPhoneChangeOtp(""); }} disabled={contactBusy}>Cancel</button></div>
                </>}
              </form>
            </section>

            <section className="truvi-profile-settings-card truvi-profile-settings-card--password">
              <div className="truvi-profile-settings-card__heading"><div><h3>Change password</h3><p>Use your current password and choose a strong new one.</p></div><span className="truvi-profile-password-icon"><ShieldAlert size={18}/></span></div>
              <form onSubmit={changePassword} className="grid gap-3 sm:grid-cols-2">
                <label className="block space-y-1.5 text-sm sm:col-span-2"><span className="text-muted-foreground">Current password</span><input type="password" autoComplete="current-password" required maxLength={200} value={passwordForm.currentPassword} onChange={(event) => setPasswordForm((value) => ({ ...value, currentPassword: event.target.value }))}/></label>
                <label className="block space-y-1.5 text-sm"><span className="text-muted-foreground">New password</span><input type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={passwordForm.newPassword} onChange={(event) => setPasswordForm((value) => ({ ...value, newPassword: event.target.value }))} placeholder="12+ characters"/></label>
                <label className="block space-y-1.5 text-sm"><span className="text-muted-foreground">Confirm new password</span><input type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={passwordForm.confirmPassword} onChange={(event) => setPasswordForm((value) => ({ ...value, confirmPassword: event.target.value }))}/></label>
                <p className="text-xs leading-5 text-muted-foreground sm:col-span-2">Use uppercase and lowercase letters, a number and a symbol. Other active sessions are invalidated after a successful change.</p>
                <div className="truvi-profile-settings-actions sm:col-span-2"><span>Password is never shown to administrators.</span><button type="submit" disabled={passwordBusy}>{passwordBusy ? "Updating…" : "Update password"}</button></div>
              </form>
            </section>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{[
            ["Full name",employee?.name],["Employee ID",employee?.employeeCode],["Official email",employee?.officialEmail],["Phone",employee?.phone],["Department",employee?.department],["Designation",employee?.designation],["Joining date",fmtDate(employee?.joiningDate)],["Recruitment source",employee?.recruitmentSource],["Reporting manager",employee?.reportingManagerId||"Not assigned"],["Employment status",employee?.status],
          ].map(([label,value])=><div key={label} className="rounded-xl border border-white/10 p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 break-words text-sm font-medium">{value||"—"}</p></div>)}</div>
          <div className="mt-4 rounded-xl border border-white/10 p-4"><p className="text-xs text-muted-foreground">My assigned permissions</p><div className="mt-2 flex flex-wrap gap-2">{(employee?.permissions||[]).map((p)=><span key={p} className="rounded-lg border border-white/10 px-2 py-1 text-xs">{p}</span>)}</div></div>
        </Panel>}

        {tab==="salary" && <Panel title="My salary records" note="You can only see salary records linked to your own employee profile.">
          <div className="overflow-x-auto"><table className="w-full min-w-[650px] text-left text-sm"><thead className="text-xs text-muted-foreground"><tr><th className="p-3">Payroll month</th><th className="p-3">Gross</th><th className="p-3">Allowances</th><th className="p-3">Deductions</th><th className="p-3">Net payable</th><th className="p-3">Status</th><th className="p-3">Payment date / reference</th></tr></thead><tbody>{salaries.map((s)=><tr key={s._id} className="border-t border-white/10"><td className="p-3">{s.monthKey}</td><td className="p-3">{money(s.grossSalary)}</td><td className="p-3">{money(s.allowances)}</td><td className="p-3">{money(s.deductions)}</td><td className="p-3 font-semibold">{money(s.netPayable)}</td><td className="p-3"><Badge value={s.status}/></td><td className="p-3">{s.status==="PAID"?`${fmtDate(s.paymentDate)} · ${s.paymentReference||"—"}`:"—"}</td></tr>)}</tbody></table>{salaries.length===0&&<p className="p-6 text-sm text-muted-foreground">No salary record is available for your account. Contact Admin if you believe this is an error.</p>}</div>
        </Panel>}

        {tab==="notifications" && <Panel title="Notifications" note="Personal updates for tasks, buyer leads, attendance, leave, site visits and payroll. Select an item to open its workspace and mark it read."><div className="space-y-2">{notices.map((n)=>{const {Icon,tone}=noticeVisual(n.type); return <button id={"employee-notice-"+n._id} key={n._id} onClick={()=>openNotice(n)} className={`truvi-erm-notification flex w-full items-start gap-3 rounded-xl border p-4 text-left transition ${n.isRead?"is-read border-white/5":"is-unread border-primary/25 bg-primary/5"}`}><span className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${tone}`}><Icon size={19} aria-hidden="true"/></span><span className="min-w-0 flex-1"><span className="flex flex-wrap items-start justify-between gap-2"><span className="font-semibold">{n.title||"Truvi notification"}</span><Badge value={n.isRead?"READ":"UNREAD"}/></span><span className="mt-1 block text-sm text-muted-foreground">{n.message}</span><span className="mt-2 block text-xs text-muted-foreground">{fmtDateTime(n.createdAt)}</span></span>{!n.isRead&&<span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-sky-400" aria-label="Unread"/>}</button>;})}{notices.length===0&&<div className="truvi-erm-empty py-10 text-center"><Bell className="mx-auto mb-3 h-8 w-8 text-muted-foreground" aria-hidden="true"/><p className="font-semibold">You’re all caught up</p><p className="mt-1 text-sm text-muted-foreground">New Truvi notifications will appear here.</p></div>}</div></Panel>}
          </div>
        </div>
      </div>
    </main>
  );
}
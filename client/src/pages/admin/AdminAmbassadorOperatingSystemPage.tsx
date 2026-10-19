import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card, Badge } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Users, GraduationCap, ClipboardList, Building2, Wallet, RefreshCw,
  CheckCircle2, ShieldCheck, Plus, ArrowRightLeft, ChartNoAxesCombined,
} from "lucide-react";

type Profile = {
  userId: string; ambassadorId: string; college?: string | null; course?: string | null; academicYear?: string | null;
  city: string; preferredRole: string; weeklyAvailabilityHours: number; termsAccepted: boolean; status: string;
  currentLevel: string; createdAt: string;
};
type ProfileRow = { profile: Profile; name: string; email: string; onboardingVerified: boolean };
type TrainingReview = {
  _id: string; userId: string; day: number; quizScore: number; assignmentText?: string | null;
  practicalStatus: string; ethicsStatus: string; trainerFeedback?: string | null; status: string;
  ambassadorName: string; ambassadorEmail: string;
};
type Task = { _id: string; title: string; category: string; description: string; status: string; dueAt?: string | null; campaignId?: string | null; evidenceText?: string | null; evidenceUrl?: string | null; reviewReason?: string | null; assignedToId: string; ambassadorName: string; };
type Campaign = { _id: string; projectId?: string | null; name: string; projectName: string; location: string; targetInventory: number; salesTarget: number; verifiedSales?: number; unitAreaSqFt: number; targetDays: number; status: string; officialDataVerified: boolean; officialDataNotes?: string | null; };
type ProjectOption = { _id: string; name: string; city?: string; location?: string; approvalStatus?: string; isVerified?: boolean; priceListUrl?: string | null; totalUnits?: number | null };
type Policy = { _id: string; name: string; calculationType: string; amount: number; blockSizeSqFt: number; version: number; active: boolean; approvalReference?: string | null; campaignId?: string | null; };
type Incentive = { _id: string; userId: string; ambassadorName: string; ambassadorEmail: string; bookingReference: string; amount: number; policyNameSnapshot: string; policyVersion: number; status: string; paymentReference?: string | null; };
type EligibleSale = { leadId: string; leadReference: string; projectId: string; projectName: string; unitId?: string | null; unitNumber?: string | null; areaSqFt?: number | null; stage: string };
type Overview = { profiles: ProfileRow[]; trainingReviews: TrainingReview[]; tasks: Task[]; campaigns: Campaign[]; policies: Policy[]; incentives: Incentive[]; stats: { ambassadors: number; awaitingAssessment: number; assignedTasks: number; submittedTasks: number; activeCampaigns: number; pendingIncentives: number; registeredSales: number } };

type Tab = "overview" | "ambassadors" | "training" | "tasks" | "campaigns" | "policies" | "incentives";
const TABS: { id: Tab; label: string; Icon: typeof Users }[] = [
  { id: "overview", label: "Overview", Icon: ChartNoAxesCombined }, { id: "ambassadors", label: "Ambassadors", Icon: Users },
  { id: "training", label: "Training Reviews", Icon: GraduationCap }, { id: "tasks", label: "Tasks", Icon: ClipboardList },
  { id: "campaigns", label: "Campaigns", Icon: Building2 }, { id: "policies", label: "Incentive Policies", Icon: ShieldCheck },
  { id: "incentives", label: "Payouts", Icon: Wallet },
];
const money = (value: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value || 0);
const pretty = (value: string) => value.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

export default function AdminAmbassadorOperatingSystemPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("overview");
  const [creatingTask, setCreatingTask] = useState(false);
  const [creatingCampaign, setCreatingCampaign] = useState(false);
  const [creatingPolicy, setCreatingPolicy] = useState(false);
  const [creatingIncentive, setCreatingIncentive] = useState(false);
  const [taskForm, setTaskForm] = useState({ title: "", category: "SALES", description: "", assignedToId: "", dueAt: "", campaignId: "" });
  const [campaignForm, setCampaignForm] = useState({ name: "Paradise Town — 114 Units Sales Mission", projectId: "", projectName: "Paradise Town", location: "Sultanpur Road, Lucknow", targetInventory: 114, salesTarget: 114, unitAreaSqFt: 1250, targetDays: 60, startsAt: "", officialDataNotes: "" });
  const [policyForm, setPolicyForm] = useState({ name: "Paradise Town Ambassador Incentive", campaignId: "", calculationType: "PER_SQ_FT_BLOCK", amount: 100000, blockSizeSqFt: 1000, effectiveFrom: "" });
  const [incentiveForm, setIncentiveForm] = useState({ userId: "", leadId: "", policyId: "", verifiedAreaSqFt: 1250, bookingValue: "" });
  const [eligibleSales, setEligibleSales] = useState<EligibleSale[]>([]);
  const [loadingEligibleSales, setLoadingEligibleSales] = useState(false);
  const [reviewState, setReviewState] = useState<Record<string, { practicalStatus: string; ethicsStatus: string; trainerFeedback: string }>>({});
  const [taskReviews, setTaskReviews] = useState<Record<string, { reviewReason: string; paymentReference: string }>>({});
  const [policyApproval, setPolicyApproval] = useState<Record<string, string>>({});
  const [campaignNotes, setCampaignNotes] = useState<Record<string, string>>({});

  async function load() {
    try {
      const [res, projectRes] = await Promise.all([
        api.get("/ambassador-os/admin/overview"),
        api.get("/admin/projects").catch(() => ({ data: { projects: [] as ProjectOption[] } })),
      ]);
      setData(res.data as Overview);
      setProjects(projectRes.data.projects ?? []);
    } catch (error: any) { toast.error(error?.response?.data?.error || "Could not load Ambassador OS admin data"); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  async function loadEligibleSales(userId: string) {
    setEligibleSales([]);
    setIncentiveForm((form) => ({ ...form, userId, leadId: "", verifiedAreaSqFt: 1250, bookingValue: "" }));
    if (!userId) return;
    setLoadingEligibleSales(true);
    try {
      const res = await api.get(`/ambassador-os/admin/eligible-sales/${userId}`);
      setEligibleSales(res.data.eligibleSales as EligibleSale[]);
    } catch (error: any) {
      toast.error(error?.response?.data?.error || "Could not load eligible registered sales");
    } finally {
      setLoadingEligibleSales(false);
    }
  }

  async function updateProfile(userId: string, values: Record<string, string>) {
    try { await api.patch(`/ambassador-os/admin/profiles/${userId}`, values); toast.success("Ambassador profile updated"); await load(); }
    catch (error: any) { toast.error(error?.response?.data?.error || "Could not update Ambassador"); }
  }
  async function reviewTraining(row: TrainingReview) {
    const values = reviewState[row._id] ?? { practicalStatus: row.practicalStatus, ethicsStatus: row.ethicsStatus, trainerFeedback: row.trainerFeedback ?? "" };
    try {
      await api.patch(`/ambassador-os/admin/training/${row.userId}/${row.day}/review`, values);
      toast.success("Training review saved");
      await load();
    } catch (error: any) { toast.error(error?.response?.data?.error || "Could not save training review"); }
  }
  async function createTask(e: React.FormEvent) {
    e.preventDefault(); setCreatingTask(true);
    try {
      await api.post("/ambassador-os/admin/tasks", {
        ...taskForm, dueAt: taskForm.dueAt ? new Date(taskForm.dueAt).toISOString() : undefined,
        campaignId: taskForm.campaignId || undefined,
      });
      toast.success("Task assigned"); setTaskForm({ title: "", category: "SALES", description: "", assignedToId: "", dueAt: "", campaignId: "" }); await load();
    } catch (error: any) { toast.error(error?.response?.data?.error || "Could not create task"); }
    finally { setCreatingTask(false); }
  }
  async function reviewTask(task: Task, status: "APPROVED" | "REJECTED" | "CLOSED") {
    const values = taskReviews[task._id] ?? { reviewReason: task.reviewReason ?? "", paymentReference: "" };
    try {
      await api.patch(`/ambassador-os/admin/tasks/${task._id}/review`, { status, reviewReason: values.reviewReason });
      toast.success(`Task ${status.toLowerCase()}`); await load();
    } catch (error: any) { toast.error(error?.response?.data?.error || "Could not review task"); }
  }
  async function createCampaign(e: React.FormEvent) {
    e.preventDefault(); setCreatingCampaign(true);
    try {
      await api.post("/ambassador-os/admin/campaigns", {
        ...campaignForm, projectId: campaignForm.projectId || undefined,
        targetInventory: Number(campaignForm.targetInventory), salesTarget: Number(campaignForm.salesTarget),
        unitAreaSqFt: Number(campaignForm.unitAreaSqFt), targetDays: Number(campaignForm.targetDays),
        startsAt: campaignForm.startsAt ? new Date(campaignForm.startsAt).toISOString() : undefined,
      });
      toast.success("Campaign created as planned. It is not visible to ambassadors until verified and activated.");
      setTab("campaigns"); await load();
    } catch (error: any) { toast.error(error?.response?.data?.error || "Could not create campaign"); }
    finally { setCreatingCampaign(false); }
  }
  async function updateCampaign(campaign: Campaign, activate: boolean) {
    const notes = campaignNotes[campaign._id] ?? campaign.officialDataNotes ?? "";
    try {
      await api.patch(`/ambassador-os/admin/campaigns/${campaign._id}`, {
        status: activate ? "ACTIVE" : campaign.status,
        officialDataVerified: activate ? true : campaign.officialDataVerified,
        officialDataNotes: notes,
      });
      toast.success(activate ? "Campaign verified and activated" : "Campaign updated"); await load();
    } catch (error: any) { toast.error(error?.response?.data?.error || "Could not update campaign"); }
  }
  async function createPolicy(e: React.FormEvent) {
    e.preventDefault(); setCreatingPolicy(true);
    try {
      await api.post("/ambassador-os/admin/policies", {
        ...policyForm, amount: Number(policyForm.amount), blockSizeSqFt: Number(policyForm.blockSizeSqFt),
        campaignId: policyForm.campaignId || undefined,
        effectiveFrom: policyForm.effectiveFrom ? new Date(policyForm.effectiveFrom).toISOString() : undefined,
      });
      toast.success("Policy created as inactive. Attach written approval before activation."); await load();
    } catch (error: any) { toast.error(error?.response?.data?.error || "Could not create policy"); }
    finally { setCreatingPolicy(false); }
  }
  async function togglePolicy(policy: Policy, active: boolean) {
    try {
      await api.patch(`/ambassador-os/admin/policies/${policy._id}`, { active, approvalReference: policyApproval[policy._id] ?? policy.approvalReference ?? "" });
      toast.success(active ? "Policy activated with approval reference" : "Policy deactivated"); await load();
    } catch (error: any) { toast.error(error?.response?.data?.error || "Could not update policy"); }
  }
  async function createIncentive(e: React.FormEvent) {
    e.preventDefault(); setCreatingIncentive(true);
    try {
      await api.post("/ambassador-os/admin/incentives", {
        ...incentiveForm, verifiedAreaSqFt: Number(incentiveForm.verifiedAreaSqFt),
        bookingValue: incentiveForm.bookingValue === "" ? undefined : Number(incentiveForm.bookingValue),
      });
      toast.success("Incentive recorded as pending approval"); await load();
    } catch (error: any) { toast.error(error?.response?.data?.error || "Could not record incentive"); }
    finally { setCreatingIncentive(false); }
  }
  async function updateIncentive(incentive: Incentive, status: "APPROVED" | "PAYABLE" | "PAID" | "CANCELLED") {
    const paymentReference = taskReviews[incentive._id]?.paymentReference ?? incentive.paymentReference ?? "";
    try {
      await api.patch(`/ambassador-os/admin/incentives/${incentive._id}/status`, { status, paymentReference: paymentReference || undefined });
      toast.success(`Incentive moved to ${status.toLowerCase()}`); await load();
    } catch (error: any) { toast.error(error?.response?.data?.error || "Could not update payout"); }
  }

  if (loading) return <main className="p-6 text-white">Loading Ambassador Operating System…</main>;
  if (!data) return <main className="p-6 text-white">Unable to load admin data. Refresh to retry.</main>;

  return (
    <main className="min-h-screen space-y-6 p-4 text-white md:p-7">
      <header className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs uppercase tracking-[.18em] text-sky-300">Truvi · Program Management</p><h1 className="mt-1 text-2xl font-semibold md:text-3xl">Ambassador Operating System</h1><p className="mt-2 max-w-3xl text-sm text-muted-foreground">Manage registration, certification, tasks, campaigns, approved incentive policies and payouts from one workspace.</p></div><Button variant="outline" onClick={() => { setLoading(true); void load(); }}><RefreshCw size={15} className="mr-2" />Refresh</Button></header>
      <nav className="flex gap-2 overflow-x-auto pb-1">{TABS.map(({ id, label, Icon }) => <button key={id} onClick={() => setTab(id)} className={`flex shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-sm ${tab === id ? "border-sky-400/40 bg-sky-400/10 text-sky-200" : "border-white/10 bg-white/[0.025] text-muted-foreground hover:text-white"}`}><Icon size={15} />{label}</button>)}</nav>

      {tab === "overview" && <>
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[
          ["Ambassador profiles",data.stats.ambassadors,Users],["Training reviews",data.stats.awaitingAssessment,GraduationCap],["Task submissions",data.stats.submittedTasks,ClipboardList],["Pending incentive records",data.stats.pendingIncentives,Wallet],["Registered/completed sales",data.stats.registeredSales,CheckCircle2],
        ].map(([label,value,Icon])=>{const Glyph=Icon as typeof Users;return <Card key={String(label)} className="border-white/10 bg-white/[0.035] p-4"><div className="flex items-center justify-between"><p className="text-sm text-muted-foreground">{String(label)}</p><Glyph size={18} className="text-sky-300" /></div><p className="mt-3 text-2xl font-semibold">{String(value)}</p></Card>;})}</section>
        <div className="grid gap-4 xl:grid-cols-2">
          <Card className="border-white/10 bg-white/[0.035] p-5"><h2 className="mb-3 font-semibold">Needs attention</h2><div className="space-y-3">{[
            ["Training assessments awaiting review",data.stats.awaitingAssessment,"training"],["Submitted tasks awaiting review",data.stats.submittedTasks,"tasks"],["Campaigns awaiting verification",data.campaigns.filter((c)=>c.status==="PLANNED"&&!c.officialDataVerified).length,"campaigns"],["Policies awaiting written approval",data.policies.filter((p)=>!p.active&&!p.approvalReference).length,"policies"],
          ].map(([label,value,to])=><button key={String(label)} onClick={()=>setTab(to as Tab)} className="flex w-full items-center justify-between rounded-lg border border-white/10 p-3 text-left hover:bg-white/5"><span className="text-sm">{String(label)}</span><span className="flex items-center gap-2 text-sm text-sky-300">{String(value)} <ArrowRightLeft size={14}/></span></button>)}</div></Card>
          <Card className="border-white/10 bg-white/[0.035] p-5"><h2 className="mb-3 font-semibold">Safety rules</h2><ul className="space-y-2 text-sm text-muted-foreground">{[
            "A written quiz passing score is not certification; practical and ethics reviews are required.",
            "Activation requires accepted program terms, identity verification and completion of all seven training days.",
            "Campaigns stay hidden from ambassadors until official information is verified and the campaign is activated.",
            "Incentive policies are created inactive and require a written approval reference to activate.",
            "Payouts must move through Pending → Approved → Payable → Paid. A payment reference is required to mark paid.",
          ].map((item)=><li key={item} className="flex gap-2"><ShieldCheck size={15} className="mt-0.5 shrink-0 text-emerald-300"/>{item}</li>)}</ul></Card>
        </div>
      </>}

      {tab === "ambassadors" && <Card className="border-white/10 bg-white/[0.035] p-4"><h2 className="mb-4 font-semibold">Ambassador directory</h2><div className="overflow-x-auto"><table className="w-full min-w-[920px] text-left text-sm"><thead className="text-xs text-muted-foreground"><tr>{["Ambassador","City / College","Identity","Terms","Status","Career level","Actions"].map((x)=><th key={x} className="pb-3 pr-3">{x}</th>)}</tr></thead><tbody>{data.profiles.map(({profile,name,email,onboardingVerified})=><tr key={profile.userId} className="border-t border-white/10 align-top"><td className="py-3 pr-3"><p className="font-medium">{name}</p><p className="text-xs text-muted-foreground">{email}</p><p className="mt-1 text-xs text-sky-300">{profile.ambassadorId}</p></td><td className="py-3 pr-3">{profile.city}<p className="text-xs text-muted-foreground">{profile.college || "College not provided"}</p></td><td className="py-3 pr-3"><Badge variant={onboardingVerified?"success":"warning"}>{onboardingVerified?"Verified":"Pending"}</Badge></td><td className="py-3 pr-3">{profile.termsAccepted?"Accepted":"Pending"}</td><td className="py-3 pr-3"><select aria-label={`Status for ${name}`} className="rounded-lg border border-white/10 bg-slate-950 p-2" value={profile.status} onChange={(e)=>void updateProfile(profile.userId,{status:e.target.value})}>{["REGISTERED","VERIFICATION_PENDING","TRAINING_IN_PROGRESS","ASSESSMENT_PENDING","CERTIFIED","ACTIVE","TEMPORARILY_INACTIVE","SUSPENDED","EXITED"].map((s)=><option key={s} value={s}>{pretty(s)}</option>)}</select></td><td className="py-3 pr-3"><select aria-label={`Career level for ${name}`} className="rounded-lg border border-white/10 bg-slate-950 p-2" value={profile.currentLevel} onChange={(e)=>{const nextLevel=e.target.value;if(nextLevel===profile.currentLevel)return;const reason=window.prompt("Record the reason/evidence for this promotion or level correction (minimum 5 characters):");if(!reason?.trim()||reason.trim().length<5){toast.info("Career-level change cancelled; an audit reason is required.");return;}void updateProfile(profile.userId,{currentLevel:nextLevel,promotionReason:reason.trim()});}}>{["L0","L1","L2","L3","L4","L5","L6"].map((s)=><option key={s}>{s}</option>)}</select></td><td className="py-3 pr-3"><p className="text-xs text-muted-foreground">{profile.course || "Course not provided"}</p></td></tr>)}</tbody></table></div></Card>}

      {tab === "training" && <div className="space-y-3"><p className="text-sm text-muted-foreground">Review a module's written score and assignment, then record practical communication and ethics approval separately.</p>{data.trainingReviews.length===0?<Empty text="No written assessments are waiting for review."/>:data.trainingReviews.map((row)=><Card key={row._id} className="border-white/10 bg-white/[0.035] p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold">{row.ambassadorName} · Day {row.day}</h3><p className="text-xs text-muted-foreground">{row.ambassadorEmail}</p><Badge className="mt-2" variant={row.quizScore>=80?"success":"warning"}>Written score: {row.quizScore}/100</Badge></div><Badge variant="info">{pretty(row.status)}</Badge></div><div className="mt-3 rounded-lg border border-white/10 bg-black/10 p-3"><p className="text-xs text-muted-foreground">Assignment submission</p><p className="mt-1 whitespace-pre-wrap text-sm">{row.assignmentText || "No assignment text recorded."}</p></div><div className="mt-3 grid gap-3 md:grid-cols-3"><label className="text-sm"><span className="mb-1 block text-muted-foreground">Practical assessment</span><select className="h-10 w-full rounded-lg border border-white/10 bg-slate-950 px-2" value={(reviewState[row._id]?.practicalStatus) ?? row.practicalStatus} onChange={(e)=>setReviewState((prev)=>({...prev,[row._id]:{practicalStatus:e.target.value,ethicsStatus:prev[row._id]?.ethicsStatus??row.ethicsStatus,trainerFeedback:prev[row._id]?.trainerFeedback??row.trainerFeedback??""}}))}>{["PENDING","APPROVED","REJECTED"].map((v)=><option key={v}>{v}</option>)}</select></label><label className="text-sm"><span className="mb-1 block text-muted-foreground">Ethics & compliance</span><select className="h-10 w-full rounded-lg border border-white/10 bg-slate-950 px-2" value={(reviewState[row._id]?.ethicsStatus) ?? row.ethicsStatus} onChange={(e)=>setReviewState((prev)=>({...prev,[row._id]:{practicalStatus:prev[row._id]?.practicalStatus??row.practicalStatus,ethicsStatus:e.target.value,trainerFeedback:prev[row._id]?.trainerFeedback??row.trainerFeedback??""}}))}>{["PENDING","APPROVED","REJECTED"].map((v)=><option key={v}>{v}</option>)}</select></label><label className="text-sm"><span className="mb-1 block text-muted-foreground">Trainer feedback</span><input className="h-10 w-full rounded-lg border border-white/10 bg-slate-950 px-3" value={(reviewState[row._id]?.trainerFeedback) ?? row.trainerFeedback ?? ""} onChange={(e)=>setReviewState((prev)=>({...prev,[row._id]:{practicalStatus:prev[row._id]?.practicalStatus??row.practicalStatus,ethicsStatus:prev[row._id]?.ethicsStatus??row.ethicsStatus,trainerFeedback:e.target.value}}))}/></label></div><div className="mt-3"><Button onClick={()=>void reviewTraining(row)}>Save review</Button></div></Card>)}</div>}

      {tab === "tasks" && <div className="grid gap-5 xl:grid-cols-[380px_1fr]"><Card className="h-fit border-white/10 bg-white/[0.035] p-5"><h2 className="mb-4 flex items-center gap-2 font-semibold"><Plus size={17}/> Assign a task</h2><form className="space-y-3" onSubmit={createTask}><FormField label="Task title" value={taskForm.title} onChange={(v)=>setTaskForm((f)=>({...f,title:v}))} required/><label className="block text-sm"><span className="mb-1 block text-muted-foreground">Category</span><select className="h-10 w-full rounded-lg border border-white/10 bg-slate-950 px-3" value={taskForm.category} onChange={(e)=>setTaskForm((f)=>({...f,category:e.target.value}))}>{["TRAINING","SALES","MARKETING","LEAD_MANAGEMENT","SITE_VISIT","RESEARCH","VERIFICATION"].map((v)=><option key={v}>{v}</option>)}</select></label><label className="block text-sm"><span className="mb-1 block text-muted-foreground">Assign to Ambassador</span><select required className="h-10 w-full rounded-lg border border-white/10 bg-slate-950 px-3" value={taskForm.assignedToId} onChange={(e)=>setTaskForm((f)=>({...f,assignedToId:e.target.value}))}><option value="">Select ambassador</option>{data.profiles.filter(({profile,onboardingVerified})=>profile.termsAccepted&&onboardingVerified&&["ACTIVE","CERTIFIED"].includes(profile.status)).map(({profile,name})=><option key={profile.userId} value={profile.userId}>{name} · {profile.ambassadorId}</option>)}</select></label><label className="block text-sm"><span className="mb-1 block text-muted-foreground">Campaign (optional)</span><select className="h-10 w-full rounded-lg border border-white/10 bg-slate-950 px-3" value={taskForm.campaignId} onChange={(e)=>setTaskForm((f)=>({...f,campaignId:e.target.value}))}><option value="">General task</option>{data.campaigns.map((campaign)=><option key={campaign._id} value={campaign._id}>{campaign.name}</option>)}</select></label><label className="block text-sm"><span className="mb-1 block text-muted-foreground">Instructions</span><textarea required minLength={5} rows={4} className="w-full rounded-lg border border-white/10 bg-slate-950 p-3" value={taskForm.description} onChange={(e)=>setTaskForm((f)=>({...f,description:e.target.value}))}/></label><FormField label="Due date" value={taskForm.dueAt} onChange={(v)=>setTaskForm((f)=>({...f,dueAt:v}))} type="datetime-local"/><Button type="submit" disabled={creatingTask} className="w-full">{creatingTask?"Assigning…":"Assign task"}</Button></form></Card><div className="space-y-3">{data.tasks.length===0?<Empty text="No operating-system tasks created."/>:data.tasks.map((task)=><Card key={task._id} className="border-white/10 bg-white/[0.035] p-4"><div className="flex flex-wrap justify-between gap-2"><div><p className="font-semibold">{task.title}</p><p className="text-xs text-sky-300">{task.ambassadorName} · {pretty(task.category)}{task.campaignId ? ` · ${data.campaigns.find((campaign)=>campaign._id===task.campaignId)?.name ?? "Campaign linked"}` : ""}</p></div><Badge variant={task.status==="APPROVED"?"success":"info"}>{pretty(task.status)}</Badge></div><p className="mt-2 text-sm text-muted-foreground">{task.description}</p>{task.evidenceText&&<div className="mt-3 rounded-lg bg-black/10 p-3"><p className="text-xs text-muted-foreground">Submitted evidence</p><p className="mt-1 whitespace-pre-wrap text-sm">{task.evidenceText}</p>{task.evidenceUrl&&<a className="mt-2 block text-sm text-sky-300 underline" href={task.evidenceUrl} target="_blank" rel="noreferrer">Open evidence link</a>}</div>}{task.status==="SUBMITTED"&&<div className="mt-3 space-y-2"><input placeholder="Required reason if rejecting" className="h-10 w-full rounded-lg border border-white/10 bg-slate-950 px-3 text-sm" value={taskReviews[task._id]?.reviewReason??""} onChange={(e)=>setTaskReviews((p)=>({...p,[task._id]:{reviewReason:e.target.value,paymentReference:p[task._id]?.paymentReference??""}}))}/><div className="flex flex-wrap gap-2"><Button size="sm" onClick={()=>void reviewTask(task,"APPROVED")}>Approve</Button><Button size="sm" variant="outline" onClick={()=>void reviewTask(task,"REJECTED")}>Reject</Button></div></div>}</Card>)}</div></div>}

      {tab === "campaigns" && <div className="grid gap-5 xl:grid-cols-[390px_1fr]"><Card className="h-fit border-white/10 bg-white/[0.035] p-5"><h2 className="mb-1 font-semibold">Create campaign</h2><p className="mb-4 text-xs text-muted-foreground">Created in Planned status. It becomes visible only after linking to an approved, Truvi-verified project with a price list and enough available units.</p><form className="space-y-3" onSubmit={createCampaign}><label className="block text-sm"><span className="mb-1 block text-muted-foreground">Link existing Truvi project (required to activate)</span><select className="h-10 w-full rounded-lg border border-white/10 bg-slate-950 px-3" value={campaignForm.projectId} onChange={(e)=>{const chosen=projects.find((p)=>p._id===e.target.value);setCampaignForm((f)=>({...f,projectId:e.target.value,projectName:chosen?.name??f.projectName,location:chosen?[chosen.location,chosen.city].filter(Boolean).join(", "):f.location}));}}><option value="">Not linked yet — keep campaign planned</option>{projects.map((p)=><option key={p._id} value={p._id}>{p.name} · {p.city ?? p.location ?? "No location"}{p.approvalStatus!=="APPROVED"||!p.isVerified||!p.priceListUrl?" (needs verification)":""}</option>)}</select></label><FormField label="Campaign name" value={campaignForm.name} onChange={(v)=>setCampaignForm((f)=>({...f,name:v}))} required/><FormField label="Project name" value={campaignForm.projectName} onChange={(v)=>setCampaignForm((f)=>({...f,projectName:v}))} required/><FormField label="Location" value={campaignForm.location} onChange={(v)=>setCampaignForm((f)=>({...f,location:v}))} required/><div className="grid grid-cols-2 gap-3"><FormField label="Required available units" value={String(campaignForm.targetInventory)} onChange={(v)=>setCampaignForm((f)=>({...f,targetInventory:Number(v)}))} type="number" required/><FormField label="Verified sales target" value={String(campaignForm.salesTarget)} onChange={(v)=>setCampaignForm((f)=>({...f,salesTarget:Number(v)}))} type="number" required/><FormField label="Area/unit (sq ft)" value={String(campaignForm.unitAreaSqFt)} onChange={(v)=>setCampaignForm((f)=>({...f,unitAreaSqFt:Number(v)}))} type="number" required/></div><FormField label="Target days" value={String(campaignForm.targetDays)} onChange={(v)=>setCampaignForm((f)=>({...f,targetDays:Number(v)}))} type="number" required/><FormField label="Start date" value={campaignForm.startsAt} onChange={(v)=>setCampaignForm((f)=>({...f,startsAt:v}))} type="datetime-local"/><Button type="submit" className="w-full" disabled={creatingCampaign}>{creatingCampaign?"Creating…":"Create planned campaign"}</Button></form></Card><div className="space-y-3">{data.campaigns.length===0?<Empty text="No campaign configured yet."/>:data.campaigns.map((c)=><Card key={c._id} className="border-white/10 bg-white/[0.035] p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-semibold">{c.name}</p><p className="text-sm text-muted-foreground">{c.projectName} · {c.location}</p></div><Badge variant={c.status==="ACTIVE"?"success":"info"}>{pretty(c.status)}</Badge></div><div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4"><MiniMetric label="Available-unit check" value={String(c.targetInventory)}/><MiniMetric label="Verified sales / target" value={`${c.verifiedSales ?? 0} / ${c.salesTarget}`}/><MiniMetric label="Area/unit" value={`${c.unitAreaSqFt.toLocaleString("en-IN")} sq ft`}/><MiniMetric label="Duration" value={`${c.targetDays} days`}/></div><p className="mt-3 text-xs text-muted-foreground">Linked project: {projects.find((p)=>p._id===c.projectId)?.name ?? (c.projectId ? c.projectName : "Not linked")} · {c.officialDataVerified?"Official data marked verified":"Not visible to ambassadors until official data is verified."}</p>{c.status!=="ACTIVE"&&<div className="mt-3 space-y-2"><input placeholder="Evidence/source notes for official project, legal, price and inventory checks" className="h-10 w-full rounded-lg border border-white/10 bg-slate-950 px-3 text-sm" value={campaignNotes[c._id]??c.officialDataNotes??""} onChange={(e)=>setCampaignNotes((p)=>({...p,[c._id]:e.target.value}))}/><Button size="sm" onClick={()=>void updateCampaign(c,true)}><CheckCircle2 size={15} className="mr-2"/>Mark verified & activate</Button></div>}{c.status==="ACTIVE"&&<Button size="sm" variant="outline" className="mt-3" onClick={()=>void api.patch(`/ambassador-os/admin/campaigns/${c._id}`,{status:"PAUSED"}).then(load).catch(()=>toast.error("Could not pause campaign"))}>Pause campaign</Button>}</Card>)}</div></div>}

      {tab === "policies" && <div className="grid gap-5 xl:grid-cols-[390px_1fr]"><Card className="h-fit border-white/10 bg-white/[0.035] p-5"><h2 className="mb-1 font-semibold">Create incentive policy</h2><p className="mb-4 text-xs text-muted-foreground">Policy version starts inactive; written approval is required before it can calculate incentives.</p><form className="space-y-3" onSubmit={createPolicy}><FormField label="Policy name" value={policyForm.name} onChange={(v)=>setPolicyForm((f)=>({...f,name:v}))} required/><label className="block text-sm"><span className="mb-1 block text-muted-foreground">Calculation basis</span><select className="h-10 w-full rounded-lg border border-white/10 bg-slate-950 px-3" value={policyForm.calculationType} onChange={(e)=>setPolicyForm((f)=>({...f,calculationType:e.target.value}))}>{[["PER_SQ_FT_BLOCK","Amount per complete area block"],["FIXED","Fixed amount per eligible sale"],["PERCENT_OF_VALUE","Percent of verified booking value"]].map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label><FormField label={policyForm.calculationType==="PERCENT_OF_VALUE"?"Percentage (%)":"Amount (₹)"} value={String(policyForm.amount)} onChange={(v)=>setPolicyForm((f)=>({...f,amount:Number(v)}))} type="number" required/>{policyForm.calculationType==="PER_SQ_FT_BLOCK"&&<FormField label="Block size (sq ft)" value={String(policyForm.blockSizeSqFt)} onChange={(v)=>setPolicyForm((f)=>({...f,blockSizeSqFt:Number(v)}))} type="number" required/>}<label className="block text-sm"><span className="mb-1 block text-muted-foreground">Campaign (optional)</span><select className="h-10 w-full rounded-lg border border-white/10 bg-slate-950 px-3" value={policyForm.campaignId} onChange={(e)=>setPolicyForm((f)=>({...f,campaignId:e.target.value}))}><option value="">Any campaign</option>{data.campaigns.map((c)=><option key={c._id} value={c._id}>{c.name}</option>)}</select></label><Button type="submit" disabled={creatingPolicy} className="w-full">{creatingPolicy?"Creating…":"Create inactive policy"}</Button></form></Card><div className="space-y-3">{data.policies.length===0?<Empty text="No incentive policies configured."/>:data.policies.map((p)=><Card key={p._id} className="border-white/10 bg-white/[0.035] p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-semibold">{p.name} · v{p.version}</p><p className="text-sm text-muted-foreground">{pretty(p.calculationType)} · {p.calculationType==="PERCENT_OF_VALUE"?p.amount+"%":money(p.amount)}{p.calculationType==="PER_SQ_FT_BLOCK"?` per ${p.blockSizeSqFt} sq ft block`:""}</p></div><Badge variant={p.active?"success":"warning"}>{p.active?"Active":"Inactive"}</Badge></div>{!p.active&&<div className="mt-3 space-y-2"><input placeholder="Written approval / signed policy reference (required)" className="h-10 w-full rounded-lg border border-white/10 bg-slate-950 px-3 text-sm" value={policyApproval[p._id]??p.approvalReference??""} onChange={(e)=>setPolicyApproval((x)=>({...x,[p._id]:e.target.value}))}/><Button size="sm" onClick={()=>void togglePolicy(p,true)}>Activate policy</Button></div>}{p.active&&<Button size="sm" variant="outline" className="mt-3" onClick={()=>void togglePolicy(p,false)}>Deactivate policy</Button>}</Card>)}</div></div>}

      {tab === "incentives" && <div className="grid gap-5 xl:grid-cols-[390px_1fr]"><Card className="h-fit border-white/10 bg-white/[0.035] p-5"><h2 className="mb-1 font-semibold">Record verified sale incentive</h2><p className="mb-4 text-xs text-muted-foreground">Select the Ambassador first. Only eligible registered/completed sales with verified attribution, no duplicate flag and required contact consent appear in the sale selector.</p><form className="space-y-3" onSubmit={createIncentive}><label className="block text-sm"><span className="mb-1 block text-muted-foreground">Ambassador</span><select required className="h-10 w-full rounded-lg border border-white/10 bg-slate-950 px-3" value={incentiveForm.userId} onChange={(e)=>void loadEligibleSales(e.target.value)}><option value="">Select Ambassador</option>{data.profiles.map(({profile,name})=><option key={profile.userId} value={profile.userId}>{name} · {profile.ambassadorId}</option>)}</select></label><label className="block text-sm"><span className="mb-1 block text-muted-foreground">Eligible registered sale</span><select required disabled={!incentiveForm.userId||loadingEligibleSales||eligibleSales.length===0} className="h-10 w-full rounded-lg border border-white/10 bg-slate-950 px-3" value={incentiveForm.leadId} onChange={(e)=>{const sale=eligibleSales.find((item)=>item.leadId===e.target.value);setIncentiveForm((form)=>({...form,leadId:e.target.value,verifiedAreaSqFt:sale?.areaSqFt??form.verifiedAreaSqFt}));}}><option value="">{loadingEligibleSales?"Loading eligible sales…":eligibleSales.length?"Select a registered/completed sale":"No eligible sales found for this Ambassador"}</option>{eligibleSales.map((sale)=><option key={sale.leadId} value={sale.leadId}>{sale.leadReference} · {sale.projectName}{sale.unitNumber? ` · Unit ${sale.unitNumber}`: " · Project enquiry"} · {pretty(sale.stage)}</option>)}</select><p className="mt-1 text-xs text-muted-foreground">Only non-duplicate registered/completed sales attributed to this Ambassador with required contact-consent evidence are listed.</p></label><label className="block text-sm"><span className="mb-1 block text-muted-foreground">Approved active policy</span><select required className="h-10 w-full rounded-lg border border-white/10 bg-slate-950 px-3" value={incentiveForm.policyId} onChange={(e)=>setIncentiveForm((f)=>({...f,policyId:e.target.value}))}><option value="">Select policy</option>{data.policies.filter((p)=>p.active).map((p)=><option key={p._id} value={p._id}>{p.name} · v{p.version}</option>)}</select></label>{!eligibleSales.find((sale)=>sale.leadId===incentiveForm.leadId)?.areaSqFt && <FormField label="Verified area (sq ft; required for project-only enquiries)" value={String(incentiveForm.verifiedAreaSqFt)} onChange={(v)=>setIncentiveForm((f)=>({...f,verifiedAreaSqFt:Number(v)}))} type="number" required/>}<FormField label="Verified booking value (₹; needed for percent policies)" value={incentiveForm.bookingValue} onChange={(v)=>setIncentiveForm((f)=>({...f,bookingValue:v}))} type="number"/><Button type="submit" disabled={creatingIncentive||data.policies.every((p)=>!p.active)} className="w-full">{creatingIncentive?"Recording…":"Calculate and record as pending"}</Button></form></Card><div className="space-y-3">{data.incentives.length===0?<Empty text="No incentive ledger records yet."/>:data.incentives.map((i)=><Card key={i._id} className="border-white/10 bg-white/[0.035] p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-semibold">{i.ambassadorName}</p><p className="text-xs text-muted-foreground">{i.ambassadorEmail}</p><p className="mt-1 text-xs text-sky-300">Lead {i.bookingReference}</p></div><div className="text-right"><p className="text-xl font-semibold">{money(i.amount)}</p><Badge variant={i.status==="PAID"?"success":"info"}>{pretty(i.status)}</Badge></div></div><p className="mt-2 text-sm text-muted-foreground">{i.policyNameSnapshot} · version {i.policyVersion}</p>{i.paymentReference&&<p className="mt-1 text-xs text-muted-foreground">Receipt: {i.paymentReference}</p>}<div className="mt-3 flex flex-wrap items-center gap-2">{i.status==="PENDING"&&<Button size="sm" onClick={()=>void updateIncentive(i,"APPROVED")}>Approve</Button>}{i.status==="APPROVED"&&<Button size="sm" onClick={()=>void updateIncentive(i,"PAYABLE")}>Mark payable</Button>}{i.status==="PAYABLE"&&<><input className="h-9 min-w-[210px] rounded-lg border border-white/10 bg-slate-950 px-3 text-sm" placeholder="Payment reference / receipt" value={taskReviews[i._id]?.paymentReference??i.paymentReference??""} onChange={(e)=>setTaskReviews((p)=>({...p,[i._id]:{reviewReason:p[i._id]?.reviewReason??"",paymentReference:e.target.value}}))}/><Button size="sm" onClick={()=>void updateIncentive(i,"PAID")}>Mark paid</Button></>}{["PENDING","APPROVED","PAYABLE"].includes(i.status)&&<Button size="sm" variant="outline" onClick={()=>void updateIncentive(i,"CANCELLED")}>Cancel</Button>}</div></Card>)}</div></div>}
    </main>
  );
}

function FormField({ label, value, onChange, placeholder, type = "text", required = false }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; type?: string; required?: boolean }) {
  return <label className="block text-sm"><span className="mb-1 block text-muted-foreground">{label}</span><input type={type} required={required} placeholder={placeholder} value={value} onChange={(e)=>onChange(e.target.value)} className="h-10 w-full rounded-lg border border-white/10 bg-slate-950 px-3 outline-none focus:border-sky-400/50"/></label>;
}
function MiniMetric({label,value}:{label:string;value:string}){return <div className="rounded-lg border border-white/10 p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 font-semibold">{value}</p></div>}
function Empty({text}:{text:string}){return <p className="rounded-xl border border-dashed border-white/10 p-5 text-sm text-muted-foreground">{text}</p>}

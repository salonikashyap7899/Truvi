import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { Card, Badge } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  ArrowLeft, BookOpen, CheckCircle2, Clock3, GraduationCap, ClipboardList,
  Wallet, TrendingUp, Users, ShieldCheck, LockKeyhole, Building2, Send, Award,
} from "lucide-react";

type Progress = {
  _id: string; day: number; quizScore: number; assignmentText?: string | null;
  practicalStatus: string; ethicsStatus: string; trainerFeedback?: string | null;
  status: "NOT_STARTED" | "IN_PROGRESS" | "ASSESSMENT_PENDING" | "RETAKE_REQUIRED" | "COMPLETED";
  completedAt?: string | null;
};
type Question = { prompt: string; options: string[] };
type Module = {
  day: number; title: string; summary: string; lesson: string; keyPoints: string[];
  assignment: string; questions: Question[]; videoUrl?: string | null; version?: number; unlocked: boolean; progress: Progress | null;
};
type Profile = {
  _id: string; ambassadorId: string; college?: string | null; course?: string | null;
  academicYear?: string | null; city: string; preferredRole: string;
  weeklyAvailabilityHours: number; termsAccepted: boolean; status: string; currentLevel: string;
  certificateNo?: string | null; certifiedAt?: string | null;
};
type Task = {
  _id: string; title: string; category: string; description: string; status: string;
  dueAt?: string | null; evidenceText?: string | null; evidenceUrl?: string | null; reviewReason?: string | null;
};
type Campaign = { id: string; projectId?: string | null; name: string; projectName: string; location: string; targetInventory: number; salesTarget: number; verifiedSales: number; unitAreaSqFt: number; targetDays: number; status: string };
type Incentive = { _id: string; bookingReference: string; policyNameSnapshot: string; policyVersion: number; amount: number; status: string; paymentReference?: string | null; expectedPayoutAt?: string | null; recoveryStatus?: string | null; recoveryAmount?: number; createdAt: string };
type AmbassadorLead = {
  _id: string; leadReference: string; projectName: string; unitNumber?: string | null; stage: string;
  requirement?: string | null; budgetRange?: string | null; purchasePurpose?: string | null; preferredPlotSize?: string | null;
  purchaseTimeline?: string | null; sourceChannel?: string | null; customerDisplayName: string; customerPhone?: string | null;
  nextFollowUpAt?: string | null; createdAt: string; isDuplicate: boolean; ownershipReviewStatus: string;
  contactConsentRecorded: boolean; canScheduleFollowUp: boolean;
};
type FollowUp = {
  _id: string; leadReference: string; leadStage: string; projectName: string; dueAt: string; channel: string; note: string;
  status: string; outcome?: string | null; isOverdue: boolean;
};
type LeaderboardEntry = {
  rank: number | null; isMine: boolean; displayName: string; ambassadorId: string; currentLevel: string;
  modulesCompleted: number; approvedTasks: number; genuineEnquiries: number; qualifiedLeads: number;
  completedSiteVisits: number; verifiedSales: number; lostLeads: number; duplicateLeads: number;
  scorecardReviewed: boolean; seriousMisconduct: boolean; weightedScore: number | null;
  scores?: { genuineLeadQuality: number; customerCommunication: number; siteVisitContribution: number; verifiedSalesContribution: number; crmDiscipline: number; trainingSkillDevelopment: number; ethicsCompliance: number } | null;
  scorecardPolicyVersion?: number | null; reviewPeriodEnd?: string | null;
};
type Snapshot = {
  profile: Profile;
  verification: { emailVerified: boolean; phoneVerified: boolean; onboardingVerified: boolean };
  modules: Module[];
  tasks: Task[];
  campaigns: Campaign[];
  leadSummary: { total: number; new: number; contacted: number; siteVisit: number; booking: number; registered: number; lost: number };
  incentives: Incentive[];
  performance: { modulesCompleted: number; approvedTasks: number; pendingReviews: number; verifiedSales: number };
  careerLevels: Array<{ level: string; title: string; requirement: string }>;
};

const statusText: Record<string, string> = {
  REGISTERED: "Registered", VERIFICATION_PENDING: "Verification pending", TRAINING_IN_PROGRESS: "Training in progress",
  ASSESSMENT_PENDING: "Assessment review pending", CERTIFIED: "Certified", ACTIVE: "Active",
  TEMPORARILY_INACTIVE: "Temporarily inactive", SUSPENDED: "Suspended", EXITED: "Exited",
  NOT_STARTED: "Not started", IN_PROGRESS: "In progress", RETAKE_REQUIRED: "Retake required",
  COMPLETED: "Completed", APPROVED: "Approved", REJECTED: "Needs changes", PENDING: "Pending",
  PAYABLE: "Payable", PAID: "Paid", CANCELLED: "Cancelled",
};
const money = (value: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value || 0);

export default function AmbassadorOperatingSystemPage() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [myLeaderboardRank, setMyLeaderboardRank] = useState<LeaderboardEntry | null>(null);
  const [myLeads, setMyLeads] = useState<AmbassadorLead[]>([]);
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [followUpForm, setFollowUpForm] = useState<Record<string,{dueAt:string;channel:string;note:string}>>({});
  const [loading, setLoading] = useState(true);
  const [savingFollowUp, setSavingFollowUp] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [college, setCollege] = useState("");
  const [course, setCourse] = useState("");
  const [academicYear, setAcademicYear] = useState("");
  const [city, setCity] = useState("Lucknow");
  const [preferredRole, setPreferredRole] = useState("SALES");
  const [availability, setAvailability] = useState(5);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [activeDay, setActiveDay] = useState(1);
  const [answers, setAnswers] = useState<Record<number, number[]>>({});
  const [assignments, setAssignments] = useState<Record<number, string>>({});
  const [submittingDay, setSubmittingDay] = useState<number | null>(null);
  const [evidenceByTask, setEvidenceByTask] = useState<Record<string, { text: string; url: string }>>({});
  const [submittingTask, setSubmittingTask] = useState<string | null>(null);

  async function load() {
    try {
      const [res, rankRes, leadsRes, followUpsRes] = await Promise.all([
        api.get("/ambassador-os/me"),
        api.get("/ambassador-os/leaderboard").catch(() => ({ data: { leaderboard: [], mine: null } })),
        api.get("/ambassador-os/leads/me").catch(() => ({ data: { leads: [] as AmbassadorLead[] } })),
        api.get("/ambassador-os/follow-ups/me").catch(() => ({ data: { followUps: [] as FollowUp[] } })),
      ]);
      const data = res.data as Snapshot;
      setSnapshot(data);
      setLeaderboard(rankRes.data.leaderboard ?? []);
      setMyLeaderboardRank(rankRes.data.mine ?? null);
      setMyLeads(leadsRes.data.leads ?? []);
      setFollowUps(followUpsRes.data.followUps ?? []);
      setCollege(data.profile.college ?? "");
      setCourse(data.profile.course ?? "");
      setAcademicYear(data.profile.academicYear ?? "");
      setCity(data.profile.city ?? "Lucknow");
      setPreferredRole(data.profile.preferredRole ?? "SALES");
      setAvailability(data.profile.weeklyAvailabilityHours ?? 5);
      setAcceptTerms(data.profile.termsAccepted);
      const firstOpen = data.modules.find((m) => m.unlocked && m.progress?.status !== "COMPLETED");
      if (firstOpen) setActiveDay(firstOpen.day);
    } catch (error: any) {
      toast.error(error?.response?.data?.error || "Could not load your Ambassador workspace");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSavingProfile(true);
    try {
      await api.put("/ambassador-os/profile", {
        college, course, academicYear, city, preferredRole,
        weeklyAvailabilityHours: availability, acceptTerms,
      });
      toast.success("Ambassador profile saved");
      await load();
    } catch (error: any) {
      toast.error(error?.response?.data?.error || "Could not save profile");
    } finally {
      setSavingProfile(false);
    }
  }

  async function submitQuiz(module: Module) {
    const selected = answers[module.day] ?? Array(5).fill(-1);
    if (selected.some((answer) => answer < 0)) {
      toast.error("Answer all five questions before submitting");
      return;
    }
    const assignmentText = (assignments[module.day] ?? "").trim();
    if (assignmentText.length < 5) {
      toast.error("Complete the practical assignment before submitting");
      return;
    }
    setSubmittingDay(module.day);
    try {
      const res = await api.post(`/ambassador-os/training/${module.day}/submit`, { answers: selected, assignmentText });
      toast[res.data.passedWrittenAssessment ? "success" : "error"](res.data.message);
      await load();
    } catch (error: any) {
      toast.error(error?.response?.data?.error || "Assessment submission failed");
    } finally {
      setSubmittingDay(null);
    }
  }

  async function startTask(task: Task) {
    try {
      await api.post(`/ambassador-os/tasks/${task._id}/start`);
      toast.success("Task marked in progress");
      await load();
    } catch (error: any) { toast.error(error?.response?.data?.error || "Could not start task"); }
  }

  async function scheduleFollowUp(lead: AmbassadorLead) {
    const values = followUpForm[lead._id] ?? { dueAt: "", channel: "CALL", note: "" };
    if (!values.dueAt || values.note.trim().length < 5) {
      toast.error("Choose a future follow-up time and add a useful note");
      return;
    }
    setSavingFollowUp(lead._id);
    try {
      await api.post("/ambassador-os/follow-ups", {
        leadId: lead._id, dueAt: new Date(values.dueAt).toISOString(),
        channel: values.channel, note: values.note.trim(),
      });
      toast.success("Follow-up reminder scheduled");
      await load();
    } catch (error: any) {
      toast.error(error?.response?.data?.error || "Could not schedule follow-up");
    } finally { setSavingFollowUp(null); }
  }

  async function updateFollowUp(item: FollowUp, status: "DONE" | "MISSED" | "CANCELLED") {
    try {
      await api.patch("/ambassador-os/follow-ups/" + item._id + "/status", {
        status, outcome: status === "DONE" ? "Completed by Ambassador" : status === "MISSED" ? "Follow-up attempt missed" : "Cancelled by Ambassador",
      });
      toast.success("Reminder updated");
      await load();
    } catch (error: any) { toast.error(error?.response?.data?.error || "Could not update reminder"); }
  }

  async function submitTask(task: Task) {
    const evidence = evidenceByTask[task._id] ?? { text: task.evidenceText ?? "", url: task.evidenceUrl ?? "" };
    setSubmittingTask(task._id);
    try {
      await api.post(`/ambassador-os/tasks/${task._id}/submit`, {
        evidenceText: evidence.text, evidenceUrl: evidence.url || undefined,
      });
      toast.success("Task submitted for review");
      await load();
    } catch (error: any) {
      toast.error(error?.response?.data?.error || "Task submission failed");
    } finally {
      setSubmittingTask(null);
    }
  }

  const nextLevel = useMemo(() => {
    if (!snapshot) return null;
    return snapshot.careerLevels.find((level) => level.level === snapshot.profile.currentLevel) ?? snapshot.careerLevels[0];
  }, [snapshot]);

  if (loading) return <main className="min-h-screen p-6 text-white"><p className="text-sm text-muted-foreground">Loading your Ambassador Operating System…</p></main>;
  if (!snapshot) return <main className="min-h-screen p-6 text-white"><p>Unable to load your workspace. Refresh the page and sign in again.</p></main>;

  const { profile, verification, modules, tasks, campaigns, leadSummary, incentives, performance, careerLevels } = snapshot;
  const selectedModule = modules.find((module) => module.day === activeDay) ?? modules[0];
  const selectedAnswers = answers[selectedModule.day] ?? Array(5).fill(-1);

  return (
    <main className="min-h-screen space-y-7 p-4 text-white sm:p-6 lg:p-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link to="/ambassador/dashboard" className="mb-3 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-white"><ArrowLeft size={16} /> Ambassador Dashboard</Link>
          <div className="flex items-center gap-3"><div className="rounded-2xl border border-sky-400/20 bg-sky-400/10 p-3"><GraduationCap className="text-sky-300" size={26} /></div>
            <div><h1 className="text-2xl font-semibold sm:text-3xl">Ambassador Operating System</h1><p className="mt-1 text-sm text-muted-foreground">Learn, complete tasks, contribute to sales and track your journey.</p></div>
          </div>
        </div>
        <div className="flex items-center gap-2"><Badge variant={profile.status === "ACTIVE" ? "success" : "warning"}>{statusText[profile.status] ?? profile.status}</Badge><Badge variant="info">{profile.currentLevel}</Badge></div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Training completed", value: `${performance.modulesCompleted}/7`, sub: "Trainer approval required", Icon: BookOpen },
          { label: "My assigned tasks", value: String(tasks.filter((t) => !["APPROVED", "CLOSED"].includes(t.status)).length), sub: `${performance.approvedTasks} approved`, Icon: ClipboardList },
          { label: "My submitted leads", value: String(leadSummary.total), sub: `${leadSummary.registered} registered/completed`, Icon: TrendingUp },
          { label: "Recorded incentives", value: money(incentives.reduce((sum, item) => sum + item.amount, 0)), sub: "Subject to eligibility and payout approval", Icon: Wallet },
        ].map(({ label, value, sub, Icon }) => <Card key={label} className="border-white/10 bg-white/[0.035] p-4"><div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">{label}</span><Icon className="text-sky-300" size={18} /></div><p className="mt-3 text-2xl font-semibold">{value}</p><p className="mt-1 text-xs text-muted-foreground">{sub}</p></Card>)}
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.1fr_.9fr]">
        <Card className="border-white/10 bg-white/[0.035] p-5">
          <div className="mb-4 flex items-center gap-2"><Users size={19} className="text-sky-300" /><h2 className="text-lg font-semibold">My Ambassador Profile</h2></div>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/10 p-3"><div><p className="text-xs text-muted-foreground">Permanent Ambassador ID</p><p className="font-semibold tracking-wide">{profile.ambassadorId}</p></div><Badge variant="info">{profile.termsAccepted ? "Terms accepted" : "Terms pending"}</Badge></div>
          <div className="mb-4 grid gap-2 sm:grid-cols-3">
            <StatusPill label="Email" value={verification.emailVerified ? "Verified" : "Pending"} good={verification.emailVerified} />
            <StatusPill label="Phone" value={verification.phoneVerified ? "Verified" : "Pending"} good={verification.phoneVerified} />
            <StatusPill label="Identity verification" value={verification.onboardingVerified ? "Verified" : "Required"} good={verification.onboardingVerified} />
          </div>
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={saveProfile}>
            <Field label="College" value={college} onChange={setCollege} placeholder="Your college" />
            <Field label="Course" value={course} onChange={setCourse} placeholder="e.g. BBA / BTech" />
            <Field label="Academic year" value={academicYear} onChange={setAcademicYear} placeholder="e.g. 2nd year" />
            <Field label="City" value={city} onChange={setCity} placeholder="Your city" />
            <label className="block text-sm"><span className="mb-1.5 block text-muted-foreground">Preferred role</span><select className="h-10 w-full rounded-lg border border-white/10 bg-slate-950 px-3" value={preferredRole} onChange={(e) => setPreferredRole(e.target.value)}><option value="SALES">Sales</option><option value="MARKETING">Marketing</option><option value="RESEARCH">Research</option><option value="OPERATIONS">Operations</option></select></label>
            <label className="block text-sm"><span className="mb-1.5 block text-muted-foreground">Weekly availability (hours)</span><input type="number" min={1} max={60} className="h-10 w-full rounded-lg border border-white/10 bg-slate-950 px-3" value={availability} onChange={(e) => setAvailability(Number(e.target.value))} /></label>
            {!profile.termsAccepted && <>
              <div className="sm:col-span-2 rounded-xl border border-white/10 bg-black/10 p-4">
                <h3 className="text-sm font-semibold">Ambassador program rules · Version 1</h3>
                <ul className="mt-2 space-y-1.5 text-xs leading-5 text-muted-foreground">
                  <li>• Share only current, Truvi-approved property, price and legal information. Never promise returns, approvals or discounts that have not been verified.</li>
                  <li>• Collect and share a customer’s contact details only after that customer has agreed to the specific enquiry handoff.</li>
                  <li>• Do not fabricate leads, create duplicates to inflate performance, manipulate referral attribution, or change booking/sale verification.</li>
                  <li>• Incentives depend on an approved written policy and an eligible verified transaction; registration alone does not guarantee a payout, job or promotion.</li>
                  <li>• Treat customer and internal business information confidentially. Misleading conduct or privacy violations can lead to suspension or removal from the program.</li>
                </ul>
                <p className="mt-3 text-[11px] text-muted-foreground">Your acceptance timestamp and terms version are stored for audit. This screen is an operational summary and should be replaced or supplemented by the formally approved full program terms before production launch.</p>
              </div>
              <label className="sm:col-span-2 flex items-start gap-2 text-sm text-muted-foreground"><input type="checkbox" checked={acceptTerms} onChange={(e) => setAcceptTerms(e.target.checked)} className="mt-1" /><span>I have read and accept the Truvi Ambassador Program rules and code of conduct shown above.</span></label>
            </>}
            <div className="sm:col-span-2"><Button type="submit" disabled={savingProfile} className="w-full sm:w-auto">{savingProfile ? "Saving…" : "Save profile"}</Button></div>
          </form>
        </Card>

        <Card className="border-white/10 bg-white/[0.035] p-5">
          <div className="mb-4 flex items-center gap-2"><Award size={19} className="text-sky-300" /><h2 className="text-lg font-semibold">My Journey</h2></div>
          {profile.certificateNo && profile.certifiedAt && <div className="mb-4 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.06] p-4"><p className="flex items-center gap-2 text-sm font-semibold text-emerald-200"><Award size={16}/> Certification earned</p><p className="mt-1 text-xs text-muted-foreground">{profile.certificateNo} · {new Date(profile.certifiedAt).toLocaleDateString()}</p><Link to="/ambassador/certificate" className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-emerald-200 hover:text-emerald-100">View / print certificate →</Link></div>}
          <div className="mb-4 rounded-xl border border-white/10 bg-black/10 p-4"><p className="text-xs text-muted-foreground">Current level</p><p className="mt-1 text-xl font-semibold">{nextLevel?.level} · {nextLevel?.title}</p><p className="mt-2 text-sm text-muted-foreground">{nextLevel?.requirement}</p></div>
          <div className="space-y-3">
            {careerLevels.map((level) => {
              const reached = careerLevels.findIndex((x) => x.level === profile.currentLevel) >= careerLevels.findIndex((x) => x.level === level.level);
              return <div key={level.level} className="flex items-start gap-3"><div className={`mt-0.5 rounded-full p-1.5 ${reached ? "bg-emerald-500/15 text-emerald-300" : "bg-white/5 text-muted-foreground"}`}>{reached ? <CheckCircle2 size={16} /> : <LockKeyhole size={16} />}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="text-sm font-medium">{level.level} · {level.title}</span>{level.level === profile.currentLevel && <Badge variant="info">Current</Badge>}</div><p className="text-xs text-muted-foreground">{level.requirement}</p></div></div>;
            })}
          </div>
          <p className="mt-4 text-xs text-muted-foreground">Levels and opportunities are subject to assessment, vacancies and eligibility; advancement is not automatic or guaranteed.</p>
        </Card>
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="flex items-center gap-2 text-xl font-semibold"><BookOpen className="text-sky-300" /> Seven-day Learning Academy</h2><p className="mt-1 text-sm text-muted-foreground">Each day unlocks after the previous day's quiz, practical and ethics review have been approved.</p></div><Badge variant="info">{performance.modulesCompleted}/7 completed</Badge></div>
        {!profile.termsAccepted && <p className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-sm text-amber-100">Save your profile and accept the program terms to unlock training. Identity verification is also required.</p>}
        {!verification.onboardingVerified && <p className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-sm text-amber-100">Complete the existing Truvi identity verification process before submitting training assessments.</p>}
        <div className="grid gap-4 lg:grid-cols-[290px_1fr]">
          <div className="space-y-2">
            {modules.map((module) => {
              const completed = module.progress?.status === "COMPLETED";
              return <button key={module.day} disabled={!module.unlocked && !completed} onClick={() => setActiveDay(module.day)} className={`w-full rounded-xl border p-3 text-left transition ${activeDay === module.day ? "border-sky-400/40 bg-sky-400/10" : "border-white/10 bg-white/[0.025] hover:bg-white/[0.05]"} disabled:cursor-not-allowed disabled:opacity-45`}>
                <div className="flex items-start gap-3"><div className={`mt-0.5 rounded-lg p-2 ${completed ? "bg-emerald-500/15 text-emerald-300" : "bg-white/5 text-sky-300"}`}>{completed ? <CheckCircle2 size={18} /> : module.unlocked ? <BookOpen size={18} /> : <LockKeyhole size={18} />}</div><div className="min-w-0 flex-1"><p className="text-sm font-medium">Day {module.day} · {module.title}</p><p className="mt-1 text-xs text-muted-foreground">{module.progress ? statusText[module.progress.status] ?? module.progress.status : module.unlocked ? "Ready to learn" : "Locked"}</p>{module.progress && <p className="mt-1 text-xs text-muted-foreground">Written score: {module.progress.quizScore}/100</p>}</div></div>
              </button>;
            })}
          </div>
          <Card className="min-w-0 border-white/10 bg-white/[0.035] p-5">
            <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs uppercase tracking-[.16em] text-sky-300">Day {selectedModule.day} of 7</p><h3 className="mt-1 text-xl font-semibold">{selectedModule.title}</h3><p className="mt-1 text-sm text-muted-foreground">{selectedModule.summary}</p></div>{selectedModule.progress && <Badge variant={selectedModule.progress.status === "COMPLETED" ? "success" : "warning"}>{statusText[selectedModule.progress.status]}</Badge>}</div>
            <div className="mt-5 rounded-xl border border-white/10 bg-black/10 p-4"><h4 className="font-medium">Lesson</h4>{selectedModule.videoUrl && <a href={selectedModule.videoUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex text-sm text-sky-300 underline">Watch published lesson video</a>}<p className="mt-2 text-sm leading-6 text-muted-foreground">{selectedModule.lesson}</p><ul className="mt-3 space-y-1.5">{selectedModule.keyPoints.map((point) => <li key={point} className="flex gap-2 text-sm"><CheckCircle2 size={15} className="mt-0.5 shrink-0 text-emerald-300" /><span>{point}</span></li>)}</ul></div>
            {selectedModule.unlocked && selectedModule.progress?.status !== "COMPLETED" ? <div className="mt-5 space-y-5">
              <div><h4 className="font-medium">Practical assignment</h4><p className="mt-1 text-sm text-muted-foreground">{selectedModule.assignment}</p><textarea rows={4} className="mt-3 w-full rounded-xl border border-white/10 bg-slate-950 p-3 text-sm outline-none focus:border-sky-400/50" placeholder="Write your assignment here…" value={assignments[selectedModule.day] ?? selectedModule.progress?.assignmentText ?? ""} onChange={(e) => setAssignments((prev) => ({ ...prev, [selectedModule.day]: e.target.value }))} /></div>
              <div className="space-y-4"><h4 className="font-medium">Written quiz · 5 questions</h4>{selectedModule.questions.map((question, index) => <div key={question.prompt} className="rounded-xl border border-white/10 p-4"><p className="text-sm font-medium">{index + 1}. {question.prompt}</p><div className="mt-3 space-y-2">{question.options.map((option, optionIndex) => <label key={option} className={`flex cursor-pointer items-start gap-2 rounded-lg border p-2.5 text-sm ${selectedAnswers[index] === optionIndex ? "border-sky-400/40 bg-sky-400/10" : "border-transparent bg-white/[0.025]"}`}><input type="radio" name={`day-${selectedModule.day}-q-${index}`} checked={selectedAnswers[index] === optionIndex} onChange={() => setAnswers((prev) => { const next = [...(prev[selectedModule.day] ?? Array(5).fill(-1))]; next[index] = optionIndex; return { ...prev, [selectedModule.day]: next }; })} className="mt-1" /><span>{option}</span></label>)}</div></div>)}</div>
              <Button onClick={() => void submitQuiz(selectedModule)} disabled={submittingDay === selectedModule.day} className="w-full sm:w-auto"><Send size={16} className="mr-2" />{submittingDay === selectedModule.day ? "Submitting…" : "Submit assignment & quiz"}</Button>
              <p className="text-xs text-muted-foreground">Quiz answers are checked by the server. Score 80/100 or higher passes the written part; a Truvi coordinator must also approve practical communication and ethics. Certification is internal to Truvi.</p>
            </div> : selectedModule.progress ? <div className="mt-5 rounded-xl border border-white/10 p-4"><p className="text-sm">Written score: <strong>{selectedModule.progress.quizScore}/100</strong> · Practical: <strong>{statusText[selectedModule.progress.practicalStatus] ?? selectedModule.progress.practicalStatus}</strong> · Ethics: <strong>{statusText[selectedModule.progress.ethicsStatus] ?? selectedModule.progress.ethicsStatus}</strong></p>{selectedModule.progress.trainerFeedback && <p className="mt-2 text-sm text-muted-foreground">Trainer feedback: {selectedModule.progress.trainerFeedback}</p>}{selectedModule.progress.status === "RETAKE_REQUIRED" && <p className="mt-2 text-sm text-amber-200">Review the material and submit the quiz again.</p>}</div> : <div className="mt-5 flex items-center gap-2 rounded-xl border border-white/10 p-4 text-sm text-muted-foreground"><LockKeyhole size={17} />Accept program terms and complete identity verification to begin.</div>}
          </Card>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1fr_1fr]">
        <Card className="border-white/10 bg-white/[0.035] p-5">
          <div className="mb-4 flex items-center justify-between gap-2"><h2 className="flex items-center gap-2 text-lg font-semibold"><ClipboardList className="text-sky-300" /> My Tasks</h2><Badge variant="info">{tasks.length}</Badge></div>
          {tasks.length === 0 ? <Empty text="No operating-system tasks assigned yet." /> : <div className="space-y-3">{tasks.map((task) => <div key={task._id} className="rounded-xl border border-white/10 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-medium">{task.title}</p><Badge variant={task.status === "APPROVED" ? "success" : task.status === "REJECTED" ? "danger" : "info"}>{statusText[task.status] ?? task.status}</Badge></div><p className="mt-1 text-xs uppercase tracking-wide text-sky-300">{task.category.replace(/_/g, " ")}</p><p className="mt-2 text-sm text-muted-foreground">{task.description}</p>{task.dueAt && <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground"><Clock3 size={13} />Due {new Date(task.dueAt).toLocaleString()}</p>}{task.reviewReason && <p className="mt-2 text-sm text-amber-200">Reviewer: {task.reviewReason}</p>}{task.status === "ASSIGNED" && <Button size="sm" variant="outline" className="mt-3" onClick={() => void startTask(task)}>Start task</Button>}{["ASSIGNED", "IN_PROGRESS", "REJECTED"].includes(task.status) && <div className="mt-3 space-y-2"><textarea rows={2} className="w-full rounded-lg border border-white/10 bg-slate-950 p-3 text-sm" placeholder="Describe the work completed / evidence…" value={evidenceByTask[task._id]?.text ?? task.evidenceText ?? ""} onChange={(e) => setEvidenceByTask((prev) => ({ ...prev, [task._id]: { text: e.target.value, url: prev[task._id]?.url ?? task.evidenceUrl ?? "" } }))} /><input className="h-10 w-full rounded-lg border border-white/10 bg-slate-950 px-3 text-sm" placeholder="Evidence URL (optional)" value={evidenceByTask[task._id]?.url ?? task.evidenceUrl ?? ""} onChange={(e) => setEvidenceByTask((prev) => ({ ...prev, [task._id]: { text: prev[task._id]?.text ?? task.evidenceText ?? "", url: e.target.value } }))} /><Button size="sm" onClick={() => void submitTask(task)} disabled={submittingTask === task._id}>{submittingTask === task._id ? "Submitting…" : "Submit for review"}</Button></div>}</div>)}</div>}
        </Card>
        <Card className="border-white/10 bg-white/[0.035] p-5">
          <div className="mb-4 flex items-center justify-between gap-2"><h2 className="flex items-center gap-2 text-lg font-semibold"><Building2 className="text-sky-300" /> Active Campaigns</h2><Badge variant="info">{campaigns.length}</Badge></div>
          {campaigns.length === 0 ? <Empty text="No verified active campaign has been published yet." /> : <div className="space-y-3">{campaigns.map((campaign) => <div key={campaign.id} className="rounded-xl border border-white/10 p-4"><p className="font-semibold">{campaign.name}</p><p className="mt-1 text-sm text-muted-foreground">{campaign.projectName} · {campaign.location}</p><div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4"><MiniMetric label="Available-unit target" value={String(campaign.targetInventory)} /><MiniMetric label="Verified sales / goal" value={`${campaign.verifiedSales} / ${campaign.salesTarget}`} /><MiniMetric label="Area per unit" value={`${campaign.unitAreaSqFt.toLocaleString("en-IN")} sq ft`} /><MiniMetric label="Target days" value={String(campaign.targetDays)} /></div><p className="mt-3 text-xs text-muted-foreground">Campaign targets are planning settings, not a promise of availability or a guaranteed sale.</p></div>)}</div>}
        </Card>
      </section>

      <section className="grid gap-5 xl:grid-cols-[.8fr_1.2fr]">
        <Card className="border-white/10 bg-white/[0.035] p-5">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold"><TrendingUp className="text-sky-300" /> My Lead Funnel</h2>
          <div className="grid grid-cols-2 gap-3">{[
            ["New enquiries",leadSummary.new],["Contacted",leadSummary.contacted],["Site visit",leadSummary.siteVisit],["Booking",leadSummary.booking],["Registered/completed",leadSummary.registered],["Lost",leadSummary.lost],
          ].map(([label,value])=><MiniMetric key={String(label)} label={String(label)} value={String(value)} />)}</div>
          <p className="mt-3 text-xs text-muted-foreground">Counts show your submitted leads only. Booking and registration are not assumed from task or referral activity.</p>
          <Link className="mt-4 inline-flex text-sm text-sky-300 hover:text-sky-200" to="/inventory">Explore approved inventory →</Link>
        </Card>
        <Card className="border-white/10 bg-white/[0.035] p-5">
          <h2 className="mb-1 flex items-center gap-2 text-lg font-semibold"><Wallet className="text-sky-300" /> My Incentives & Payouts</h2><p className="mb-4 text-sm text-muted-foreground">Only verified, policy-eligible sales appear here. Estimated or unapproved rewards are not earnings.</p>
          {incentives.length === 0 ? <Empty text="No eligible incentive records have been approved for you yet." /> : <div className="overflow-x-auto"><table className="w-full min-w-[500px] text-left text-sm"><thead className="text-xs text-muted-foreground"><tr><th className="pb-3 pr-3">Booking reference</th><th className="pb-3 pr-3">Policy</th><th className="pb-3 pr-3">Amount</th><th className="pb-3 pr-3">Expected date</th><th className="pb-3 pr-3">Status / review</th></tr></thead><tbody>{incentives.map((item)=><tr key={item._id} className="border-t border-white/10"><td className="py-3 pr-3">{item.bookingReference.slice(0,8).toUpperCase()}</td><td className="py-3 pr-3">{item.policyNameSnapshot} · v{item.policyVersion}</td><td className="py-3 pr-3 font-medium">{money(item.amount)}</td><td className="py-3 pr-3"><Badge variant={item.status === "PAID" ? "success" : "info"}>{statusText[item.status] ?? item.status}</Badge>{item.paymentReference && <p className="mt-1 text-xs text-muted-foreground">{item.paymentReference}</p>}</td></tr>)}</tbody></table></div>}
        </Card>
      </section>

      <section className="space-y-4">
        <div><h2 className="flex items-center gap-2 text-xl font-semibold"><Clock3 className="text-sky-300" /> My Follow-up Reminders</h2><p className="mt-1 text-sm text-muted-foreground">Schedule consent-safe follow-ups, record the next action and mark outcomes. Only your attributed leads are available.</p></div>
        <Card className="border-white/10 bg-white/[0.035] p-4">
          {followUps.length===0 ? <Empty text="No follow-up reminders are scheduled yet."/> : <div className="space-y-2">{followUps.map((item)=><div key={item._id} className="flex flex-wrap items-center gap-3 rounded-xl border border-white/10 p-3"><div className="min-w-0 flex-1"><p className="font-medium">{item.leadReference} · {item.projectName}</p><p className="mt-1 text-xs text-muted-foreground">{pretty(item.channel)} · Due {new Date(item.dueAt).toLocaleString("en-IN")}</p><p className="mt-1 text-sm">{item.note}</p><Badge variant={item.isOverdue?"warning":item.status==="DONE"?"success":"info"}>{item.isOverdue?"Overdue":pretty(item.status)}</Badge>{item.outcome&&<p className="mt-1 text-xs text-muted-foreground">{item.outcome}</p>}</div>{item.status==="PENDING"&&<div className="flex gap-2"><Button size="sm" onClick={()=>void updateFollowUp(item,"DONE")}>Done</Button><Button size="sm" variant="outline" onClick={()=>void updateFollowUp(item,"MISSED")}>Missed</Button><Button size="sm" variant="outline" onClick={()=>void updateFollowUp(item,"CANCELLED")}>Cancel</Button></div>}</div>)}</div>}
        </Card>
      </section>

      <section className="space-y-4">
        <div><h2 className="flex items-center gap-2 text-xl font-semibold"><Users className="text-sky-300" /> My Lead Records</h2><p className="mt-1 text-sm text-muted-foreground">Customer contact details are shown only for your own consent-recorded submissions. Do not export or share contact details outside Truvi workflows.</p></div>
        {myLeads.length===0 ? <Empty text="Your consented lead submissions and attributable referral leads will appear here."/> : <div className="space-y-3">{myLeads.map((lead)=> {
          const values = followUpForm[lead._id] ?? {dueAt:"",channel:"CALL",note:""};
          return <Card key={lead._id} className="border-white/10 bg-white/[0.035] p-4">
            <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="font-semibold">{lead.leadReference} · {lead.projectName}</p><p className="mt-1 text-sm text-muted-foreground">{lead.customerDisplayName}{lead.customerPhone ? " · "+lead.customerPhone : ""}</p><p className="mt-1 text-xs text-muted-foreground">{pretty(lead.stage)} · {pretty(lead.sourceChannel??"OTHER")}{lead.unitNumber?" · Unit "+lead.unitNumber:""}</p><p className="mt-1 text-xs text-muted-foreground">{pretty(lead.purchasePurpose??"UNDECIDED")} · {lead.budgetRange??"Budget not set"} · {lead.preferredPlotSize??lead.requirement??"Size not set"} · {pretty(lead.purchaseTimeline??"NOT_DECIDED")}</p></div><div className="text-right"><Badge variant={lead.contactConsentRecorded?"success":"warning"}>{lead.contactConsentRecorded?"Consent recorded":"Consent missing"}</Badge><p className="mt-1 text-xs text-muted-foreground">{lead.nextFollowUpAt ? "Next follow-up "+new Date(lead.nextFollowUpAt).toLocaleString("en-IN") : "No next follow-up date"}</p>{lead.isDuplicate&&<Badge variant="danger">Duplicate review</Badge>}{["OPEN","UNDER_REVIEW"].includes(lead.ownershipReviewStatus)&&<Badge variant="warning">Ownership review</Badge>}</div></div>
            {lead.canScheduleFollowUp&&<div className="mt-4 grid gap-2 border-t border-white/10 pt-3 sm:grid-cols-4"><label className="text-xs text-muted-foreground">Due date and time<input type="datetime-local" className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-slate-950 px-2 text-sm" value={values.dueAt} onChange={(e)=>setFollowUpForm((prev)=>({...prev,[lead._id]:{...values,dueAt:e.target.value}}))}/></label><label className="text-xs text-muted-foreground">Channel<select className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-slate-950 px-2 text-sm" value={values.channel} onChange={(e)=>setFollowUpForm((prev)=>({...prev,[lead._id]:{...values,channel:e.target.value}}))}>{[["CALL","Call"],["WHATSAPP","WhatsApp"],["EMAIL","Email"],["MEETING","Meeting"]].map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label><label className="text-xs text-muted-foreground sm:col-span-2">Next step / note<input className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-slate-950 px-3 text-sm" placeholder="Agreed call, visit or information follow-up" value={values.note} onChange={(e)=>setFollowUpForm((prev)=>({...prev,[lead._id]:{...values,note:e.target.value}}))}/></label><div className="sm:col-span-4"><Button size="sm" onClick={()=>void scheduleFollowUp(lead)} disabled={savingFollowUp===lead._id}>{savingFollowUp===lead._id?"Scheduling…":"Schedule reminder"}</Button></div></div>}
          </Card>;
        })}</div>}
      </section>

      <section className="space-y-4">
        <div><h2 className="flex items-center gap-2 text-xl font-semibold"><Award className="text-amber-300" /> Quality Leaderboard</h2><p className="mt-1 text-sm text-muted-foreground">Weighted scorecards follow the PDF: genuine lead quality 25%, customer communication 20%, site visits 15%, verified sales 15%, CRM discipline 10%, training/skills 10%, ethics/compliance 5%. Serious misconduct excludes an Ambassador regardless of sales score. This is recognition—not a commission formula.</p></div>
        <Card className="border-white/10 bg-white/[0.035] p-4">
          {leaderboard.length === 0 ? <Empty text="No weighted scorecards have been approved yet. Admin must review the seven dimensions before Ambassadors can be ranked."/> : <div className="space-y-2">{leaderboard.map((entry) => <div key={entry.ambassadorId} className={"flex flex-wrap items-center gap-3 rounded-xl border p-3 " + (entry.isMine ? "border-sky-400/30 bg-sky-400/[0.06]" : "border-white/10 bg-black/10")}><div className={"grid size-9 shrink-0 place-items-center rounded-xl font-semibold " + (entry.rank <= 3 ? "bg-amber-400/15 text-amber-200" : "bg-white/5 text-muted-foreground")}>{entry.rank??"—"}</div><div className="min-w-0 flex-1"><p className="font-medium">{entry.displayName}</p><p className="text-xs text-muted-foreground">{entry.ambassadorId} · {entry.currentLevel}</p></div><div className="grid grid-cols-2 gap-x-4 gap-y-1 text-right sm:grid-cols-4"><TinyStat label="Weighted score" value={entry.weightedScore===null?"Not reviewed":entry.weightedScore.toFixed(2)+"/100"}/><TinyStat label="Genuine enquiries" value={String(entry.genuineEnquiries)}/><TinyStat label="Qualified leads" value={String(entry.qualifiedLeads)}/><TinyStat label="Verified sales" value={String(entry.verifiedSales)}/></div></div>)}</div>}
          {myLeaderboardRank && myLeaderboardRank.seriousMisconduct && <p className="mt-3 rounded-lg border border-amber-500/20 p-3 text-sm text-amber-200">Your scorecard has a serious-conduct finding. You are excluded from ranking while this finding remains in effect.</p>}
          {myLeaderboardRank && !myLeaderboardRank.seriousMisconduct && !myLeaderboardRank.scorecardReviewed && <p className="mt-3 rounded-lg border border-white/10 p-3 text-sm text-muted-foreground">Your activity metrics are recorded, but your weighted scorecard has not been reviewed yet; you are not ranked until an authorized reviewer scores all seven dimensions.</p>}
          {myLeaderboardRank && myLeaderboardRank.scorecardReviewed && myLeaderboardRank.rank !== null && myLeaderboardRank.rank > 10 && <p className="mt-3 rounded-lg border border-white/10 p-3 text-sm text-muted-foreground">Your current position: #{myLeaderboardRank.rank} with {myLeaderboardRank.weightedScore?.toFixed(2)}/100 weighted points.</p>}
          {myLeaderboardRank && myLeaderboardRank.scorecardReviewed && myLeaderboardRank.rank !== null && myLeaderboardRank.rank <= 10 && <p className="mt-3 text-xs text-muted-foreground">You're currently ranked #{myLeaderboardRank.rank} · {myLeaderboardRank.weightedScore?.toFixed(2)}/100, using scorecard policy v{myLeaderboardRank.scorecardPolicyVersion}.</p>}
          {!myLeaderboardRank && <p className="mt-3 text-xs text-muted-foreground">Ranking is available after activation and a reviewed performance scorecard.</p>}
        </Card>
      </section>

      <section className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-100"><div className="flex items-start gap-2"><ShieldCheck size={18} className="mt-0.5 shrink-0" /><p>Do not promise returns, unapproved prices, discounts or legal status. Customer consent, verified sales, approved incentive policy and an auditable payout record are required. Student activity does not automatically create a payable commission.</p></div></section>
    </main>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder: string }) {
  return <label className="block text-sm"><span className="mb-1.5 block text-muted-foreground">{label}</span><input className="h-10 w-full rounded-lg border border-white/10 bg-slate-950 px-3 outline-none focus:border-sky-400/50" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} /></label>;
}
function StatusPill({ label, value, good }: { label: string; value: string; good: boolean }) {
  return <div className="rounded-lg border border-white/10 p-2.5"><p className="text-xs text-muted-foreground">{label}</p><p className={`mt-1 flex items-center gap-1 text-sm ${good ? "text-emerald-300" : "text-amber-200"}`}>{good ? <CheckCircle2 size={13} /> : <Clock3 size={13} />}{value}</p></div>;
}
function MiniMetric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-white/10 bg-black/10 p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-base font-semibold">{value}</p></div>;
}
function TinyStat({ label, value }: { label: string; value: string }) { return <div><p className="text-[10px] text-muted-foreground">{label}</p><p className="text-sm font-semibold">{value}</p></div>; }
function Empty({ text }: { text: string }) { return <p className="rounded-xl border border-dashed border-white/10 p-5 text-sm text-muted-foreground">{text}</p>; }

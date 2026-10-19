import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card, Badge } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Users, GraduationCap, ClipboardList, Building2, Wallet, RefreshCw, BookOpen, Clock,
  CheckCircle2, ShieldCheck, Plus, ArrowRightLeft, ChartNoAxesCombined, Check, XCircle,
} from "lucide-react";

type Profile = {
  userId: string; ambassadorId: string; college?: string | null; course?: string | null; academicYear?: string | null;
  city: string; preferredRole: string; weeklyAvailabilityHours: number; termsAccepted: boolean; status: string;
  currentLevel: string; createdAt: string;
};
type ProfileRow = { profile: Profile; name: string; email: string; onboardingVerified: boolean };
type TrainingReview = {
  _id: string; userId: string; day: number; quizScore: number; assignmentText?: string | null;
  practicalStatus: string; ethicsStatus: string; attendanceStatus?: string;
  realEstateKnowledgeScore?: number | null; projectKnowledgeScore?: number | null;
  customerCommunicationScore?: number | null; marketingKnowledgeScore?: number | null; ethicsComplianceScore?: number | null;
  trainerFeedback?: string | null; status: string; ambassadorName: string; ambassadorEmail: string;
};
type Task = { _id: string; title: string; category: string; description: string; status: string; dueAt?: string | null; campaignId?: string | null; evidenceText?: string | null; evidenceUrl?: string | null; reviewReason?: string | null; assignedToId: string; ambassadorName: string; };
type Campaign = { _id: string; projectId?: string | null; name: string; projectName: string; location: string; targetInventory: number; salesTarget: number; verifiedSales?: number; unitAreaSqFt: number; targetDays: number; status: string; officialDataVerified: boolean; officialDataNotes?: string | null; };
type ProjectOption = { _id: string; name: string; city?: string; location?: string; approvalStatus?: string; isVerified?: boolean; priceListUrl?: string | null; totalUnits?: number | null };
type Policy = {
  _id: string; name: string; calculationType: string; amount: number; blockSizeSqFt: number; version: number;
  active: boolean; approvalReference?: string | null; campaignId?: string | null;
  eligibleSources?: string[]; requiredBookingStatus?: string; paymentMilestone?: string;
  cancellationTreatment?: string; payoutDelayDays?: number; approvalAuthority?: string | null;
  commissionAgreementReference?: string | null;
};
type Incentive = { _id: string; userId: string; ambassadorName: string; ambassadorEmail: string; bookingReference: string; amount: number; policyNameSnapshot: string; policyVersion: number; status: string; paymentReference?: string | null; expectedPayoutAt?: string | null; };
type EligibleBooking = { bookingId: string; bookingReference: string; leadReference: string; projectId: string; projectName: string; unitNumber?: string | null; areaSqFt?: number | null; bookingValue: number; amountReceived: number; bookingStatus: string; paymentMilestone: string; stage: string };
type PipelineLead = {
  _id: string; leadReference: string; stage: string; clientName: string; clientPhone: string;
  projectId: string; projectName: string; unitId?: string | null; unitNumber?: string | null;
  requirement?: string | null; sourceChannel?: string | null; budgetRange?: string | null;
  purchasePurpose?: string | null; preferredPlotSize?: string | null; purchaseTimeline?: string | null;
  creatorRole?: string | null; contactConsent?: boolean; contactConsentAt?: string | null; consentTextVersion?: string | null;
  isDuplicate: boolean; ownershipReviewStatus: string; ownershipReviewNotes?: string | null; assignedToId?: string | null; createdAt: string;
};
type BookingRecord = {
  _id: string; bookingReference: string; leadId: string; leadReference: string; projectId: string; projectName: string;
  unitId?: string | null; unitNumber?: string | null; status: string; bookingValue: number; amountReceived: number;
  paymentMilestone: string; paymentMilestoneNotes?: string | null; agreementReference?: string | null;
  expectedIncentivePayoutAt?: string | null; cancellationReason?: string | null; refundStatus?: string;
  refundAmount?: number; refundReference?: string | null; sourceChannel?: string | null; customerName: string; submitterName?: string | null;
};
type SalesPipeline = { leads: PipelineLead[]; bookings: BookingRecord[]; campaigns: Campaign[]; channelCosts: Array<{ _id: string; campaignId: string; sourceChannel: string; amount: number; periodStart: string; periodEnd: string; notes?: string | null }> };
type SalesSummary = { campaigns: Array<{ campaignId: string; campaignName: string; projectName: string; location: string; targetUnits: number; verifiedUnitsSold: number; unitsRemaining: number; totalEnquiries: number; qualifiedLeads: number; siteVisitsScheduled: number; siteVisitsCompleted: number; bookingsPendingVerification: number; cancelledBookings: number; campaignDaysRemaining: number | null; commissionEarned: number; totalBookingRecords: number; conversion: { leadToContacted: number; contactedToQualified: number; qualifiedToVisitScheduled: number; scheduledToCompleted: number; completedToBooking: number; bookingToVerifiedSale: number }; channels: Array<{ sourceChannel: string; cost: number; leads: number; qualifiedLeads: number; siteVisits: number; verifiedSales: number; costPerQualifiedLead: number | null }> }> };
type Overview = { profiles: ProfileRow[]; trainingReviews: TrainingReview[]; tasks: Task[]; campaigns: Campaign[]; policies: Policy[]; incentives: Incentive[]; stats: { ambassadors: number; awaitingAssessment: number; assignedTasks: number; submittedTasks: number; activeCampaigns: number; pendingIncentives: number; registeredSales: number } };

type Tab = "overview" | "ambassadors" | "training" | "training-content" | "tasks" | "sales" | "followups" | "campaigns" | "policies" | "incentives";
const TABS: { id: Tab; label: string; Icon: typeof Users }[] = [
  { id: "overview", label: "Overview", Icon: ChartNoAxesCombined }, { id: "ambassadors", label: "Ambassadors", Icon: Users },
  { id: "training", label: "Training Reviews", Icon: GraduationCap }, { id: "training-content", label: "Learning Content", Icon: BookOpen }, { id: "tasks", label: "Tasks", Icon: ClipboardList },
  { id: "sales", label: "Sales & Bookings", Icon: ChartNoAxesCombined }, { id: "followups", label: "Follow-ups", Icon: Clock },
  { id: "campaigns", label: "Campaigns", Icon: Building2 }, { id: "policies", label: "Incentive Policies", Icon: ShieldCheck },
  { id: "incentives", label: "Payouts", Icon: Wallet },
];
const money = (value: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value || 0);
const pretty = (value: string) => value.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

export default function AdminAmbassadorOperatingSystemPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [salesPipeline, setSalesPipeline] = useState<SalesPipeline | null>(null);
  const [salesSummary, setSalesSummary] = useState<SalesSummary | null>(null);
  const [followUps, setFollowUps] = useState<Array<any>>([]);
  const [loading, setLoading] = useState(true);
  const [loadingSales, setLoadingSales] = useState(false);
  const [tab, setTab] = useState<Tab>("overview");
  const [creatingTask, setCreatingTask] = useState(false);
  const [creatingCampaign, setCreatingCampaign] = useState(false);
  const [creatingPolicy, setCreatingPolicy] = useState(false);
  const [creatingIncentive, setCreatingIncentive] = useState(false);
  const [taskForm, setTaskForm] = useState({ title: "", category: "SALES", description: "", assignedToId: "", dueAt: "", campaignId: "" });
  const [campaignForm, setCampaignForm] = useState({ name: "Paradise Town — 114 Units Sales Mission", projectId: "", projectName: "Paradise Town", location: "Sultanpur Road, Lucknow", targetInventory: 114, salesTarget: 114, unitAreaSqFt: 1250, targetDays: 60, startsAt: "", officialDataNotes: "" });
  const [policyForm, setPolicyForm] = useState({
    name: "Paradise Town Ambassador Incentive", campaignId: "", calculationType: "PER_SQ_FT_BLOCK",
    amount: 100000, blockSizeSqFt: 1000, effectiveFrom: "", eligibleSources: [] as string[],
    requiredBookingStatus: "SALE_VERIFIED", paymentMilestone: "BOOKING_CONFIRMED",
    cancellationTreatment: "CANCEL_INCENTIVE", payoutDelayDays: 30, approvalAuthority: "", commissionAgreementReference: "",
  });
  const [incentiveForm, setIncentiveForm] = useState({ userId: "", bookingId: "", policyId: "", verifiedAreaSqFt: 1250 });
  const [eligibleBookings, setEligibleBookings] = useState<EligibleBooking[]>([]);
  const [loadingEligibleBookings, setLoadingEligibleBookings] = useState(false);
  const [bookingForm, setBookingForm] = useState({ leadId: "", campaignId: "", bookingValue: "", amountReceived: "0", paymentMilestone: "BOOKING_CONFIRMED", agreementReference: "", notes: "" });
  const [reviewBookingReason, setReviewBookingReason] = useState<Record<string,string>>({});
  const [refundForm, setRefundForm] = useState<Record<string,{refundAmount:string;refundReference:string;reason:string;agreementReference:string;paymentMilestone:string}>>({});
  const [channelCostForm, setChannelCostForm] = useState({ campaignId: "", sourceChannel: "AMBASSADOR_REFERRAL", amount: "", periodStart: "", periodEnd: "", evidenceReference: "", notes: "" });
  const [savingBooking, setSavingBooking] = useState(false);
  const [savingChannelCost, setSavingChannelCost] = useState(false);
  const [trainingContent, setTrainingContent] = useState<Array<any>>([]);
  const [trainingContentForm, setTrainingContentForm] = useState({ day: 1, title: "", summary: "", lesson: "", keyPoints: "", assignment: "", videoUrl: "", questionsJson: JSON.stringify([
    { prompt: "What is the safest practice?", options: ["Guess", "Use verified approved information", "Promise a result", "Ignore policy"], answer: 1 },
    { prompt: "Who approves property legal claims?", options: ["Any student", "Authorized reviewer", "A social post", "Nobody"], answer: 1 },
    { prompt: "What must be recorded for a third-party enquiry?", options: ["No consent", "Customer contact consent", "Only a nickname", "No source"], answer: 1 },
    { prompt: "When is a sale counted in targets?", options: ["On first enquiry", "On a submitted lead", "After authorized sale verification", "On task assignment"], answer: 2 },
    { prompt: "How do you handle unknown information?", options: ["Make it up", "Refer to approved material or authorized team", "Guarantee it", "Hide it"], answer: 1 },
  ], null, 2), isPublished: false });
  const [savingTrainingContent, setSavingTrainingContent] = useState(false);
  const [reviewState, setReviewState] = useState<Record<string, {
    practicalStatus: string; ethicsStatus: string; attendanceStatus: string; trainerFeedback: string;
    realEstateKnowledgeScore?: number; projectKnowledgeScore?: number; customerCommunicationScore?: number;
    marketingKnowledgeScore?: number; ethicsComplianceScore?: number;
  }>>({});
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
  useEffect(() => { void load(); void loadTrainingContent(); }, []);

  async function loadEligibleBookings(userId: string) {
    setEligibleBookings([]);
    setIncentiveForm((form) => ({ ...form, userId, bookingId: "", verifiedAreaSqFt: 1250 }));
    if (!userId) return;
    setLoadingEligibleBookings(true);
    try {
      const res = await api.get(`/ambassador-os/admin/eligible-bookings/${userId}`);
      setEligibleBookings(res.data.eligibleBookings as EligibleBooking[]);
    } catch (error: any) {
      toast.error(error?.response?.data?.error || "Could not load eligible verified bookings");
    } finally {
      setLoadingEligibleBookings(false);
    }
  }

  async function loadSalesWorkspace() {
    setLoadingSales(true);
    try {
      const [pipelineRes, summaryRes, followRes] = await Promise.all([
        api.get("/ambassador-os/admin/sales-pipeline"),
        api.get("/ambassador-os/admin/sales-dashboard"),
        api.get("/ambassador-os/admin/follow-ups"),
      ]);
      setSalesPipeline(pipelineRes.data as SalesPipeline);
      setSalesSummary(summaryRes.data as SalesSummary);
      setFollowUps(followRes.data.followUps ?? []);
    } catch (error: any) {
      toast.error(error?.response?.data?.error || "Could not load sales workspace");
    } finally {
      setLoadingSales(false);
    }
  }

  async function loadTrainingContent() {
    try {
      const res = await api.get("/ambassador-os/admin/training-modules");
      setTrainingContent(res.data.modules ?? []);
    } catch (error: any) { toast.error(error?.response?.data?.error || "Could not load learning content"); }
  }

  async function createPropertyBooking(e: React.FormEvent) {
    e.preventDefault(); setSavingBooking(true);
    try {
      await api.post("/ambassador-os/admin/bookings", {
        leadId: bookingForm.leadId, campaignId: bookingForm.campaignId || undefined,
        bookingValue: Number(bookingForm.bookingValue), amountReceived: Number(bookingForm.amountReceived),
        paymentMilestone: bookingForm.paymentMilestone,
        agreementReference: bookingForm.agreementReference || undefined,
        notes: bookingForm.notes || undefined,
      });
      toast.success("Property booking recorded and queued for review");
      setBookingForm({ leadId: "", campaignId: "", bookingValue: "", amountReceived: "0", paymentMilestone: "BOOKING_CONFIRMED", agreementReference: "", notes: "" });
      await loadSalesWorkspace(); await load();
    } catch (error: any) { toast.error(error?.response?.data?.error || "Could not record property booking"); }
    finally { setSavingBooking(false); }
  }

  async function updatePropertyBooking(booking: BookingRecord, status: string) {
    const extra = refundForm[booking._id] ?? { refundAmount: String(booking.amountReceived), refundReference: "", reason: "", agreementReference: "", paymentMilestone: booking.paymentMilestone };
    const reason = reviewBookingReason[booking._id] ?? extra.reason ?? booking.cancellationReason ?? "";
    try {
      await api.patch(`/ambassador-os/admin/bookings/${booking._id}/status`, {
        status, reason: reason || undefined,
        refundAmount: extra.refundAmount === "" ? undefined : Number(extra.refundAmount),
        refundReference: extra.refundReference || undefined,
        paymentMilestone: status === "SALE_VERIFIED" ? "REGISTRATION_COMPLETED" : (extra.paymentMilestone || undefined),
        agreementReference: extra.agreementReference || undefined,
      });
      toast.success(`Booking moved to ${pretty(status)}`);
      await loadSalesWorkspace(); await load();
    } catch (error: any) { toast.error(error?.response?.data?.error || "Could not update booking"); }
  }

  async function reviewLead(lead: PipelineLead, values: Record<string, unknown>) {
    try {
      await api.patch(`/ambassador-os/admin/leads/${lead._id}/review`, values);
      toast.success("Lead review saved");
      await loadSalesWorkspace();
    } catch (error: any) { toast.error(error?.response?.data?.error || "Could not review lead"); }
  }

  async function saveChannelCost(e: React.FormEvent) {
    e.preventDefault(); setSavingChannelCost(true);
    try {
      await api.post("/ambassador-os/admin/channel-costs", {
        ...channelCostForm, amount: Number(channelCostForm.amount),
        periodStart: new Date(channelCostForm.periodStart).toISOString(),
        periodEnd: new Date(channelCostForm.periodEnd).toISOString(),
        campaignId: channelCostForm.campaignId,
      });
      toast.success("Marketing channel cost recorded");
      setChannelCostForm({ campaignId: "", sourceChannel: "AMBASSADOR_REFERRAL", amount: "", periodStart: "", periodEnd: "", evidenceReference: "", notes: "" });
      await loadSalesWorkspace();
    } catch (error: any) { toast.error(error?.response?.data?.error || "Could not record channel cost"); }
    finally { setSavingChannelCost(false); }
  }

  async function saveTrainingContent(e: React.FormEvent) {
    e.preventDefault(); setSavingTrainingContent(true);
    try {
      const questions = JSON.parse(trainingContentForm.questionsJson);
      await api.post("/ambassador-os/admin/training-modules", {
        ...trainingContentForm, day: Number(trainingContentForm.day),
        keyPoints: trainingContentForm.keyPoints.split("\n").map((item) => item.trim()).filter(Boolean),
        videoUrl: trainingContentForm.videoUrl || undefined, questions,
      });
      toast.success(trainingContentForm.isPublished ? "Training module version published" : "Training module draft saved");
      await loadTrainingContent();
    } catch (error: any) {
      toast.error(error?.response?.data?.error || (error instanceof SyntaxError ? "Quiz questions must be valid JSON" : "Could not save training content"));
    } finally { setSavingTrainingContent(false); }
  }

  async function loadTrainingModule(module: any) {
    setTrainingContentForm({
      day: module.day, title: module.title, summary: module.summary, lesson: module.lesson,
      keyPoints: (module.keyPoints ?? []).join("\n"), assignment: module.assignment,
      videoUrl: module.videoUrl ?? "", questionsJson: JSON.stringify(module.questions ?? [], null, 2), isPublished: false,
    });
  }

  async function updateProfile(userId: string, values: Record<string, string>) {
    try { await api.patch(`/ambassador-os/admin/profiles/${userId}`, values); toast.success("Ambassador profile updated"); await load(); }
    catch (error: any) { toast.error(error?.response?.data?.error || "Could not update Ambassador"); }
  }
  async function reviewTraining(row: TrainingReview) {
    const values = reviewState[row._id] ?? {
      practicalStatus: row.practicalStatus, ethicsStatus: row.ethicsStatus,
      attendanceStatus: row.attendanceStatus ?? "NOT_RECORDED",
      trainerFeedback: row.trainerFeedback ?? "",
      realEstateKnowledgeScore: row.realEstateKnowledgeScore ?? undefined,
      projectKnowledgeScore: row.projectKnowledgeScore ?? undefined,
      customerCommunicationScore: row.customerCommunicationScore ?? undefined,
      marketingKnowledgeScore: row.marketingKnowledgeScore ?? undefined,
      ethicsComplianceScore: row.ethicsComplianceScore ?? undefined,
    };
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
        payoutDelayDays: Number(policyForm.payoutDelayDays),
        eligibleSources: policyForm.eligibleSources,
        campaignId: policyForm.campaignId || undefined,
        approvalAuthority: policyForm.approvalAuthority || undefined,
        commissionAgreementReference: policyForm.commissionAgreementReference || undefined,
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
      const selectedBooking = eligibleBookings.find((booking) => booking.bookingId === incentiveForm.bookingId);
      await api.post("/ambassador-os/admin/incentives", {
        userId: incentiveForm.userId, bookingId: incentiveForm.bookingId, policyId: incentiveForm.policyId,
        verifiedAreaSqFt: selectedBooking?.areaSqFt ? undefined : Number(incentiveForm.verifiedAreaSqFt),
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
      <nav className="flex gap-2 overflow-x-auto pb-1">{TABS.map(({ id, label, Icon }) => <button key={id} onClick={() => { setTab(id); if (id === "sales" || id === "followups") void loadSalesWorkspace(); if (id === "training-content") void loadTrainingContent(); }} className={`flex shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-sm ${tab === id ? "border-sky-400/40 bg-sky-400/10 text-sky-200" : "border-white/10 bg-white/[0.025] text-muted-foreground hover:text-white"}`}><Icon size={15} />{label}</button>)}</nav>

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

      {tab === "training" && <div className="space-y-3">
        <p className="text-sm text-muted-foreground">Review written quizzes, attendance, practical customer communication, ethics and the five-part certification rubric. Day 7 needs a complete rubric totaling at least 80/100.</p>
        {data.trainingReviews.length===0 ? <Empty text="No written assessments are waiting for review."/> : data.trainingReviews.map((row) => {
          const state = reviewState[row._id] ?? {
            practicalStatus: row.practicalStatus, ethicsStatus: row.ethicsStatus,
            attendanceStatus: row.attendanceStatus ?? "NOT_RECORDED",
            trainerFeedback: row.trainerFeedback ?? "",
            realEstateKnowledgeScore: row.realEstateKnowledgeScore ?? undefined,
            projectKnowledgeScore: row.projectKnowledgeScore ?? undefined,
            customerCommunicationScore: row.customerCommunicationScore ?? undefined,
            marketingKnowledgeScore: row.marketingKnowledgeScore ?? undefined,
            ethicsComplianceScore: row.ethicsComplianceScore ?? undefined,
          };
          const setField = (patch: Partial<typeof state>) => setReviewState((previous) => ({
            ...previous, [row._id]: {
              practicalStatus: previous[row._id]?.practicalStatus ?? row.practicalStatus,
              ethicsStatus: previous[row._id]?.ethicsStatus ?? row.ethicsStatus,
              attendanceStatus: previous[row._id]?.attendanceStatus ?? row.attendanceStatus ?? "NOT_RECORDED",
              trainerFeedback: previous[row._id]?.trainerFeedback ?? row.trainerFeedback ?? "",
              realEstateKnowledgeScore: previous[row._id]?.realEstateKnowledgeScore ?? row.realEstateKnowledgeScore ?? undefined,
              projectKnowledgeScore: previous[row._id]?.projectKnowledgeScore ?? row.projectKnowledgeScore ?? undefined,
              marketingKnowledgeScore: previous[row._id]?.marketingKnowledgeScore ?? row.marketingKnowledgeScore ?? undefined,
              customerCommunicationScore: previous[row._id]?.customerCommunicationScore ?? row.customerCommunicationScore ?? undefined,
              ethicsComplianceScore: previous[row._id]?.ethicsComplianceScore ?? row.ethicsComplianceScore ?? undefined,
              ...patch,
            }
          }));
          return <Card key={row._id} className="border-white/10 bg-white/[0.035] p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><h3 className="font-semibold">{row.ambassadorName} · Day {row.day}</h3><p className="text-xs text-muted-foreground">{row.ambassadorEmail}</p><Badge className="mt-2" variant={row.quizScore>=80?"success":"warning"}>Written score: {row.quizScore}/100</Badge></div>
              <Badge variant="info">{pretty(row.status)}</Badge>
            </div>
            <div className="mt-3 rounded-lg border border-white/10 bg-black/10 p-3"><p className="text-xs text-muted-foreground">Assignment submission</p><p className="mt-1 whitespace-pre-wrap text-sm">{row.assignmentText || "No assignment text recorded."}</p></div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <label className="text-sm"><span className="mb-1 block text-muted-foreground">Attendance</span><select className="h-10 w-full rounded-lg border border-white/10 bg-slate-950 px-2" value={state.attendanceStatus} onChange={(e)=>setField({attendanceStatus:e.target.value})}>{["NOT_RECORDED","PRESENT","ABSENT","EXCUSED"].map((v)=><option key={v}>{v}</option>)}</select></label>
              <label className="text-sm"><span className="mb-1 block text-muted-foreground">Practical communication</span><select className="h-10 w-full rounded-lg border border-white/10 bg-slate-950 px-2" value={state.practicalStatus} onChange={(e)=>setField({practicalStatus:e.target.value})}>{["PENDING","APPROVED","REJECTED"].map((v)=><option key={v}>{v}</option>)}</select></label>
              <label className="text-sm"><span className="mb-1 block text-muted-foreground">Ethics & conduct</span><select className="h-10 w-full rounded-lg border border-white/10 bg-slate-950 px-2" value={state.ethicsStatus} onChange={(e)=>setField({ethicsStatus:e.target.value})}>{["PENDING","APPROVED","REJECTED"].map((v)=><option key={v}>{v}</option>)}</select></label>
            </div>
            <div className="mt-3 rounded-lg border border-white/10 p-3">
              <h4 className="mb-3 text-sm font-semibold">Five-part assessment rubric (20 marks each)</h4>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                {([
                  ["realEstateKnowledgeScore","Real estate knowledge",state.realEstateKnowledgeScore],
                  ["projectKnowledgeScore","Project knowledge",state.projectKnowledgeScore],
                  ["customerCommunicationScore","Customer communication",state.customerCommunicationScore],
                  ["marketingKnowledgeScore","Marketing knowledge",state.marketingKnowledgeScore],
                  ["ethicsComplianceScore","Ethics & compliance",state.ethicsComplianceScore],
                ] as const).map(([key,label,value]) => <label key={key} className="text-sm"><span className="mb-1 block text-muted-foreground">{label}</span><input type="number" min={0} max={20} className="h-10 w-full rounded-lg border border-white/10 bg-slate-950 px-3" value={value ?? ""} onChange={(e)=>setField({[key]:e.target.value===""?undefined:Number(e.target.value)} as Partial<typeof state)}/></label>)}
              </div>
              {row.day === 7 && <p className="mt-2 text-xs text-muted-foreground">Final certification requires all five scores and a total of at least 80/100, attendance marked Present/Excused, a written pass, and practical and ethics approval.</p>}
            </div>
            <label className="mt-3 block text-sm"><span className="mb-1 block text-muted-foreground">Trainer feedback</span><textarea rows={2} className="w-full rounded-lg border border-white/10 bg-slate-950 p-3" value={state.trainerFeedback} onChange={(e)=>setField({trainerFeedback:e.target.value})}/></label>
            <div className="mt-3"><Button onClick={()=>void reviewTraining(row)}>Save assessment</Button></div>
          </Card>;
        })}
      </div>}

      {tab === "tasks" && <div className="grid gap-5 xl:grid-cols-[380px_1fr]"><Card className="h-fit border-white/10 bg-white/[0.035] p-5"><h2 className="mb-4 flex items-center gap-2 font-semibold"><Plus size={17}/> Assign a task</h2><form className="space-y-3" onSubmit={createTask}><FormField label="Task title" value={taskForm.title} onChange={(v)=>setTaskForm((f)=>({...f,title:v}))} required/><label className="block text-sm"><span className="mb-1 block text-muted-foreground">Category</span><select className="h-10 w-full rounded-lg border border-white/10 bg-slate-950 px-3" value={taskForm.category} onChange={(e)=>setTaskForm((f)=>({...f,category:e.target.value}))}>{["TRAINING","SALES","MARKETING","LEAD_MANAGEMENT","SITE_VISIT","RESEARCH","VERIFICATION"].map((v)=><option key={v}>{v}</option>)}</select></label><label className="block text-sm"><span className="mb-1 block text-muted-foreground">Assign to Ambassador</span><select required className="h-10 w-full rounded-lg border border-white/10 bg-slate-950 px-3" value={taskForm.assignedToId} onChange={(e)=>setTaskForm((f)=>({...f,assignedToId:e.target.value}))}><option value="">Select ambassador</option>{data.profiles.filter(({profile,onboardingVerified})=>profile.termsAccepted&&onboardingVerified&&["ACTIVE","CERTIFIED"].includes(profile.status)).map(({profile,name})=><option key={profile.userId} value={profile.userId}>{name} · {profile.ambassadorId}</option>)}</select></label><label className="block text-sm"><span className="mb-1 block text-muted-foreground">Campaign (optional)</span><select className="h-10 w-full rounded-lg border border-white/10 bg-slate-950 px-3" value={taskForm.campaignId} onChange={(e)=>setTaskForm((f)=>({...f,campaignId:e.target.value}))}><option value="">General task</option>{data.campaigns.map((campaign)=><option key={campaign._id} value={campaign._id}>{campaign.name}</option>)}</select></label><label className="block text-sm"><span className="mb-1 block text-muted-foreground">Instructions</span><textarea required minLength={5} rows={4} className="w-full rounded-lg border border-white/10 bg-slate-950 p-3" value={taskForm.description} onChange={(e)=>setTaskForm((f)=>({...f,description:e.target.value}))}/></label><FormField label="Due date" value={taskForm.dueAt} onChange={(v)=>setTaskForm((f)=>({...f,dueAt:v}))} type="datetime-local"/><Button type="submit" disabled={creatingTask} className="w-full">{creatingTask?"Assigning…":"Assign task"}</Button></form></Card><div className="space-y-3">{data.tasks.length===0?<Empty text="No operating-system tasks created."/>:data.tasks.map((task)=><Card key={task._id} className="border-white/10 bg-white/[0.035] p-4"><div className="flex flex-wrap justify-between gap-2"><div><p className="font-semibold">{task.title}</p><p className="text-xs text-sky-300">{task.ambassadorName} · {pretty(task.category)}{task.campaignId ? ` · ${data.campaigns.find((campaign)=>campaign._id===task.campaignId)?.name ?? "Campaign linked"}` : ""}</p></div><Badge variant={task.status==="APPROVED"?"success":"info"}>{pretty(task.status)}</Badge></div><p className="mt-2 text-sm text-muted-foreground">{task.description}</p>{task.evidenceText&&<div className="mt-3 rounded-lg bg-black/10 p-3"><p className="text-xs text-muted-foreground">Submitted evidence</p><p className="mt-1 whitespace-pre-wrap text-sm">{task.evidenceText}</p>{task.evidenceUrl&&<a className="mt-2 block text-sm text-sky-300 underline" href={task.evidenceUrl} target="_blank" rel="noreferrer">Open evidence link</a>}</div>}{task.status==="SUBMITTED"&&<div className="mt-3 space-y-2"><input placeholder="Required reason if rejecting" className="h-10 w-full rounded-lg border border-white/10 bg-slate-950 px-3 text-sm" value={taskReviews[task._id]?.reviewReason??""} onChange={(e)=>setTaskReviews((p)=>({...p,[task._id]:{reviewReason:e.target.value,paymentReference:p[task._id]?.paymentReference??""}}))}/><div className="flex flex-wrap gap-2"><Button size="sm" onClick={()=>void reviewTask(task,"APPROVED")}>Approve</Button><Button size="sm" variant="outline" onClick={()=>void reviewTask(task,"REJECTED")}>Reject</Button></div></div>}</Card>)}</div></div>}

      {tab === "training-content" && <div className="grid gap-5 xl:grid-cols-[420px_1fr]">
        <Card className="h-fit border-white/10 bg-white/[0.035] p-5">
          <h2 className="mb-1 font-semibold">Learning content publisher</h2>
          <p className="mb-4 text-xs text-muted-foreground">Publish a versioned lesson for any of the seven days. Quiz answer keys stay server-side; a published version becomes the active lesson for new submissions on that day.</p>
          <form className="space-y-3" onSubmit={saveTrainingContent}>
            <label className="block text-sm"><span className="mb-1 block text-muted-foreground">Training day</span><select className="h-10 w-full rounded-lg border border-white/10 bg-slate-950 px-3" value={trainingContentForm.day} onChange={(e)=>setTrainingContentForm((f)=>({...f,day:Number(e.target.value)}))}>{[1,2,3,4,5,6,7].map((d)=><option key={d} value={d}>Day {d}</option>)}</select></label>
            <FormField label="Module title" value={trainingContentForm.title} onChange={(v)=>setTrainingContentForm((f)=>({...f,title:v}))} required/>
            <FormField label="Short summary" value={trainingContentForm.summary} onChange={(v)=>setTrainingContentForm((f)=>({...f,summary:v}))} required/>
            <label className="block text-sm"><span className="mb-1 block text-muted-foreground">Lesson (video or written content)</span><textarea required minLength={20} rows={6} className="w-full rounded-lg border border-white/10 bg-slate-950 p-3" value={trainingContentForm.lesson} onChange={(e)=>setTrainingContentForm((f)=>({...f,lesson:e.target.value}))}/></label>
            <label className="block text-sm"><span className="mb-1 block text-muted-foreground">Key learning points (one per line)</span><textarea required rows={4} className="w-full rounded-lg border border-white/10 bg-slate-950 p-3" value={trainingContentForm.keyPoints} onChange={(e)=>setTrainingContentForm((f)=>({...f,keyPoints:e.target.value}))}/></label>
            <FormField label="Practical assignment" value={trainingContentForm.assignment} onChange={(v)=>setTrainingContentForm((f)=>({...f,assignment:v}))} required/>
            <FormField label="Video URL (optional)" value={trainingContentForm.videoUrl} onChange={(v)=>setTrainingContentForm((f)=>({...f,videoUrl:v}))} placeholder="https://…" />
            <label className="block text-sm"><span className="mb-1 block text-muted-foreground">Five quiz questions as JSON</span><textarea required rows={16} className="w-full rounded-lg border border-white/10 bg-slate-950 p-3 font-mono text-xs" value={trainingContentForm.questionsJson} onChange={(e)=>setTrainingContentForm((f)=>({...f,questionsJson:e.target.value}))}/><p className="mt-1 text-xs text-muted-foreground">Provide exactly five objects with prompt, options (2–5 options) and zero-based answer index. Never put answer keys in student-visible lesson text.</p></label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={trainingContentForm.isPublished} onChange={(e)=>setTrainingContentForm((f)=>({...f,isPublished:e.target.checked}))}/> Publish this version to students now</label>
            <Button type="submit" className="w-full" disabled={savingTrainingContent}>{savingTrainingContent?"Saving…":trainingContentForm.isPublished?"Save and publish version":"Save unpublished draft"}</Button>
          </form>
        </Card>
        <div className="space-y-3">{trainingContent.length===0?<Empty text="No custom lesson versions yet. The built-in seven-day curriculum remains the fallback."/>:trainingContent.map((module)=> <Card key={module._id} className="border-white/10 bg-white/[0.035] p-4">
          <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-semibold">Day {module.day} · {module.title} · v{module.version}</p><p className="text-sm text-muted-foreground">{module.summary}</p></div><Badge variant={module.isPublished?"success":"info"}>{module.isPublished?"Published":"Draft"}</Badge></div>
          {module.videoUrl&&<a href={module.videoUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm text-sky-300 underline">Open lesson video</a>}
          <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-sm text-muted-foreground">{module.lesson}</p>
          <p className="mt-2 text-xs text-muted-foreground">{(module.keyPoints??[]).length} key points · {(module.questions??[]).length} quiz questions · {module.publishedAt?new Date(module.publishedAt).toLocaleString():"Not published"}</p>
          <Button size="sm" variant="outline" className="mt-3" onClick={()=>void loadTrainingModule(module)}>Load into editor</Button>
        </Card>)}</div>
      </div>}

      {tab === "sales" && <div className="space-y-5">
        {loadingSales ? <p className="text-sm text-muted-foreground">Loading campaign and sales data…</p> : !salesPipeline || !salesSummary ? <Empty text="Sales workspace data is not loaded. Switch tabs or refresh to retry."/> : <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[
            ["Target units",salesSummary.totals.targetUnits],["Verified units sold",salesSummary.totals.verifiedUnitsSold],["Units remaining",salesSummary.totals.unitsRemaining],["Total enquiries",salesSummary.totals.totalEnquiries],
            ["Qualified leads",salesSummary.totals.qualifiedLeads],["Visits scheduled",salesSummary.totals.siteVisitsScheduled],["Visits completed",salesSummary.totals.siteVisitsCompleted],["Bookings pending verification",salesSummary.totals.bookingsPendingVerification],
            ["Cancelled bookings",salesSummary.totals.cancelledBookings],["Commission earned",money(salesSummary.totals.commissionEarned)],
          ].map(([label,value])=><Card key={String(label)} className="border-white/10 bg-white/[0.035] p-4"><p className="text-xs text-muted-foreground">{String(label)}</p><p className="mt-2 text-2xl font-semibold">{String(value)}</p></Card>)}</div>
          <div className="grid gap-5 xl:grid-cols-[400px_1fr]">
            <Card className="h-fit border-white/10 bg-white/[0.035] p-5">
              <h2 className="mb-1 font-semibold">Record property booking</h2><p className="mb-4 text-xs text-muted-foreground">This records a separate property booking, not a lead status shortcut. Sale targets only count units marked Sale Verified after registration evidence.</p>
              <form className="space-y-3" onSubmit={createPropertyBooking}>
                <label className="block text-sm"><span className="mb-1 block text-muted-foreground">Eligible lead</span><select required className="h-10 w-full rounded-lg border border-white/10 bg-slate-950 px-3" value={bookingForm.leadId} onChange={(e)=>setBookingForm((f)=>({...f,leadId:e.target.value}))}><option value="">Choose qualified/negotiation lead</option>{salesPipeline.leads.filter((lead)=>["NEGOTIATION","BOOKING","REGISTRATION","COMPLETED"].includes(lead.stage)&&!lead.isDuplicate&&!["OPEN","UNDER_REVIEW"].includes(lead.ownershipReviewStatus)&&(lead.creatorRole==="BUYER"||(lead.contactConsent&&lead.contactConsentAt&&lead.consentTextVersion))).map((lead)=><option key={lead._id} value={lead._id}>{lead.leadReference} · {lead.projectName}{lead.unitNumber?" · Unit "+lead.unitNumber:" · Project enquiry"} · {pretty(lead.stage)}</option>)}</select></label>
                <label className="block text-sm"><span className="mb-1 block text-muted-foreground">Campaign (optional)</span><select className="h-10 w-full rounded-lg border border-white/10 bg-slate-950 px-3" value={bookingForm.campaignId} onChange={(e)=>setBookingForm((f)=>({...f,campaignId:e.target.value}))}><option value="">No campaign attribution</option>{salesPipeline.campaigns.filter((campaign)=>campaign.status==="ACTIVE"&&campaign.officialDataVerified).map((campaign)=><option key={campaign._id} value={campaign._id}>{campaign.name}</option>)}</select></label>
                <FormField label="Verified booking value (₹)" value={bookingForm.bookingValue} onChange={(v)=>setBookingForm((f)=>({...f,bookingValue:v}))} type="number" required/>
                <FormField label="Amount received to date (₹)" value={bookingForm.amountReceived} onChange={(v)=>setBookingForm((f)=>({...f,amountReceived:v}))} type="number" required/>
                <label className="block text-sm"><span className="mb-1 block text-muted-foreground">Current payment milestone</span><select className="h-10 w-full rounded-lg border border-white/10 bg-slate-950 px-3" value={bookingForm.paymentMilestone} onChange={(e)=>setBookingForm((f)=>({...f,paymentMilestone:e.target.value}))}>{[["BOOKING_CONFIRMED","Booking confirmed"],["TOKEN_RECEIVED","Token received"],["AGREEMENT_SIGNED","Agreement signed"],["REGISTRATION_COMPLETED","Registration completed"],["CUSTOM_MILESTONE","Custom milestone"]].map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
                <FormField label="Agreement reference (if available)" value={bookingForm.agreementReference} onChange={(v)=>setBookingForm((f)=>({...f,agreementReference:v}))}/>
                <label className="block text-sm"><span className="mb-1 block text-muted-foreground">Notes</span><textarea rows={2} className="w-full rounded-lg border border-white/10 bg-slate-950 p-3" value={bookingForm.notes} onChange={(e)=>setBookingForm((f)=>({...f,notes:e.target.value}))}/></label>
                <Button type="submit" disabled={savingBooking||!bookingForm.leadId} className="w-full">{savingBooking?"Saving…":"Record booking for review"}</Button>
              </form>
            </Card>
            <Card className="border-white/10 bg-white/[0.035] p-4">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">Real-estate booking ledger</h2><Badge variant="info">{salesPipeline.bookings.length} records</Badge></div>
              {salesPipeline.bookings.length===0?<Empty text="No property bookings yet."/>:<div className="space-y-3">{salesPipeline.bookings.map((booking)=><div key={booking._id} className="rounded-xl border border-white/10 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-semibold">{booking.bookingReference}</p><p className="text-sm text-muted-foreground">{booking.projectName}{booking.unitNumber?" · Unit "+booking.unitNumber:""} · {booking.leadReference}</p><p className="mt-1 text-xs text-muted-foreground">Source: {pretty(booking.sourceChannel??"OTHER")} · Submitted by: {booking.submitterName??"Truvi team"}</p></div><div className="text-right"><p className="text-lg font-semibold">{money(booking.bookingValue)}</p><Badge variant={booking.status==="SALE_VERIFIED"?"success":booking.status==="REJECTED"||booking.status==="CANCELLED"||booking.status==="REFUNDED"?"danger":"info"}>{pretty(booking.status)}</Badge></div></div>
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4"><MiniMetric label="Amount received" value={money(booking.amountReceived)}/><MiniMetric label="Payment milestone" value={pretty(booking.paymentMilestone)}/><MiniMetric label="Refund status" value={pretty(booking.refundStatus??"NOT_REQUIRED")}/><MiniMetric label="Refunded amount" value={money(booking.refundAmount??0)}/></div>
                {booking.status==="REFUND_PENDING"&&<p className="mt-2 text-xs text-amber-200">Refund review: {booking.cancellationReason??"Reason required"}.</p>}
                {!["REJECTED","CANCELLED","REFUNDED"].includes(booking.status)&&<div className="mt-3 space-y-2">
                  <div className="grid gap-2 md:grid-cols-3"><input placeholder="Reviewer/cancellation reason" className="h-9 rounded-lg border border-white/10 bg-slate-950 px-3 text-sm" value={reviewBookingReason[booking._id]??booking.cancellationReason??""} onChange={(e)=>setReviewBookingReason((p)=>({...p,[booking._id]:e.target.value}))}/><input placeholder="Agreement / registration reference" className="h-9 rounded-lg border border-white/10 bg-slate-950 px-3 text-sm" value={refundForm[booking._id]?.agreementReference??booking.agreementReference??""} onChange={(e)=>setRefundForm((p)=>({...p,[booking._id]:{refundAmount:p[booking._id]?.refundAmount??String(booking.amountReceived),refundReference:p[booking._id]?.refundReference??"",reason:p[booking._id]?.reason??"",agreementReference:e.target.value,paymentMilestone:p[booking._id]?.paymentMilestone??booking.paymentMilestone}}))}/><input type="number" min={0} placeholder="Refund amount" className="h-9 rounded-lg border border-white/10 bg-slate-950 px-3 text-sm" value={refundForm[booking._id]?.refundAmount??String(booking.amountReceived)} onChange={(e)=>setRefundForm((p)=>({...p,[booking._id]:{refundAmount:e.target.value,refundReference:p[booking._id]?.refundReference??"",reason:p[booking._id]?.reason??"",agreementReference:p[booking._id]?.agreementReference??booking.agreementReference??"",paymentMilestone:p[booking._id]?.paymentMilestone??booking.paymentMilestone}}))}/><input placeholder="Refund receipt/reference" className="h-9 rounded-lg border border-white/10 bg-slate-950 px-3 text-sm" value={refundForm[booking._id]?.refundReference??""} onChange={(e)=>setRefundForm((p)=>({...p,[booking._id]:{refundAmount:p[booking._id]?.refundAmount??String(booking.amountReceived),refundReference:e.target.value,reason:p[booking._id]?.reason??"",agreementReference:p[booking._id]?.agreementReference??booking.agreementReference??"",paymentMilestone:p[booking._id]?.paymentMilestone??booking.paymentMilestone}}))}/></div>
                  <div className="flex flex-wrap gap-2">{booking.status==="SUBMITTED"&&<><Button size="sm" onClick={()=>void updatePropertyBooking(booking,"UNDER_REVIEW")}>Start review</Button><Button size="sm" variant="outline" onClick={()=>void updatePropertyBooking(booking,"REJECTED")}>Reject</Button></>}{booking.status==="UNDER_REVIEW"&&<><Button size="sm" onClick={()=>void updatePropertyBooking(booking,"VERIFIED")}>Verify booking / reserve unit</Button><Button size="sm" variant="outline" onClick={()=>void updatePropertyBooking(booking,"REJECTED")}>Reject</Button></>}{booking.status==="VERIFIED"&&<Button size="sm" onClick={()=>void updatePropertyBooking(booking,"SALE_VERIFIED")}>Mark sale verified</Button>}{["VERIFIED","SALE_VERIFIED"].includes(booking.status)&&<Button size="sm" variant="outline" onClick={()=>void updatePropertyBooking(booking,"REFUND_PENDING")}>Start cancellation/refund</Button>}{booking.status==="REFUND_PENDING"&&<Button size="sm" onClick={()=>void updatePropertyBooking(booking,"REFUNDED")}>Confirm refund completed</Button>}</div>
                </div>}
              </div>)}</div>}
            </Card>
          </div>
          <div className="grid gap-5 xl:grid-cols-[390px_1fr]">
            <Card className="h-fit border-white/10 bg-white/[0.035] p-5"><h2 className="mb-1 font-semibold">Channel marketing cost</h2><p className="mb-4 text-xs text-muted-foreground">Enter actual campaign/source spend with the invoice or evidence reference. Cost per qualified lead is calculated from these records and live lead stages.</p><form className="space-y-3" onSubmit={saveChannelCost}>
              <label className="block text-sm"><span className="mb-1 block text-muted-foreground">Campaign</span><select required className="h-10 w-full rounded-lg border border-white/10 bg-slate-950 px-3" value={channelCostForm.campaignId} onChange={(e)=>setChannelCostForm((f)=>({...f,campaignId:e.target.value}))}><option value="">Select campaign</option>{salesPipeline.campaigns.map((campaign)=><option key={campaign._id} value={campaign._id}>{campaign.name}</option>)}</select></label>
              <label className="block text-sm"><span className="mb-1 block text-muted-foreground">Acquisition source</span><select className="h-10 w-full rounded-lg border border-white/10 bg-slate-950 px-3" value={channelCostForm.sourceChannel} onChange={(e)=>setChannelCostForm((f)=>({...f,sourceChannel:e.target.value}))}>{[["AMBASSADOR_REFERRAL","Ambassador referral"],["WHATSAPP","WhatsApp"],["INSTAGRAM","Instagram"],["FACEBOOK","Facebook"],["ORGANIC_WEBSITE","Organic website"],["PAID_ADVERTISEMENT","Paid advertisement"],["CUSTOMER_REFERRAL","Existing customer referral"],["TELECALLER","Telecaller"],["CHANNEL_PARTNER","Channel partner"],["DIRECT_ENQUIRY","Direct enquiry"],["OTHER","Other"]].map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
              <FormField label="Cost amount (₹)" value={channelCostForm.amount} onChange={(v)=>setChannelCostForm((f)=>({...f,amount:v}))} type="number" required/><FormField label="Period start" value={channelCostForm.periodStart} onChange={(v)=>setChannelCostForm((f)=>({...f,periodStart:v}))} type="datetime-local" required/><FormField label="Period end" value={channelCostForm.periodEnd} onChange={(v)=>setChannelCostForm((f)=>({...f,periodEnd:v}))} type="datetime-local" required/><FormField label="Invoice / evidence reference" value={channelCostForm.evidenceReference} onChange={(v)=>setChannelCostForm((f)=>({...f,evidenceReference:v}))}/><FormField label="Notes" value={channelCostForm.notes} onChange={(v)=>setChannelCostForm((f)=>({...f,notes:v}))}/>
              <Button type="submit" disabled={savingChannelCost||!channelCostForm.campaignId} className="w-full">{savingChannelCost?"Recording…":"Record campaign spend"}</Button>
            </form></Card>
            <div className="space-y-3">{salesSummary.campaigns.map((summary)=> <Card key={summary.campaignId} className="border-white/10 bg-white/[0.035] p-4">
              <div className="flex flex-wrap justify-between gap-2"><div><h3 className="font-semibold">{summary.campaignName}</h3><p className="text-sm text-muted-foreground">{summary.projectName} · {summary.location}</p></div><Badge variant="info">{summary.campaignDaysRemaining===null?"No duration":summary.campaignDaysRemaining+" days left"}</Badge></div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4"><MiniMetric label="Verified units / target" value={summary.verifiedUnitsSold+" / "+summary.targetUnits}/><MiniMetric label="Units remaining" value={String(summary.unitsRemaining)}/><MiniMetric label="Enquiries / qualified" value={summary.totalEnquiries+" / "+summary.qualifiedLeads}/><MiniMetric label="Visits scheduled / done" value={summary.siteVisitsScheduled+" / "+summary.siteVisitsCompleted}/><MiniMetric label="Bookings pending review" value={String(summary.bookingsPendingVerification)}/><MiniMetric label="Cancelled bookings" value={String(summary.cancelledBookings)}/><MiniMetric label="Commission earned" value={money(summary.commissionEarned)}/><MiniMetric label="Total booking records" value={String(summary.totalBookingRecords)}/></div>
              <h4 className="mt-4 text-sm font-semibold">Conversion funnel</h4><div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">{[["Lead → contacted",summary.conversion.leadToContacted],["Contacted → qualified",summary.conversion.contactedToQualified],["Qualified → visit scheduled",summary.conversion.qualifiedToVisitScheduled],["Scheduled → completed",summary.conversion.scheduledToCompleted],["Completed → booking",summary.conversion.completedToBooking],["Booking → verified sale",summary.conversion.bookingToVerifiedSale]].map(([label,value])=><MiniMetric key={String(label)} label={String(label)} value={value===null?"—":String(value)+"%"}/>)}</div>
              <h4 className="mt-4 text-sm font-semibold">Acquisition channels</h4><div className="mt-2 overflow-x-auto"><table className="w-full min-w-[650px] text-left text-xs"><thead className="text-muted-foreground"><tr><th className="pb-2 pr-3">Source</th><th className="pb-2 pr-3">Cost</th><th className="pb-2 pr-3">Leads</th><th className="pb-2 pr-3">Qualified</th><th className="pb-2 pr-3">Visits</th><th className="pb-2 pr-3">Verified sales</th><th className="pb-2 pr-3">Cost / qualified</th></tr></thead><tbody>{summary.channels.map((channel)=><tr key={channel.sourceChannel} className="border-t border-white/10"><td className="py-2 pr-3">{pretty(channel.sourceChannel)}</td><td className="py-2 pr-3">{money(channel.cost)}</td><td className="py-2 pr-3">{channel.leads}</td><td className="py-2 pr-3">{channel.qualifiedLeads}</td><td className="py-2 pr-3">{channel.siteVisits}</td><td className="py-2 pr-3">{channel.verifiedSales}</td><td className="py-2 pr-3">{channel.costPerQualifiedLead===null?"—":money(channel.costPerQualifiedLead)}</td></tr>)}</tbody></table></div>
            </Card>)}</div>
          </div>
        </>}
      </div>}

      {tab === "followups" && <Card className="border-white/10 bg-white/[0.035] p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">Follow-up reminder queue</h2><Badge variant="info">{followUps.length} scheduled</Badge></div>
        {loadingSales?<p className="text-sm text-muted-foreground">Loading reminders…</p>:followUps.length===0?<Empty text="No Ambassador follow-ups have been scheduled."/>:<div className="space-y-2">{followUps.map((item:any)=><div key={item.followUp._id} className="flex flex-wrap items-center gap-3 rounded-xl border border-white/10 p-3"><div className="min-w-0 flex-1"><p className="font-medium">{item.leadReference} · {item.projectName}</p><p className="text-xs text-muted-foreground">{item.ambassadorName} · {item.followUp.channel} · Due {new Date(item.followUp.dueAt).toLocaleString()}</p><p className="mt-1 text-sm">{item.followUp.note}</p><Badge variant={item.isOverdue?"warning":"info"}>{item.isOverdue?"Overdue":pretty(item.followUp.status)}</Badge></div>{item.followUp.status==="PENDING"&&<div className="flex gap-2"><Button size="sm" onClick={()=>void api.patch("/ambassador-os/follow-ups/"+item.followUp._id+"/status",{status:"DONE",outcome:"Completed by Admin"}).then(()=>loadSalesWorkspace()).catch(()=>toast.error("Could not complete follow-up"))}>Done</Button><Button size="sm" variant="outline" onClick={()=>void api.patch("/ambassador-os/follow-ups/"+item.followUp._id+"/status",{status:"MISSED",outcome:"Missed follow-up"}).then(()=>loadSalesWorkspace()).catch(()=>toast.error("Could not update follow-up"))}>Missed</Button></div>}</div>)}</div>}
      </Card>}

      {tab === "campaigns" && <div className="grid gap-5 xl:grid-cols-[390px_1fr]"><Card className="h-fit border-white/10 bg-white/[0.035] p-5"><h2 className="mb-1 font-semibold">Create campaign</h2><p className="mb-4 text-xs text-muted-foreground">Created in Planned status. It becomes visible only after linking to an approved, Truvi-verified project with a price list and enough available units.</p><form className="space-y-3" onSubmit={createCampaign}><label className="block text-sm"><span className="mb-1 block text-muted-foreground">Link existing Truvi project (required to activate)</span><select className="h-10 w-full rounded-lg border border-white/10 bg-slate-950 px-3" value={campaignForm.projectId} onChange={(e)=>{const chosen=projects.find((p)=>p._id===e.target.value);setCampaignForm((f)=>({...f,projectId:e.target.value,projectName:chosen?.name??f.projectName,location:chosen?[chosen.location,chosen.city].filter(Boolean).join(", "):f.location}));}}><option value="">Not linked yet — keep campaign planned</option>{projects.map((p)=><option key={p._id} value={p._id}>{p.name} · {p.city ?? p.location ?? "No location"}{p.approvalStatus!=="APPROVED"||!p.isVerified||!p.priceListUrl?" (needs verification)":""}</option>)}</select></label><FormField label="Campaign name" value={campaignForm.name} onChange={(v)=>setCampaignForm((f)=>({...f,name:v}))} required/><FormField label="Project name" value={campaignForm.projectName} onChange={(v)=>setCampaignForm((f)=>({...f,projectName:v}))} required/><FormField label="Location" value={campaignForm.location} onChange={(v)=>setCampaignForm((f)=>({...f,location:v}))} required/><div className="grid grid-cols-2 gap-3"><FormField label="Required available units" value={String(campaignForm.targetInventory)} onChange={(v)=>setCampaignForm((f)=>({...f,targetInventory:Number(v)}))} type="number" required/><FormField label="Verified sales target" value={String(campaignForm.salesTarget)} onChange={(v)=>setCampaignForm((f)=>({...f,salesTarget:Number(v)}))} type="number" required/><FormField label="Area/unit (sq ft)" value={String(campaignForm.unitAreaSqFt)} onChange={(v)=>setCampaignForm((f)=>({...f,unitAreaSqFt:Number(v)}))} type="number" required/></div><FormField label="Target days" value={String(campaignForm.targetDays)} onChange={(v)=>setCampaignForm((f)=>({...f,targetDays:Number(v)}))} type="number" required/><FormField label="Start date" value={campaignForm.startsAt} onChange={(v)=>setCampaignForm((f)=>({...f,startsAt:v}))} type="datetime-local"/><Button type="submit" className="w-full" disabled={creatingCampaign}>{creatingCampaign?"Creating…":"Create planned campaign"}</Button></form></Card><div className="space-y-3">{data.campaigns.length===0?<Empty text="No campaign configured yet."/>:data.campaigns.map((c)=><Card key={c._id} className="border-white/10 bg-white/[0.035] p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-semibold">{c.name}</p><p className="text-sm text-muted-foreground">{c.projectName} · {c.location}</p></div><Badge variant={c.status==="ACTIVE"?"success":"info"}>{pretty(c.status)}</Badge></div><div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4"><MiniMetric label="Available-unit check" value={String(c.targetInventory)}/><MiniMetric label="Verified sales / target" value={`${c.verifiedSales ?? 0} / ${c.salesTarget}`}/><MiniMetric label="Area/unit" value={`${c.unitAreaSqFt.toLocaleString("en-IN")} sq ft`}/><MiniMetric label="Duration" value={`${c.targetDays} days`}/></div><p className="mt-3 text-xs text-muted-foreground">Linked project: {projects.find((p)=>p._id===c.projectId)?.name ?? (c.projectId ? c.projectName : "Not linked")} · {c.officialDataVerified?"Official data marked verified":"Not visible to ambassadors until official data is verified."}</p>{c.status!=="ACTIVE"&&<div className="mt-3 space-y-2"><input placeholder="Evidence/source notes for official project, legal, price and inventory checks" className="h-10 w-full rounded-lg border border-white/10 bg-slate-950 px-3 text-sm" value={campaignNotes[c._id]??c.officialDataNotes??""} onChange={(e)=>setCampaignNotes((p)=>({...p,[c._id]:e.target.value}))}/><Button size="sm" onClick={()=>void updateCampaign(c,true)}><CheckCircle2 size={15} className="mr-2"/>Mark verified & activate</Button></div>}{c.status==="ACTIVE"&&<Button size="sm" variant="outline" className="mt-3" onClick={()=>void api.patch(`/ambassador-os/admin/campaigns/${c._id}`,{status:"PAUSED"}).then(load).catch(()=>toast.error("Could not pause campaign"))}>Pause campaign</Button>}</Card>)}</div></div>}

      {tab === "policies" && <div className="grid gap-5 xl:grid-cols-[410px_1fr]">
        <Card className="h-fit border-white/10 bg-white/[0.035] p-5">
          <h2 className="mb-1 font-semibold">Create incentive policy</h2>
          <p className="mb-4 text-xs text-muted-foreground">Every version starts inactive. Choose the real booking milestone and cancellation treatment, then attach the approved agreement/policy reference before activation.</p>
          <form className="space-y-3" onSubmit={createPolicy}>
            <FormField label="Policy name" value={policyForm.name} onChange={(v)=>setPolicyForm((f)=>({...f,name:v}))} required/>
            <label className="block text-sm"><span className="mb-1 block text-muted-foreground">Calculation basis</span><select className="h-10 w-full rounded-lg border border-white/10 bg-slate-950 px-3" value={policyForm.calculationType} onChange={(e)=>setPolicyForm((f)=>({...f,calculationType:e.target.value}))}>{[["PER_SQ_FT_BLOCK","Amount per complete area block"],["FIXED","Fixed amount per verified sale"],["PERCENT_OF_VALUE","Percent of verified booking value"]].map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
            <FormField label={policyForm.calculationType==="PERCENT_OF_VALUE"?"Percentage (%)":"Amount (₹)"} value={String(policyForm.amount)} onChange={(v)=>setPolicyForm((f)=>({...f,amount:Number(v)}))} type="number" required/>
            {policyForm.calculationType==="PER_SQ_FT_BLOCK" && <FormField label="Block size (sq ft)" value={String(policyForm.blockSizeSqFt)} onChange={(v)=>setPolicyForm((f)=>({...f,blockSizeSqFt:Number(v)}))} type="number" required/>}
            <label className="block text-sm"><span className="mb-1 block text-muted-foreground">Campaign (optional)</span><select className="h-10 w-full rounded-lg border border-white/10 bg-slate-950 px-3" value={policyForm.campaignId} onChange={(e)=>setPolicyForm((f)=>({...f,campaignId:e.target.value}))}><option value="">Any eligible campaign</option>{data.campaigns.map((c)=><option key={c._id} value={c._id}>{c.name}</option>)}</select></label>
            <label className="block text-sm"><span className="mb-1 block text-muted-foreground">Required booking status</span><select className="h-10 w-full rounded-lg border border-white/10 bg-slate-950 px-3" value={policyForm.requiredBookingStatus} onChange={(e)=>setPolicyForm((f)=>({...f,requiredBookingStatus:e.target.value}))}><option value="VERIFIED">Booking verified (reserved unit)</option><option value="SALE_VERIFIED">Sale verified (registration complete)</option></select></label>
            <label className="block text-sm"><span className="mb-1 block text-muted-foreground">Minimum payment milestone</span><select className="h-10 w-full rounded-lg border border-white/10 bg-slate-950 px-3" value={policyForm.paymentMilestone} onChange={(e)=>setPolicyForm((f)=>({...f,paymentMilestone:e.target.value}))}>{[["BOOKING_CONFIRMED","Booking confirmed"],["TOKEN_RECEIVED","Token received"],["AGREEMENT_SIGNED","Agreement signed"],["REGISTRATION_COMPLETED","Registration completed"],["CUSTOM_MILESTONE","Custom milestone"]].map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
            <label className="block text-sm"><span className="mb-1 block text-muted-foreground">Cancellation / refund treatment</span><select className="h-10 w-full rounded-lg border border-white/10 bg-slate-950 px-3" value={policyForm.cancellationTreatment} onChange={(e)=>setPolicyForm((f)=>({...f,cancellationTreatment:e.target.value}))}><option value="CANCEL_INCENTIVE">Cancel unpaid incentive</option><option value="RECOVER_PAID">Recover already paid incentive (requires finance review)</option><option value="MANUAL_REVIEW">Manual finance review</option></select></label>
            <FormField label="Expected payout delay (days after verification)" value={String(policyForm.payoutDelayDays)} onChange={(v)=>setPolicyForm((f)=>({...f,payoutDelayDays:Number(v)}))} type="number" required/>
            <label className="block text-sm"><span className="mb-1 block text-muted-foreground">Eligible lead sources (none selected = all sources)</span><div className="mt-2 grid grid-cols-2 gap-2">{[["AMBASSADOR_REFERRAL","Ambassador"],["WHATSAPP","WhatsApp"],["INSTAGRAM","Instagram"],["FACEBOOK","Facebook"],["ORGANIC_WEBSITE","Organic website"],["PAID_ADVERTISEMENT","Paid ads"],["CUSTOMER_REFERRAL","Customer referral"],["TELECALLER","Telecaller"],["CHANNEL_PARTNER","Channel partner"],["DIRECT_ENQUIRY","Direct enquiry"],["OTHER","Other"]].map(([value,label])=><label key={value} className="flex items-center gap-2 text-xs"><input type="checkbox" checked={policyForm.eligibleSources.includes(value)} onChange={(e)=>setPolicyForm((f)=>({...f,eligibleSources:e.target.checked?[...f.eligibleSources,value]:f.eligibleSources.filter((x)=>x!==value)}))}/>{label}</label>)}</div></label>
            <FormField label="Approval authority / department" value={policyForm.approvalAuthority} onChange={(v)=>setPolicyForm((f)=>({...f,approvalAuthority:v}))} placeholder="e.g. Finance Head"/>
            <FormField label="Commission agreement reference" value={policyForm.commissionAgreementReference} onChange={(v)=>setPolicyForm((f)=>({...f,commissionAgreementReference:v}))} placeholder="Agreement or approval document ID"/>
            <FormField label="Effective date" value={policyForm.effectiveFrom} onChange={(v)=>setPolicyForm((f)=>({...f,effectiveFrom:v}))} type="datetime-local"/>
            <Button type="submit" disabled={creatingPolicy} className="w-full">{creatingPolicy?"Creating…":"Create inactive policy version"}</Button>
          </form>
        </Card>
        <div className="space-y-3">{data.policies.length===0?<Empty text="No incentive policies configured."/>:data.policies.map((p)=><Card key={p._id} className="border-white/10 bg-white/[0.035] p-4">
          <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-semibold">{p.name} · v{p.version}</p><p className="text-sm text-muted-foreground">{pretty(p.calculationType)} · {p.calculationType==="PERCENT_OF_VALUE"?p.amount+"%":money(p.amount)}{p.calculationType==="PER_SQ_FT_BLOCK"?" per "+p.blockSizeSqFt+" sq ft block":""}</p></div><Badge variant={p.active?"success":"warning"}>{p.active?"Active":"Inactive"}</Badge></div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2"><MiniMetric label="Required booking" value={pretty(p.requiredBookingStatus??"SALE_VERIFIED")}/><MiniMetric label="Payment milestone" value={pretty(p.paymentMilestone??"BOOKING_CONFIRMED")}/><MiniMetric label="Payout delay" value={String(p.payoutDelayDays??30)+" days"}/><MiniMetric label="Cancellation rule" value={pretty(p.cancellationTreatment??"CANCEL_INCENTIVE")}/></div>
          <p className="mt-2 text-xs text-muted-foreground">Eligible sources: {(p.eligibleSources??[]).length?(p.eligibleSources??[]).map(pretty).join(", "):"All sources"} · Approval authority: {p.approvalAuthority||"Not recorded"} · Agreement: {p.commissionAgreementReference||"Not recorded"}</p>
          {!p.active&&<div className="mt-3 space-y-2"><input placeholder="Written approval / signed policy reference (required)" className="h-10 w-full rounded-lg border border-white/10 bg-slate-950 px-3 text-sm" value={policyApproval[p._id]??p.approvalReference??""} onChange={(e)=>setPolicyApproval((x)=>({...x,[p._id]:e.target.value}))}/><Button size="sm" onClick={()=>void togglePolicy(p,true)}>Activate policy</Button></div>}
          {p.active&&<Button size="sm" variant="outline" className="mt-3" onClick={()=>void togglePolicy(p,false)}>Deactivate policy</Button>}
        </Card>)}</div>
      </div>}

      {tab === "incentives" && <div className="grid gap-5 xl:grid-cols-[410px_1fr]">
        <Card className="h-fit border-white/10 bg-white/[0.035] p-5">
          <h2 className="mb-1 font-semibold">Record verified booking incentive</h2>
          <p className="mb-4 text-xs text-muted-foreground">Incentives are created only from a verified property booking. Select an Ambassador, then one of their consent-safe eligible bookings and an active approved policy.</p>
          <form className="space-y-3" onSubmit={createIncentive}>
            <label className="block text-sm"><span className="mb-1 block text-muted-foreground">Ambassador</span><select required className="h-10 w-full rounded-lg border border-white/10 bg-slate-950 px-3" value={incentiveForm.userId} onChange={(e)=>void loadEligibleBookings(e.target.value)}><option value="">Select Ambassador</option>{data.profiles.filter(({profile,onboardingVerified})=>profile.termsAccepted&&onboardingVerified&&["ACTIVE","CERTIFIED"].includes(profile.status)).map(({profile,name})=><option key={profile.userId} value={profile.userId}>{name} · {profile.ambassadorId}</option>)}</select></label>
            <label className="block text-sm"><span className="mb-1 block text-muted-foreground">Eligible verified booking</span><select required disabled={!incentiveForm.userId||loadingEligibleBookings||eligibleBookings.length===0} className="h-10 w-full rounded-lg border border-white/10 bg-slate-950 px-3" value={incentiveForm.bookingId} onChange={(e)=>{const booking=eligibleBookings.find((item)=>item.bookingId===e.target.value);setIncentiveForm((form)=>({...form,bookingId:e.target.value,verifiedAreaSqFt:booking?.areaSqFt??form.verifiedAreaSqFt}));}}><option value="">{loadingEligibleBookings?"Loading bookings…":eligibleBookings.length?"Select a verified booking":"No eligible verified bookings for this Ambassador"}</option>{eligibleBookings.map((booking)=><option key={booking.bookingId} value={booking.bookingId}>{booking.bookingReference} · {booking.projectName}{booking.unitNumber?" · Unit "+booking.unitNumber:""} · {pretty(booking.bookingStatus)} · {money(booking.bookingValue)}</option>)}</select></label>
            {!eligibleBookings.find((booking)=>booking.bookingId===incentiveForm.bookingId)?.areaSqFt&&<FormField label="Verified area (sq ft; project-only booking)" value={String(incentiveForm.verifiedAreaSqFt)} onChange={(v)=>setIncentiveForm((f)=>({...f,verifiedAreaSqFt:Number(v)}))} type="number" required/>}
            <label className="block text-sm"><span className="mb-1 block text-muted-foreground">Active approved policy</span><select required className="h-10 w-full rounded-lg border border-white/10 bg-slate-950 px-3" value={incentiveForm.policyId} onChange={(e)=>setIncentiveForm((f)=>({...f,policyId:e.target.value}))}><option value="">Select policy</option>{data.policies.filter((p)=>p.active).map((p)=><option key={p._id} value={p._id}>{p.name} · v{p.version} · {pretty(p.requiredBookingStatus??"SALE_VERIFIED")}</option>)}</select></label>
            <Button type="submit" disabled={creatingIncentive||!incentiveForm.bookingId||!incentiveForm.policyId} className="w-full">{creatingIncentive?"Recording…":"Calculate and record as pending"}</Button>
          </form>
        </Card>
        <div className="space-y-3">{data.incentives.length===0?<Empty text="No incentive ledger records yet."/>:data.incentives.map((i)=><Card key={i._id} className="border-white/10 bg-white/[0.035] p-4">
          <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-semibold">{i.ambassadorName}</p><p className="text-xs text-muted-foreground">{i.ambassadorEmail}</p><p className="mt-1 text-xs text-sky-300">{i.bookingReference}</p></div><div className="text-right"><p className="text-xl font-semibold">{money(i.amount)}</p><Badge variant={i.status==="PAID"?"success":"info"}>{pretty(i.status)}</Badge></div></div>
          <p className="mt-2 text-sm text-muted-foreground">{i.policyNameSnapshot} · version {i.policyVersion}</p>
          {i.expectedPayoutAt&&<p className="mt-1 text-xs text-muted-foreground">Expected payout eligibility: {new Date(i.expectedPayoutAt).toLocaleDateString("en-IN")}</p>}
          {i.paymentReference&&<p className="mt-1 text-xs text-muted-foreground">Receipt: {i.paymentReference}</p>}
          <div className="mt-3 flex flex-wrap items-center gap-2">{i.status==="PENDING"&&<Button size="sm" onClick={()=>void updateIncentive(i,"APPROVED")}>Approve</Button>}{i.status==="APPROVED"&&<Button size="sm" onClick={()=>void updateIncentive(i,"PAYABLE")}>Mark payable</Button>}{i.status==="PAYABLE"&&<><input className="h-9 min-w-[210px] rounded-lg border border-white/10 bg-slate-950 px-3 text-sm" placeholder="Payment reference / receipt" value={taskReviews[i._id]?.paymentReference??i.paymentReference??""} onChange={(e)=>setTaskReviews((p)=>({...p,[i._id]:{reviewReason:p[i._id]?.reviewReason??"",paymentReference:e.target.value}}))}/><Button size="sm" onClick={()=>void updateIncentive(i,"PAID")}>Mark paid</Button></>}{["PENDING","APPROVED","PAYABLE"].includes(i.status)&&<Button size="sm" variant="outline" onClick={()=>void updateIncentive(i,"CANCELLED")}>Cancel</Button>}</div>
        </Card>)}</div>
      </div>}

    </main>
  );
}

function FormField({ label, value, onChange, placeholder, type = "text", required = false }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; type?: string; required?: boolean }) {
  return <label className="block text-sm"><span className="mb-1 block text-muted-foreground">{label}</span><input type={type} required={required} placeholder={placeholder} value={value} onChange={(e)=>onChange(e.target.value)} className="h-10 w-full rounded-lg border border-white/10 bg-slate-950 px-3 outline-none focus:border-sky-400/50"/></label>;
}
function MiniMetric({label,value}:{label:string;value:string}){return <div className="rounded-lg border border-white/10 p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 font-semibold">{value}</p></div>}
function Empty({text}:{text:string}){return <p className="rounded-xl border border-dashed border-white/10 p-5 text-sm text-muted-foreground">{text}</p>}

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card, Badge } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Users, GraduationCap, ClipboardList, Building2, Wallet, RefreshCw, BookOpen, Clock, Briefcase,
  CheckCircle2, ShieldCheck, Plus, ArrowRightLeft, ChartNoAxesCombined, TrendingUp,
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
type SalesOwner = { userId: string; name: string; email: string; role: string };
type SalesPipeline = { leads: PipelineLead[]; bookings: BookingRecord[]; campaigns: Campaign[]; channelCosts: Array<{ _id: string; campaignId: string; sourceChannel: string; amount: number; periodStart: string; periodEnd: string; notes?: string | null }> };
type SalesSummary = {
  totals: { campaigns: number; targetUnits: number; verifiedUnitsSold: number; unitsRemaining: number; totalEnquiries: number; qualifiedLeads: number; siteVisitsScheduled: number; siteVisitsCompleted: number; bookingsPendingVerification: number; cancelledBookings: number; commissionEarned: number };
  campaigns: Array<{ campaignId: string; campaignName: string; projectName: string; location: string; status: string; targetUnits: number; verifiedUnitsSold: number; unitsRemaining: number; totalEnquiries: number; qualifiedLeads: number; siteVisitsScheduled: number; siteVisitsCompleted: number; bookingsPendingVerification: number; cancelledBookings: number; campaignDaysRemaining: number | null; commissionEarned: number; commissionPaid?: number; totalBookingRecords: number; newEnquiries?: number; contacted?: number; lostLeads?: number; duplicateLeads?: number; ownershipDisputes?: number; verifiedBookings?: number; cancelledSiteVisits?: number; conversion: { leadToContacted: number | null; contactedToQualified: number | null; qualifiedToVisitScheduled: number | null; scheduledToCompleted: number | null; completedToBooking: number | null; bookingToVerifiedSale: number | null }; channels: Array<{ sourceChannel: string; cost: number; leads: number; qualifiedLeads: number; siteVisits: number; completedSiteVisits?: number; verifiedSales: number; costPerQualifiedLead: number | null }> }>;
};
type ScorecardWeights = {
  genuineLeadQuality: number; customerCommunication: number; siteVisitContribution: number;
  verifiedSalesContribution: number; crmDiscipline: number; trainingSkillDevelopment: number; ethicsCompliance: number;
};
type ScoreInput = {
  genuineLeadQualityScore: string; customerCommunicationScore: string; siteVisitContributionScore: string;
  verifiedSalesContributionScore: string; crmDisciplineScore: string; trainingSkillDevelopmentScore: string;
  ethicsComplianceScore: string; seriousMisconduct: boolean; complianceNotes: string; reviewNotes: string;
};
type PerformanceRow = {
  profile: ProfileRow["profile"]; name: string; email: string; onboardingVerified: boolean;
  latestReview: null | {
    _id: string; periodStart: string; periodEnd: string; weightedScore: number; seriousMisconduct: boolean;
    genuineLeadQualityScore: number; customerCommunicationScore: number; siteVisitContributionScore: number;
    verifiedSalesContributionScore: number; crmDisciplineScore: number; trainingSkillDevelopmentScore: number;
    ethicsComplianceScore: number; scorecardPolicyVersion: number; complianceNotes?: string | null; reviewNotes: string;
  };
  metrics: { totalAttributedLeads: number; genuineLeads: number; qualifiedLeads: number; duplicateLeads: number; completedSiteVisits: number; verifiedSales: number; completedTrainingDays: number; approvedTasks: number; totalTasks: number; followUpsCompleted: number; followUpsDueOrMissed: number; lostLeads: number };
};
type PerformanceResponse = { weights: ScorecardWeights; policy: { version: number; approvalReference?: string | null }; ambassadors: PerformanceRow[] };
type Overview = { profiles: ProfileRow[]; trainingReviews: TrainingReview[]; tasks: Task[]; campaigns: Campaign[]; policies: Policy[]; incentives: Incentive[]; stats: { ambassadors: number; awaitingAssessment: number; assignedTasks: number; submittedTasks: number; activeCampaigns: number; pendingIncentives: number; registeredSales: number } };

type CareerOpportunity = {
  _id: string; title: string; opportunityType: string; description: string; location?: string | null;
  targetLevel: string; requiredSkills: string[]; eligibility: Record<string,unknown>; vacancies: number;
  applicationDeadline?: string | null; status: string; applicationsCount?: number; publishedAt?: string | null;
};
type CareerApplication = {
  _id: string; opportunityId: string; ambassadorId: string; statement: string; evidenceReference?: string | null;
  status: string; reviewNotes?: string | null; opportunityTitle: string; opportunityType: string; targetLevel: string;
  ambassadorName: string; ambassadorEmail: string; currentLevel?: string | null; profileStatus?: string | null;
};
type CareerAssessment = {
  _id: string; targetLevel: string; assessmentType: string; score: number; passed: boolean;
  evidenceReference: string; notes: string; reviewedAt: string;
};
type Tab = "overview" | "ambassadors" | "training" | "training-content" | "tasks" | "sales" | "followups" | "performance" | "career" | "campaigns" | "policies" | "incentives";
const TABS: { id: Tab; label: string; Icon: typeof Users }[] = [
  { id: "overview", label: "Overview", Icon: ChartNoAxesCombined }, { id: "ambassadors", label: "Ambassadors", Icon: Users },
  { id: "training", label: "Training Reviews", Icon: GraduationCap }, { id: "training-content", label: "Learning Content", Icon: BookOpen }, { id: "tasks", label: "Tasks", Icon: ClipboardList },
  { id: "sales", label: "Sales & Bookings", Icon: ChartNoAxesCombined }, { id: "followups", label: "Follow-ups", Icon: Clock },
  { id: "performance", label: "Performance Scorecards", Icon: TrendingUp },
  { id: "career", label: "Career Engine", Icon: Briefcase },
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
  const [salesOwners, setSalesOwners] = useState<SalesOwner[]>([]);
  const [followUps, setFollowUps] = useState<Array<any>>([]);
  const [performanceData, setPerformanceData] = useState<PerformanceResponse | null>(null);
  const [scorecardWeights, setScorecardWeights] = useState<ScorecardWeights>({
    genuineLeadQuality: 25, customerCommunication: 20, siteVisitContribution: 15,
    verifiedSalesContribution: 15, crmDiscipline: 10, trainingSkillDevelopment: 10, ethicsCompliance: 5,
  });
  const [scorecardApprovalReference, setScorecardApprovalReference] = useState("");
  const [performanceInputs, setPerformanceInputs] = useState<Record<string,ScoreInput>>({});
  const [savingPerformance, setSavingPerformance] = useState<string | null>(null);
  const [careerOpportunities, setCareerOpportunities] = useState<CareerOpportunity[]>([]);
  const [careerApplications, setCareerApplications] = useState<CareerApplication[]>([]);
  const [careerAssessments, setCareerAssessments] = useState<CareerAssessment[]>([]);
  const [careerAmbassadorId, setCareerAmbassadorId] = useState("");
  const [savingCareerOpportunity, setSavingCareerOpportunity] = useState(false);
  const [savingCareerAssessment, setSavingCareerAssessment] = useState(false);
  const [careerOpportunityForm, setCareerOpportunityForm] = useState({
    title: "", opportunityType: "INTERNSHIP", description: "", location: "Lucknow",
    targetLevel: "L1", requiredSkills: "", vacancies: 1, applicationDeadline: "", status: "DRAFT",
  });
  const [careerAssessmentForm, setCareerAssessmentForm] = useState({
    targetLevel: "L4", score: 0, evidenceReference: "", notes: "",
  });
  const [savingWeights, setSavingWeights] = useState(false);
  const [loadingPerformance, setLoadingPerformance] = useState(false);
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
      const [pipelineRes, summaryRes, followRes, ownersRes] = await Promise.all([
        api.get("/ambassador-os/admin/sales-pipeline"),
        api.get("/ambassador-os/admin/sales-dashboard"),
        api.get("/ambassador-os/admin/follow-ups"),
        api.get("/ambassador-os/admin/sales-owners"),
      ]);
      setSalesPipeline(pipelineRes.data as SalesPipeline);
      setSalesSummary(summaryRes.data as SalesSummary);
      setFollowUps(followRes.data.followUps ?? []);
      setSalesOwners(ownersRes.data.salesOwners ?? []);
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
  async function loadCareerEngine() {
    try {
      const [opportunitiesRes, applicationsRes] = await Promise.all([
        api.get("/ambassador-os/admin/career/opportunities"),
        api.get("/ambassador-os/admin/career/applications"),
      ]);
      setCareerOpportunities(opportunitiesRes.data.opportunities ?? []);
      setCareerApplications(applicationsRes.data.applications ?? []);
      if (!careerAmbassadorId && data?.profiles[0]) {
        setCareerAmbassadorId(data.profiles[0].profile.userId);
      }
    } catch (error: any) { toast.error(error?.response?.data?.error || "Could not load career opportunities/applications"); }
  }

  async function loadCareerAssessments(userId: string) {
    setCareerAmbassadorId(userId);
    setCareerAssessments([]);
    if (!userId) return;
    try {
      const res = await api.get(`/ambassador-os/admin/career/assessments/${userId}`);
      setCareerAssessments(res.data.assessments ?? []);
    } catch (error: any) { toast.error(error?.response?.data?.error || "Could not load career assessment history"); }
  }

  async function createCareerOpportunity(e: React.FormEvent) {
    e.preventDefault(); setSavingCareerOpportunity(true);
    try {
      await api.post("/ambassador-os/admin/career/opportunities", {
        ...careerOpportunityForm,
        vacancies: Number(careerOpportunityForm.vacancies),
        requiredSkills: careerOpportunityForm.requiredSkills.split("\n").map((v)=>v.trim()).filter(Boolean),
        applicationDeadline: careerOpportunityForm.applicationDeadline ? new Date(careerOpportunityForm.applicationDeadline).toISOString() : undefined,
      });
      toast.success(careerOpportunityForm.status==="PUBLISHED"?"Opportunity published":"Opportunity saved as draft");
      setCareerOpportunityForm({title:"",opportunityType:"INTERNSHIP",description:"",location:"Lucknow",targetLevel:"L1",requiredSkills:"",vacancies:1,applicationDeadline:"",status:"DRAFT"});
      await loadCareerEngine();
    } catch (error:any) { toast.error(error?.response?.data?.error || "Could not create career opportunity"); }
    finally { setSavingCareerOpportunity(false); }
  }

  async function updateCareerOpportunity(opportunity: CareerOpportunity, status: "DRAFT"|"PUBLISHED"|"CLOSED") {
    try {
      await api.patch(`/ambassador-os/admin/career/opportunities/${opportunity._id}`, { status });
      toast.success(`Opportunity ${status.toLowerCase()}`);
      await loadCareerEngine();
    } catch (error:any) { toast.error(error?.response?.data?.error || "Could not update opportunity"); }
  }

  async function submitCareerAssessment(e: React.FormEvent) {
    e.preventDefault();
    if (!careerAmbassadorId) { toast.error("Select an Ambassador first"); return; }
    setSavingCareerAssessment(true);
    try {
      const assessmentType = careerAssessmentForm.targetLevel === "L4" ? "MENTORING" : careerAssessmentForm.targetLevel === "L5" ? "TEAM_MANAGEMENT" : "ADVANCED";
      await api.post("/ambassador-os/admin/career/assessments", {
        ambassadorId: careerAmbassadorId, targetLevel: careerAssessmentForm.targetLevel, assessmentType,
        score: Number(careerAssessmentForm.score), evidenceReference: careerAssessmentForm.evidenceReference,
        notes: careerAssessmentForm.notes,
      });
      toast.success(Number(careerAssessmentForm.score)>=80?"Career assessment passed and recorded":"Assessment recorded; score is below the 80/100 passing threshold");
      setCareerAssessmentForm((v)=>({...v,score:0,evidenceReference:"",notes:""}));
      await loadCareerAssessments(careerAmbassadorId);
    } catch (error:any) { toast.error(error?.response?.data?.error || "Could not record career assessment"); }
    finally { setSavingCareerAssessment(false); }
  }

  async function reviewCareerApplication(app: CareerApplication, status: "UNDER_REVIEW"|"SHORTLISTED"|"REJECTED"|"SELECTED") {
    const reviewNotes=window.prompt("Enter evidence-based review notes (minimum 5 characters):");
    if (!reviewNotes?.trim() || reviewNotes.trim().length<5) { toast.info("No review saved; reviewer notes are required."); return; }
    try {
      await api.patch(`/ambassador-os/admin/career/applications/${app._id}/review`,{status,reviewNotes:reviewNotes.trim()});
      toast.success(`Application marked ${status.toLowerCase().replace(/_/g," ")}`);
      await loadCareerEngine();
    } catch(error:any){toast.error(error?.response?.data?.error || "Could not review application");}
  }

  async function loadPerformance() {
    setLoadingPerformance(true);
    try {
      const res = await api.get("/ambassador-os/admin/performance-reviews");
      const data = res.data as PerformanceResponse;
      setPerformanceData(data);
      setScorecardWeights(data.weights);
      setPerformanceInputs((previous) => {
        const next = { ...previous };
        for (const row of data.ambassadors) {
          if (!next[row.profile.userId]) {
            const review = row.latestReview;
            next[row.profile.userId] = {
              genuineLeadQualityScore: review ? String(review.genuineLeadQualityScore) : "",
              customerCommunicationScore: review ? String(review.customerCommunicationScore) : "",
              siteVisitContributionScore: review ? String(review.siteVisitContributionScore) : "",
              verifiedSalesContributionScore: review ? String(review.verifiedSalesContributionScore) : "",
              crmDisciplineScore: review ? String(review.crmDisciplineScore) : "",
              trainingSkillDevelopmentScore: review ? String(review.trainingSkillDevelopmentScore) : "",
              ethicsComplianceScore: review ? String(review.ethicsComplianceScore) : "",
              seriousMisconduct: review?.seriousMisconduct ?? false,
              complianceNotes: review?.complianceNotes ?? "",
              reviewNotes: "",
            };
          }
        }
        return next;
      });
    } catch (error: any) {
      toast.error(error?.response?.data?.error || "Could not load performance scorecards");
    } finally { setLoadingPerformance(false); }
  }

  async function saveScorecardWeights(e: React.FormEvent) {
    e.preventDefault();
    setSavingWeights(true);
    try {
      const response = await api.put("/ambassador-os/admin/scorecard/weights", {
        ...scorecardWeights, approvalReference: scorecardApprovalReference,
      });
      setScorecardWeights(response.data.weights);
      setScorecardApprovalReference("");
      toast.success("Scorecard weight version saved and audited");
      await loadPerformance();
    } catch (error: any) { toast.error(error?.response?.data?.error || "Could not save weights; all seven must total 100%"); }
    finally { setSavingWeights(false); }
  }

  async function savePerformanceReview(row: PerformanceRow) {
    const input = performanceInputs[row.profile.userId];
    if (!input) return;
    const scoreKeys = [
      "genuineLeadQualityScore","customerCommunicationScore","siteVisitContributionScore",
      "verifiedSalesContributionScore","crmDisciplineScore","trainingSkillDevelopmentScore","ethicsComplianceScore",
    ] as const;
    if (scoreKeys.some((key) => input[key] === "" || Number(input[key]) < 0 || Number(input[key]) > 100)) {
      toast.error("Enter all seven metric scores between 0 and 100");
      return;
    }
    if (input.reviewNotes.trim().length < 5) {
      toast.error("Record review evidence/notes before saving the scorecard");
      return;
    }
    if (input.seriousMisconduct && input.complianceNotes.trim().length < 5) {
      toast.error("A serious misconduct finding needs a specific compliance note");
      return;
    }
    setSavingPerformance(row.profile.userId);
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    try {
      await api.post("/ambassador-os/admin/performance-reviews", {
        ambassadorId: row.profile.userId,
        periodStart: monthStart.toISOString(),
        periodEnd: now.toISOString(),
        genuineLeadQualityScore: Number(input.genuineLeadQualityScore),
        customerCommunicationScore: Number(input.customerCommunicationScore),
        siteVisitContributionScore: Number(input.siteVisitContributionScore),
        verifiedSalesContributionScore: Number(input.verifiedSalesContributionScore),
        crmDisciplineScore: Number(input.crmDisciplineScore),
        trainingSkillDevelopmentScore: Number(input.trainingSkillDevelopmentScore),
        ethicsComplianceScore: Number(input.ethicsComplianceScore),
        seriousMisconduct: input.seriousMisconduct,
        complianceNotes: input.complianceNotes || undefined,
        reviewNotes: input.reviewNotes.trim(),
      });
      toast.success(input.seriousMisconduct ? "Misconduct finding recorded; account suspended and leaderboard exclusion applied" : "Weighted performance review saved");
      await loadPerformance();
      await load();
    } catch (error: any) { toast.error(error?.response?.data?.error || "Could not save performance review"); }
    finally { setSavingPerformance(null); }
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
      <nav className="flex gap-2 overflow-x-auto pb-1">{TABS.map(({ id, label, Icon }) => <button key={id} onClick={() => { setTab(id); if (id === "sales" || id === "followups") void loadSalesWorkspace(); if (id === "training-content") void loadTrainingContent(); if (id === "performance") void loadPerformance(); if (id === "career") void loadCareerEngine(); }} className={`flex shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-sm ${tab === id ? "border-sky-400/40 bg-sky-400/10 text-sky-200" : "border-white/10 bg-white/[0.025] text-muted-foreground hover:text-white"}`}><Icon size={15} />{label}</button>)}</nav>

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
                ] as const).map(([key,label,value]) => <label key={key} className="text-sm"><span className="mb-1 block text-muted-foreground">{label}</span><input type="number" min={0} max={20} className="h-10 w-full rounded-lg border border-white/10 bg-slate-950 px-3" value={value ?? ""} onChange={(e)=>setField({[key]:e.target.value===""?undefined:Number(e.target.value)} as Partial<typeof state>)}/></label>)}
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
          <Card className="border-white/10 bg-white/[0.035] p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">Lead qualification & ownership review</h2><Badge variant="info">{salesPipeline.leads.length} leads</Badge></div>
            {salesPipeline.leads.length===0?<Empty text="No leads recorded for the campaign portfolio."/>:<div className="overflow-x-auto"><table className="w-full min-w-[1180px] text-left text-xs"><thead className="text-muted-foreground"><tr><th className="pb-2 pr-3">Lead / project</th><th className="pb-2 pr-3">Qualification</th><th className="pb-2 pr-3">Stage</th><th className="pb-2 pr-3">Sales owner</th><th className="pb-2 pr-3">Ownership review</th><th className="pb-2 pr-3">Action</th></tr></thead><tbody>{salesPipeline.leads.map((lead)=><tr key={lead._id} className="border-t border-white/10 align-top"><td className="py-3 pr-3"><p className="font-medium">{lead.leadReference} · {lead.projectName}</p><p className="mt-1 text-muted-foreground">{lead.clientName} · {lead.clientPhone}</p><p className="mt-1 text-muted-foreground">{lead.unitNumber?"Unit "+lead.unitNumber:"Project enquiry"}{lead.isDuplicate?" · DUPLICATE FLAG":""}</p><p className="mt-1 text-muted-foreground">Consent: {lead.creatorRole==="BUYER"?"Buyer account":lead.contactConsent&&lead.contactConsentAt&&lead.consentTextVersion?"Recorded":"Missing"}</p></td><td className="py-3 pr-3"><p>{pretty(lead.purchasePurpose??"UNDECIDED")} · {lead.budgetRange??"Budget not set"}</p><p className="mt-1 text-muted-foreground">{lead.preferredPlotSize??lead.requirement??"Size not set"}</p><p className="mt-1 text-muted-foreground">Timeline: {pretty(lead.purchaseTimeline??"NOT_DECIDED")} · Source: {pretty(lead.sourceChannel??"OTHER")}</p></td><td className="py-3 pr-3"><select className="rounded-lg border border-white/10 bg-slate-950 p-2" value={lead.stage} onChange={(e)=>void reviewLead(lead,{stage:e.target.value})}>{["GENERATED","ASSIGNED","CONTACTED","INTERESTED","SITE_VISIT","NEGOTIATION","BOOKING","REGISTRATION","COMPLETED","LOST"].map((v)=><option key={v}>{v}</option>)}</select><p className="mt-1 text-muted-foreground">Created {new Date(lead.createdAt).toLocaleDateString()}</p></td><td className="py-3 pr-3"><select className="max-w-[220px] rounded-lg border border-white/10 bg-slate-950 p-2" value={lead.assignedToId??""} onChange={(e)=>void reviewLead(lead,{assignedToId:e.target.value||null})}><option value="">Unassigned</option>{salesOwners.map((owner)=><option key={owner.userId} value={owner.userId}>{owner.name} · {owner.role}</option>)}</select></td><td className="py-3 pr-3"><Badge variant={lead.ownershipReviewStatus==="RESOLVED"||lead.ownershipReviewStatus==="NOT_REQUIRED"?"info":"warning"}>{pretty(lead.ownershipReviewStatus)}</Badge><input className="mt-2 h-9 w-full min-w-[190px] rounded-lg border border-white/10 bg-slate-950 px-2" placeholder="Ownership review note" value={reviewBookingReason["lead:"+lead._id]??lead.ownershipReviewNotes??""} onChange={(e)=>setReviewBookingReason((p)=>({...p,["lead:"+lead._id]:e.target.value}))}/></td><td className="py-3 pr-3"><div className="flex flex-wrap gap-1"><Button size="sm" variant="outline" onClick={()=>void reviewLead(lead,{ownershipReviewStatus:"OPEN",ownershipReviewNotes:reviewBookingReason["lead:"+lead._id]??lead.ownershipReviewNotes??"Admin review requested"})}>Flag dispute</Button>{["OPEN","UNDER_REVIEW"].includes(lead.ownershipReviewStatus)&&<><Button size="sm" variant="outline" onClick={()=>void reviewLead(lead,{ownershipReviewStatus:"UNDER_REVIEW",ownershipReviewNotes:reviewBookingReason["lead:"+lead._id]??lead.ownershipReviewNotes??""})}>Investigate</Button><Button size="sm" onClick={()=>void reviewLead(lead,{ownershipReviewStatus:"RESOLVED",ownershipReviewNotes:reviewBookingReason["lead:"+lead._id]??lead.ownershipReviewNotes??"Resolved by Admin"})}>Resolve</Button></>}</div><p className="mt-1 text-muted-foreground">Lead ownership is preserved in the referral audit chain.</p></td></tr>)}</tbody></table></div>}
          </Card>

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

      {tab === "performance" && <div className="space-y-5">
        <div><h2 className="text-xl font-semibold">PDF-aligned Ambassador performance scorecard</h2><p className="mt-1 text-sm text-muted-foreground">The PDF weight distribution is used below: lead quality 25%, communication 20%, site visits 15%, verified sales 15%, CRM discipline 10%, training/skills 10%, ethics/compliance 5%. The reviewer scores each dimension from 0–100 using the shown actual metrics and written evidence.</p></div>
        {loadingPerformance ? <p className="text-sm text-muted-foreground">Loading performance reviews…</p> : <>
          <Card className="border-white/10 bg-white/[0.035] p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">Active scorecard weight policy</h3><Badge variant="info">Version {performanceData?.policy.version ?? 1} · {Object.values(scorecardWeights).reduce((sum,value)=>sum+value,0)}%</Badge></div>
            <form className="space-y-3" onSubmit={saveScorecardWeights}>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{([
                ["genuineLeadQuality","Genuine lead quality"],
                ["customerCommunication","Customer communication"],
                ["siteVisitContribution","Site visit contribution"],
                ["verifiedSalesContribution","Verified sales contribution"],
                ["crmDiscipline","CRM discipline"],
                ["trainingSkillDevelopment","Training & skill development"],
                ["ethicsCompliance","Ethics & compliance"],
              ] as const).map(([key,label])=><label key={key} className="block text-sm"><span className="mb-1 block text-muted-foreground">{label} weight (%)</span><input type="number" min={0} max={100} className="h-10 w-full rounded-lg border border-white/10 bg-slate-950 px-3" value={scorecardWeights[key]} onChange={(e)=>setScorecardWeights((w)=>({...w,[key]:Number(e.target.value)}))}/></label>)}</div>
              <div className="flex flex-wrap items-center gap-3"><div className="min-w-[280px] flex-1"><label className="block text-sm"><span className="mb-1 block text-muted-foreground">Approval / change reference</span><input required minLength={5} className="h-10 w-full rounded-lg border border-white/10 bg-slate-950 px-3" value={scorecardApprovalReference} onChange={(e)=>setScorecardApprovalReference(e.target.value)} placeholder="Reason or internal approval record"/></label></div><Button type="submit" disabled={savingWeights||Object.values(scorecardWeights).reduce((sum,value)=>sum+value,0)!==100}>{savingWeights?"Saving…":"Save new weight-policy version"}</Button></div>
              {Object.values(scorecardWeights).reduce((sum,value)=>sum+value,0)!==100&&<p className="text-xs text-amber-200">All seven weights must total exactly 100% before this version can be saved.</p>}
            </form>
          </Card>
          {(!performanceData || performanceData.ambassadors.length===0) ? <Empty text="No Ambassador profiles found to review."/> : <div className="space-y-3">{performanceData.ambassadors.map((row)=>{
            const input = performanceInputs[row.profile.userId] ?? {
              genuineLeadQualityScore:"", customerCommunicationScore:"", siteVisitContributionScore:"",
              verifiedSalesContributionScore:"", crmDisciplineScore:"", trainingSkillDevelopmentScore:"",
              ethicsComplianceScore:"", seriousMisconduct:false, complianceNotes:"", reviewNotes:"",
            };
            const dimensions = [
              ["genuineLeadQualityScore","Genuine lead quality",scorecardWeights.genuineLeadQuality],
              ["customerCommunicationScore","Customer communication",scorecardWeights.customerCommunication],
              ["siteVisitContributionScore","Site visit contribution",scorecardWeights.siteVisitContribution],
              ["verifiedSalesContributionScore","Verified sales contribution",scorecardWeights.verifiedSalesContribution],
              ["crmDisciplineScore","CRM discipline",scorecardWeights.crmDiscipline],
              ["trainingSkillDevelopmentScore","Training & skill development",scorecardWeights.trainingSkillDevelopment],
              ["ethicsComplianceScore","Ethics & compliance",scorecardWeights.ethicsCompliance],
            ] as const;
            const entered = dimensions.every(([key])=>input[key] !== "");
            const preview = entered ? Math.round(dimensions.reduce((sum,[key,,weight])=>sum+Number(input[key])*weight,0)/100*100)/100 : null;
            return <Card key={row.profile.userId} className="border-white/10 bg-white/[0.035] p-4">
              <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold">{row.name} · {row.profile.ambassadorId}</h3><p className="text-xs text-muted-foreground">{row.email} · {row.profile.city} · {row.profile.currentLevel}</p></div><div className="text-right"><Badge variant={row.profile.status==="ACTIVE"?"success":row.profile.status==="SUSPENDED"?"danger":"info"}>{pretty(row.profile.status)}</Badge>{row.latestReview&&<p className="mt-1 text-xs text-muted-foreground">Latest: {row.latestReview.weightedScore}/100 · v{row.latestReview.scorecardPolicyVersion}</p>}</div></div>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8"><MiniMetric label="Attributed leads" value={String(row.metrics.totalAttributedLeads)}/><MiniMetric label="Genuine leads" value={String(row.metrics.genuineLeads)}/><MiniMetric label="Qualified" value={String(row.metrics.qualifiedLeads)}/><MiniMetric label="Duplicates" value={String(row.metrics.duplicateLeads)}/><MiniMetric label="Site visits" value={String(row.metrics.completedSiteVisits)}/><MiniMetric label="Verified sales" value={String(row.metrics.verifiedSales)}/><MiniMetric label="Training days" value={row.metrics.completedTrainingDays+"/7"}/><MiniMetric label="CRM tasks approved" value={row.metrics.approvedTasks+"/"+row.metrics.totalTasks}/></div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{dimensions.map(([key,label,weight])=><label key={key} className="block text-sm"><span className="mb-1 block text-muted-foreground">{label} · weight {weight}%</span><input type="number" min={0} max={100} className="h-10 w-full rounded-lg border border-white/10 bg-slate-950 px-3" value={input[key]} onChange={(e)=>setPerformanceInputs((prev)=>({...prev,[row.profile.userId]:{...input,[key]:e.target.value} as ScoreInput}))}/></label>)}</div>
              <div className="mt-3 grid gap-3 md:grid-cols-2"><label className="block text-sm"><span className="mb-1 block text-muted-foreground">Compliance finding / evidence</span><textarea rows={2} className="w-full rounded-lg border border-white/10 bg-slate-950 p-3" value={input.complianceNotes} onChange={(e)=>setPerformanceInputs((prev)=>({...prev,[row.profile.userId]:{...input,complianceNotes:e.target.value}}))}/></label><label className="block text-sm"><span className="mb-1 block text-muted-foreground">Review evidence and action notes</span><textarea rows={2} className="w-full rounded-lg border border-white/10 bg-slate-950 p-3" value={input.reviewNotes} onChange={(e)=>setPerformanceInputs((prev)=>({...prev,[row.profile.userId]:{...input,reviewNotes:e.target.value}}))}/></label></div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3"><label className="flex items-start gap-2 text-sm text-amber-100"><input type="checkbox" className="mt-1" checked={input.seriousMisconduct} onChange={(e)=>setPerformanceInputs((prev)=>({...prev,[row.profile.userId]:{...input,seriousMisconduct:e.target.checked}}))}/><span><strong>Serious misconduct finding</strong><span className="block text-xs text-muted-foreground">This excludes the Ambassador from the leaderboard and suspends the account for Admin review, regardless of sales score.</span></span></label><div className="flex items-center gap-3"><p className="text-sm text-muted-foreground">Weighted preview: <strong className="text-white">{preview===null?"Complete all seven scores":preview+"/100"}</strong></p><Button onClick={()=>void savePerformanceReview(row)} disabled={savingPerformance===row.profile.userId||!entered}>{savingPerformance===row.profile.userId?"Saving…":"Save review"}</Button></div></div>
            </Card>;
          })}</div>}
        </>}
      </div>}

      {tab === "career" && <div className="space-y-5">
        <div><h2 className="text-xl font-semibold">Career Progression Engine</h2><p className="mt-1 text-sm text-muted-foreground">Create real, reviewable internship/job/leadership opportunities, assess L4–L6 evidence, and review applications. Selection is never an automatic reward.</p></div>
        <div className="grid gap-5 xl:grid-cols-[410px_1fr]">
          <Card className="h-fit border-white/10 bg-white/[0.035] p-5">
            <h3 className="mb-1 font-semibold">Create opportunity</h3><p className="mb-4 text-xs text-muted-foreground">Save as draft before publishing. State qualifications, actual vacancies and a clear application deadline.</p>
            <form className="space-y-3" onSubmit={createCareerOpportunity}>
              <FormField label="Opportunity title" value={careerOpportunityForm.title} onChange={(v)=>setCareerOpportunityForm((f)=>({...f,title:v}))} required/>
              <label className="block text-sm"><span className="mb-1 block text-muted-foreground">Opportunity type</span><select className="h-10 w-full rounded-lg border border-white/10 bg-slate-950 px-3" value={careerOpportunityForm.opportunityType} onChange={(e)=>setCareerOpportunityForm((f)=>({...f,opportunityType:e.target.value}))}>{[["INTERNSHIP","Internship"],["JOB","Job"],["CAMPUS_LEADERSHIP","Campus leadership"],["MENTORING","Mentoring opportunity"]].map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
              <label className="block text-sm"><span className="mb-1 block text-muted-foreground">Minimum level</span><select className="h-10 w-full rounded-lg border border-white/10 bg-slate-950 px-3" value={careerOpportunityForm.targetLevel} onChange={(e)=>setCareerOpportunityForm((f)=>({...f,targetLevel:e.target.value}))}>{["L1","L2","L3","L4","L5","L6"].map((v)=><option key={v}>{v}</option>)}</select></label>
              <FormField label="Location / format" value={careerOpportunityForm.location} onChange={(v)=>setCareerOpportunityForm((f)=>({...f,location:v}))} placeholder="Lucknow / Hybrid / Remote"/>
              <label className="block text-sm"><span className="mb-1 block text-muted-foreground">Role details and selection process</span><textarea required minLength={20} rows={5} className="w-full rounded-lg border border-white/10 bg-slate-950 p-3" value={careerOpportunityForm.description} onChange={(e)=>setCareerOpportunityForm((f)=>({...f,description:e.target.value}))}/></label>
              <label className="block text-sm"><span className="mb-1 block text-muted-foreground">Required skills (one per line)</span><textarea rows={3} className="w-full rounded-lg border border-white/10 bg-slate-950 p-3" value={careerOpportunityForm.requiredSkills} onChange={(e)=>setCareerOpportunityForm((f)=>({...f,requiredSkills:e.target.value}))} placeholder="Customer communication&#10;CRM discipline"/></label>
              <div className="grid grid-cols-2 gap-3"><FormField label="Vacancies" value={String(careerOpportunityForm.vacancies)} onChange={(v)=>setCareerOpportunityForm((f)=>({...f,vacancies:Number(v)}))} type="number" required/><FormField label="Application deadline" value={careerOpportunityForm.applicationDeadline} onChange={(v)=>setCareerOpportunityForm((f)=>({...f,applicationDeadline:v}))} type="datetime-local"/></div>
              <label className="block text-sm"><span className="mb-1 block text-muted-foreground">Publish state</span><select className="h-10 w-full rounded-lg border border-white/10 bg-slate-950 px-3" value={careerOpportunityForm.status} onChange={(e)=>setCareerOpportunityForm((f)=>({...f,status:e.target.value}))}><option value="DRAFT">Draft (not visible)</option><option value="PUBLISHED">Published / open for applications</option></select></label>
              <Button type="submit" disabled={savingCareerOpportunity} className="w-full">{savingCareerOpportunity?"Saving…":"Save opportunity"}</Button>
            </form>
          </Card>
          <div className="space-y-3">{careerOpportunities.length===0?<Empty text="No internship, job or leadership opportunities have been configured."/>:careerOpportunities.map((opportunity)=><Card key={opportunity._id} className="border-white/10 bg-white/[0.035] p-4">
            <div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="font-semibold">{opportunity.title}</h3><p className="text-sm text-muted-foreground">{pretty(opportunity.opportunityType)} · Minimum {opportunity.targetLevel} · {opportunity.location??"Location to be confirmed"}</p></div><Badge variant={opportunity.status==="PUBLISHED"?"success":opportunity.status==="CLOSED"?"danger":"info"}>{pretty(opportunity.status)}</Badge></div>
            <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">{opportunity.description}</p>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3"><MiniMetric label="Vacancies" value={String(opportunity.vacancies)}/><MiniMetric label="Applications" value={String(opportunity.applicationsCount??0)}/><MiniMetric label="Deadline" value={opportunity.applicationDeadline?new Date(opportunity.applicationDeadline).toLocaleDateString("en-IN"):"Not set"}/></div>
            {(opportunity.requiredSkills??[]).length>0&&<p className="mt-2 text-xs text-muted-foreground">Skills: {opportunity.requiredSkills.join(" · ")}</p>}
            <div className="mt-3 flex flex-wrap gap-2">{opportunity.status!=="PUBLISHED"&&<Button size="sm" onClick={()=>void updateCareerOpportunity(opportunity,"PUBLISHED")}>Publish</Button>}{opportunity.status==="PUBLISHED"&&<Button size="sm" variant="outline" onClick={()=>void updateCareerOpportunity(opportunity,"DRAFT")}>Unpublish</Button>}{opportunity.status!=="CLOSED"&&<Button size="sm" variant="outline" onClick={()=>void updateCareerOpportunity(opportunity,"CLOSED")}>Close applications</Button>}</div>
          </Card>)}</div>
        </div>
        <Card className="border-white/10 bg-white/[0.035] p-5">
          <h3 className="mb-3 font-semibold">L4–L6 career assessments</h3>
          <p className="mb-4 text-sm text-muted-foreground">Admin must record the assessment evidence and score. 80/100 passes. L4 is mentoring, L5 is team management, and L6 is advanced role eligibility. Promotion is still separately gated by the career level rules.</p>
          <form className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6" onSubmit={submitCareerAssessment}>
            <label className="block text-sm xl:col-span-2"><span className="mb-1 block text-muted-foreground">Ambassador</span><select required className="h-10 w-full rounded-lg border border-white/10 bg-slate-950 px-3" value={careerAmbassadorId} onChange={(e)=>void loadCareerAssessments(e.target.value)}><option value="">Select Ambassador</option>{data.profiles.map(({profile,name})=><option key={profile.userId} value={profile.userId}>{name} · {profile.ambassadorId}</option>)}</select></label>
            <label className="block text-sm"><span className="mb-1 block text-muted-foreground">Target level</span><select className="h-10 w-full rounded-lg border border-white/10 bg-slate-950 px-3" value={careerAssessmentForm.targetLevel} onChange={(e)=>setCareerAssessmentForm((f)=>({...f,targetLevel:e.target.value}))}>{["L4","L5","L6"].map((v)=><option key={v}>{v}</option>)}</select></label>
            <label className="block text-sm"><span className="mb-1 block text-muted-foreground">Score / 100</span><input type="number" min={0} max={100} className="h-10 w-full rounded-lg border border-white/10 bg-slate-950 px-3" value={careerAssessmentForm.score} onChange={(e)=>setCareerAssessmentForm((f)=>({...f,score:Number(e.target.value)}))}/></label>
            <div className="flex items-end"><Button type="submit" disabled={savingCareerAssessment||!careerAmbassadorId} className="w-full">{savingCareerAssessment?"Saving…":"Record assessment"}</Button></div>
            <div className="sm:col-span-2 xl:col-span-3"><FormField label="Evidence reference" value={careerAssessmentForm.evidenceReference} onChange={(v)=>setCareerAssessmentForm((f)=>({...f,evidenceReference:v}))} required placeholder="Review link, assessment ID or document ref"/></div>
            <label className="block text-sm sm:col-span-2 xl:col-span-3"><span className="mb-1 block text-muted-foreground">Assessment notes / findings</span><textarea required minLength={10} rows={2} className="w-full rounded-lg border border-white/10 bg-slate-950 p-3" value={careerAssessmentForm.notes} onChange={(e)=>setCareerAssessmentForm((f)=>({...f,notes:e.target.value}))}/></label>
          </form>
          {careerAssessments.length>0&&<div className="mt-4 space-y-2"><h4 className="text-sm font-semibold">Selected Ambassador assessment history</h4>{careerAssessments.map((a)=><div key={a._id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 p-3"><div><p className="font-medium">{a.targetLevel} · {pretty(a.assessmentType)} · {a.score}/100</p><p className="text-xs text-muted-foreground">{a.evidenceReference} · {new Date(a.reviewedAt).toLocaleDateString()}</p><p className="mt-1 text-xs text-muted-foreground">{a.notes}</p></div><Badge variant={a.passed?"success":"warning"}>{a.passed?"Passed":"Needs development"}</Badge></div>)}</div>}
        </Card>
        <Card className="border-white/10 bg-white/[0.035] p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">Opportunity applications</h3><Badge variant="info">{careerApplications.length}</Badge></div>
          {careerApplications.length===0?<Empty text="No applications submitted yet."/>:<div className="space-y-3">{careerApplications.map((app)=><div key={app._id} className="rounded-xl border border-white/10 p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-semibold">{app.ambassadorName} · {app.currentLevel??"No level"}</p><p className="text-xs text-muted-foreground">{app.ambassadorEmail} · {app.opportunityTitle} · {pretty(app.opportunityType)} · Target {app.targetLevel}</p></div><Badge variant={app.status==="SELECTED"?"success":app.status==="REJECTED"?"danger":"info"}>{pretty(app.status)}</Badge></div><p className="mt-3 whitespace-pre-wrap text-sm">{app.statement}</p>{app.evidenceReference&&<p className="mt-2 text-xs text-muted-foreground">Evidence: {app.evidenceReference}</p>}{app.reviewNotes&&<p className="mt-2 text-xs text-muted-foreground">Review: {app.reviewNotes}</p>}{!["REJECTED","SELECTED","WITHDRAWN"].includes(app.status)&&<div className="mt-3 flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={()=>void reviewCareerApplication(app,"UNDER_REVIEW")}>Under review</Button><Button size="sm" variant="outline" onClick={()=>void reviewCareerApplication(app,"SHORTLISTED")}>Shortlist</Button><Button size="sm" onClick={()=>void reviewCareerApplication(app,"SELECTED")}>Select</Button><Button size="sm" variant="outline" onClick={()=>void reviewCareerApplication(app,"REJECTED")}>Reject</Button></div>}</div>)}</div>}
        </Card>
      </div>}

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

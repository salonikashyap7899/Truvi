import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Activity,
  BarChart3,
  Building2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FileSpreadsheet,
  Flame,
  Headset,
  Layers,
  Loader2,
  Megaphone,
  MessageCircle,
  Phone,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Tag,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { api } from "@/lib/api";

type Source = "META_AD" | "GOOGLE_AD" | "TELECALLER" | "WHATSAPP" | "WEBSITE" | "CUSTOMER_REFERRAL" | "OTHER";
type Status =
  | "NEW"
  | "CONTACTED"
  | "QUALIFIED"
  | "SITE_VISIT_SCHEDULED"
  | "SITE_VISIT_COMPLETED"
  | "BOOKING_TOKEN"
  | "CONVERTED"
  | "LOST";

type Project = { _id: string; name: string; city: string; location: string };
type Staff = { _id: string; name: string; role: string };

type Lead = {
  _id: string;
  buyerUserId: string | null;
  fullName: string;
  phone: string;
  email: string | null;
  source: Source;
  status: Status;
  project: { _id: string; name: string; city: string } | null;
  propertyType: string | null;
  preferredLocation: string | null;
  budgetRange: string | null;
  purchasePurpose: string | null;
  purchaseTimeline: string | null;
  requirement: string | null;
  contactConsent: boolean;
  consentBasis: string | null;
  nextFollowUpAt: string | null;
  assignedTo: { _id: string; name: string } | null;
  providerLeadId?: string | null;
  providerPageId?: string | null;
  providerFormId?: string | null;
  providerAdId?: string | null;
  providerAdName?: string | null;
  providerCampaignId?: string | null;
  providerCampaignName?: string | null;
  providerAdsetId?: string | null;
  providerAdsetName?: string | null;
  isDuplicate?: boolean;
  duplicateCount?: number;
  createdAt: string;
  updatedAt: string;
};

type MetaMapping = {
  _id: string;
  formId: string;
  formName: string | null;
  adId: string | null;
  adName: string | null;
  campaignId: string | null;
  campaignName: string | null;
  projectId: string;
  isActive: boolean;
  createdAt: string;
  project: { _id: string; name: string; city: string } | null;
};

type Buyer = {
  _id: string;
  name: string;
  email: string;
  phone: string | null;
  disabled: boolean;
  createdAt: string;
  requirements: number;
  platformLeads: number;
  crmLeads: number;
};

type BuyerInterests = {
  requirements: Array<{
    _id: string;
    title: string;
    propertyType: string;
    city: string;
    location: string;
    minBudget: number | null;
    maxBudget: number;
    purpose: string | null;
    timeline: string;
    details: string | null;
    status: string;
    createdAt: string;
  }>;
  listingEnquiries: Array<{
    _id: string;
    projectId: string;
    projectName: string | null;
    projectCity: string | null;
    stage: string;
    requirement: string | null;
    budgetRange: string | null;
    purchasePurpose: string | null;
    purchaseTimeline: string | null;
    createdAt: string;
  }>;
  crmEnquiries: Array<{
    _id: string;
    source: string;
    status: string;
    projectName: string | null;
    preferredLocation: string | null;
    propertyType: string | null;
    budgetRange: string | null;
    requirement: string | null;
    contactConsent: boolean;
    createdAt: string;
  }>;
};

type ActivityRow = { _id: string; type: string; content: string; createdAt: string; actor: string | null };
type Summary = {
  leads: {
    total: number;
    new: number;
    projectInterests: number;
    broaderRequirements: number;
    followUpsDue: number;
    siteVisitsScheduled?: number;
    siteVisitsCompleted?: number;
    bookingTokens?: number;
    converted?: number;
    duplicates?: number;
  };
  registeredBuyers: number;
  bySource: Array<{ source: string; total: number }>;
  distinctCampaigns?: string[];
  distinctAds?: string[];
  metaAdsConfigured: boolean;
  userPermissions?: {
    isAdmin: boolean;
    canReadAssigned: boolean;
    canReadSite: boolean;
    canUpdateStatus: boolean;
    canCreateActivity: boolean;
  };
};

const SOURCES: Array<{ value: Source; label: string }> = [
  { value: "META_AD", label: "Meta Ad (Facebook / Instagram)" },
  { value: "TELECALLER", label: "Telecaller" },
  { value: "GOOGLE_AD", label: "Google Ad" },
  { value: "WHATSAPP", label: "WhatsApp" },
  { value: "WEBSITE", label: "Website Form" },
  { value: "CUSTOMER_REFERRAL", label: "Customer Referral" },
  { value: "OTHER", label: "Other" },
];

const STATUSES: Array<{ value: Status; label: string; tone: string }> = [
  { value: "NEW", label: "New", tone: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
  { value: "CONTACTED", label: "Contacted", tone: "bg-purple-500/10 text-purple-300 border-purple-500/20" },
  { value: "QUALIFIED", label: "Qualified", tone: "bg-cyan-500/10 text-cyan-300 border-cyan-500/20" },
  { value: "SITE_VISIT_SCHEDULED", label: "Visit Scheduled", tone: "bg-amber-500/10 text-amber-300 border-amber-500/20" },
  { value: "SITE_VISIT_COMPLETED", label: "Visit Completed", tone: "bg-teal-500/10 text-teal-300 border-teal-500/20" },
  { value: "BOOKING_TOKEN", label: "Booking Token Received", tone: "bg-indigo-500/10 text-indigo-300 border-indigo-500/20" },
  { value: "CONVERTED", label: "Converted / Won", tone: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20" },
  { value: "LOST", label: "Lost / Closed", tone: "bg-rose-500/10 text-rose-300 border-rose-500/20" },
];

const sourceLabel = (source: string) => SOURCES.find((item) => item.value === source)?.label ?? source.replace(/_/g, " ");
const statusItem = (status: string) => STATUSES.find((item) => item.value === status) ?? { value: status as Status, label: status, tone: "bg-white/10 text-white" };
const dateLabel = (value: string) => new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
const dateTimeLabel = (value: string) => new Date(value).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
const dateTimeInputValue = (value: string | null) => {
  if (!value) return "";
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};

const fieldClass = "w-full rounded-xl border border-white/10 bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-sky-400";
const panelClass = "rounded-2xl border border-white/10 bg-card";

function generateWhatsAppGreeting(buyerName: string, projectName?: string | null): string {
  const site = projectName?.trim() ? projectName : "our premier residential developments";
  return `Hello ${buyerName || "there"}, thank you for your enquiry regarding ${site} with Truvi. I am reaching out to provide complete site plans, pricing details, and answer any questions. When is a convenient time for a brief call?`;
}

const blankForm = () => ({
  fullName: "", phone: "", email: "", source: "META_AD" as Source, projectId: "", propertyType: "", preferredLocation: "",
  budgetRange: "", purchasePurpose: "", purchaseTimeline: "", requirement: "", nextFollowUpAt: "", assignedToId: "",
  contactConsent: true, consentBasis: "Direct online lead form consent",
});

export default function AdminBuyerCrmPage() {
  const [tab, setTab] = useState<"pipeline" | "buyers">("pipeline");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [rows, setRows] = useState<Lead[]>([]);
  const [buyers, setBuyers] = useState<Buyer[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [source, setSource] = useState("");
  const [projectId, setProjectId] = useState("");
  const [campaign, setCampaign] = useState("");
  const [isDuplicate, setIsDuplicate] = useState("");
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(blankForm);
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [activities, setActivities] = useState<ActivityRow[]>([]);
  const [activityText, setActivityText] = useState("");
  const [activityType, setActivityType] = useState<"CALL" | "WHATSAPP" | "NOTE">("CALL");

  // Registered Buyers State
  const [buyerQuery, setBuyerQuery] = useState("");
  const [buyerPage, setBuyerPage] = useState(1);
  const [buyerTotal, setBuyerTotal] = useState(0);
  const [expandedBuyerId, setExpandedBuyerId] = useState<string | null>(null);
  const [buyerInterests, setBuyerInterests] = useState<BuyerInterests | null>(null);
  const [loadingBuyerInterests, setLoadingBuyerInterests] = useState(false);

  // Meta Mappings Modal State
  const [showMappings, setShowMappings] = useState(false);
  const [mappings, setMappings] = useState<MetaMapping[]>([]);
  const [loadingMappings, setLoadingMappings] = useState(false);
  const [mappingForm, setMappingForm] = useState({ formId: "", formName: "", campaignName: "", adName: "", projectId: "" });
  const [savingMapping, setSavingMapping] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);

  // Meta Leads CSV Import State
  const [showCsvImport, setShowCsvImport] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvProjectId, setCsvProjectId] = useState("");
  const [importingCsv, setImportingCsv] = useState(false);

  const loadSetup = useCallback(async () => {
    try {
      const [summaryRes, projectsRes] = await Promise.all([
        api.get("/buyer-crm/admin/summary"),
        api.get("/buyer-crm/admin/projects"),
      ]);
      setSummary(summaryRes.data);
      setProjects(projectsRes.data.projects ?? []);

      // Staff list is only accessible to Admin
      if (summaryRes.data?.userPermissions?.isAdmin ?? true) {
        try {
          const staffRes = await api.get("/buyer-crm/admin/staff");
          setStaff(staffRes.data.staff ?? []);
        } catch {
          // Non-admins ignore staff failure
        }
      }
    } catch (error: any) {
      toast.error(error?.response?.data?.error || "Could not load buyer CRM.");
    }
  }, []);

  const loadLeads = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get("/buyer-crm/admin/leads", {
        params: {
          page,
          limit: 30,
          q: query.trim() || undefined,
          status: status || undefined,
          source: source || undefined,
          projectId: projectId || undefined,
          campaign: campaign || undefined,
          isDuplicate: isDuplicate || undefined,
        },
      });
      setRows(response.data.leads ?? []);
      setTotal(response.data.total ?? 0);
    } catch (error: any) {
      toast.error(error?.response?.data?.error || "Could not load buyer leads.");
    } finally {
      setLoading(false);
    }
  }, [page, query, status, source, projectId, campaign, isDuplicate]);

  const loadBuyers = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get("/buyer-crm/admin/buyers", {
        params: { page: buyerPage, limit: 50, q: buyerQuery.trim() || undefined },
      });
      setBuyers(response.data.buyers ?? []);
      setBuyerTotal(response.data.total ?? 0);
    } catch (error: any) {
      toast.error(error?.response?.data?.error || "Could not load registered buyers.");
    } finally {
      setLoading(false);
    }
  }, [buyerPage, buyerQuery]);

  const loadMappings = useCallback(async () => {
    setLoadingMappings(true);
    try {
      const res = await api.get("/buyer-crm/admin/meta-mappings");
      setMappings(res.data.mappings ?? []);
    } catch {
      toast.error("Could not load Meta ad form mappings.");
    } finally {
      setLoadingMappings(false);
    }
  }, []);

  useEffect(() => { void loadSetup(); }, [loadSetup]);
  useEffect(() => {
    if (tab === "pipeline") void loadLeads();
    else void loadBuyers();
  }, [tab, loadLeads, loadBuyers]);

  useEffect(() => { setPage(1); }, [query, status, source, projectId, campaign, isDuplicate]);
  useEffect(() => { setBuyerPage(1); }, [buyerQuery]);

  const maxPage = Math.max(1, Math.ceil(total / 30));
  const buyerMaxPage = Math.max(1, Math.ceil(buyerTotal / 50));
  const setFormField = <K extends keyof ReturnType<typeof blankForm>>(key: K, value: ReturnType<typeof blankForm>[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  async function createLead(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.projectId && !form.requirement.trim() && !form.propertyType.trim() && !form.preferredLocation.trim() && !form.budgetRange.trim()) {
      toast.error("Choose a project or add details about the buyer's requirement.");
      return;
    }
    if (!form.contactConsent) {
      toast.error("Confirm the buyer agreed to be contacted.");
      return;
    }
    setSaving(true);
    try {
      await api.post("/buyer-crm/admin/leads", {
        ...form,
        email: form.email.trim() || undefined,
        projectId: form.projectId || undefined,
        nextFollowUpAt: form.nextFollowUpAt ? new Date(form.nextFollowUpAt).toISOString() : undefined,
        assignedToId: form.assignedToId || undefined,
      });
      toast.success("Buyer saved to the pipeline.");
      setForm(blankForm());
      setShowCreate(false);
      setTab("pipeline");
      await Promise.all([loadLeads(), loadSetup()]);
    } catch (error: any) {
      toast.error(error?.response?.data?.error || "Could not save the buyer.");
    } finally {
      setSaving(false);
    }
  }

  async function updateLead(id: string, patch: Record<string, unknown>) {
    try {
      await api.patch(`/buyer-crm/admin/leads/${id}`, patch);
      toast.success("Lead updated.");
      await Promise.all([loadLeads(), loadSetup()]);
    } catch (error: any) {
      toast.error(error?.response?.data?.error || "Could not update this buyer lead.");
    }
  }

  async function toggleHistory(id: string) {
    if (expandedId === id) { setExpandedId(null); return; }
    setExpandedId(id);
    setActivityText("");
    try {
      const response = await api.get(`/buyer-crm/admin/leads/${id}/activities`);
      setActivities(response.data.activities ?? []);
    } catch {
      toast.error("Could not load the lead activity history.");
    }
  }

  async function toggleBuyerInterests(id: string) {
    if (expandedBuyerId === id) { setExpandedBuyerId(null); return; }
    setExpandedBuyerId(id);
    setBuyerInterests(null);
    setLoadingBuyerInterests(true);
    try {
      const response = await api.get(`/buyer-crm/admin/buyers/${id}/interests`);
      setBuyerInterests(response.data);
    } catch (error: any) {
      toast.error(error?.response?.data?.error || "Could not load this buyer's interests.");
    } finally {
      setLoadingBuyerInterests(false);
    }
  }

  async function logActivity(id: string) {
    if (activityText.trim().length < 2) {
      toast.error("Add a short activity or conversation note.");
      return;
    }
    try {
      await api.post(`/buyer-crm/admin/leads/${id}/activities`, { type: activityType, content: activityText.trim() });
      setActivityText("");
      const response = await api.get(`/buyer-crm/admin/leads/${id}/activities`);
      setActivities(response.data.activities ?? []);
      await loadLeads();
      toast.success("Activity logged.");
    } catch (error: any) {
      toast.error(error?.response?.data?.error || "Could not add activity.");
    }
  }

  async function handleCreateMapping(e: React.FormEvent) {
    e.preventDefault();
    if (!mappingForm.formId.trim()) {
      toast.error("Form ID is required.");
      return;
    }
    if (!mappingForm.projectId) {
      toast.error("Select a project to attribute leads to.");
      return;
    }
    setSavingMapping(true);
    try {
      await api.post("/buyer-crm/admin/meta-mappings", mappingForm);
      toast.success("Meta ad form linked to project.");
      setMappingForm({ formId: "", formName: "", campaignName: "", adName: "", projectId: "" });
      await loadMappings();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to create mapping.");
    } finally {
      setSavingMapping(false);
    }
  }

  async function toggleMappingStatus(id: string, current: boolean) {
    try {
      await api.patch(`/buyer-crm/admin/meta-mappings/${id}`, { isActive: !current });
      toast.success("Mapping updated.");
      await loadMappings();
    } catch {
      toast.error("Could not toggle mapping status.");
    }
  }

  async function deleteMapping(id: string) {
    if (!window.confirm("Remove this Meta form mapping?")) return;
    try {
      await api.delete(`/buyer-crm/admin/meta-mappings/${id}`);
      toast.success("Mapping removed.");
      await loadMappings();
    } catch {
      toast.error("Could not delete mapping.");
    }
  }

  async function syncPastLeads(mappingId: string, label: string) {
    setSyncingId(mappingId);
    try {
      const res = await api.post(`/buyer-crm/admin/meta-mappings/${mappingId}/sync`);
      const { inserted, duplicates, totalFetched } = res.data;
      toast.success(
        `Successfully synced ${inserted} past leads from Meta for "${label}"! (${duplicates} duplicates skipped, ${totalFetched} total scanned)`
      );
      await Promise.all([loadLeads(), loadSetup()]);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to sync past leads from Meta.");
    } finally {
      setSyncingId(null);
    }
  }

  async function handleCsvImport(e: React.FormEvent) {
    e.preventDefault();
    if (!csvFile) {
      toast.error("Please select a Meta Ads CSV file to upload.");
      return;
    }
    setImportingCsv(true);
    try {
      const formData = new FormData();
      formData.append("file", csvFile);
      if (csvProjectId) formData.append("projectId", csvProjectId);

      const res = await api.post("/buyer-crm/admin/import-leads-csv", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const { inserted, duplicates, totalRows } = res.data;
      toast.success(
        `CSV import complete! Added ${inserted} leads (${duplicates} duplicates identified out of ${totalRows} rows).`
      );
      setCsvFile(null);
      setShowCsvImport(false);
      await Promise.all([loadLeads(), loadSetup()]);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to import Meta CSV leads.");
    } finally {
      setImportingCsv(false);
    }
  }

  const sourceCounts = useMemo(() => new Map((summary?.bySource ?? []).map((row) => [row.source, row.total])), [summary]);
  const crm = summary?.leads;
  const isAdmin = summary?.userPermissions?.isAdmin ?? true;

  return (
    <main className="buyer-crm min-h-screen space-y-5 bg-background p-4 text-foreground sm:p-6 md:p-8">
      {/* Top Header */}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="mb-1 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.2em] text-sky-400">
            <Headset size={14} /> Real Estate Lead Engine
          </p>
          <h1 className="font-display text-2xl font-semibold sm:text-3xl">Meta Ads & Buyer CRM</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Direct integration with Facebook & Instagram Instant Forms. Leads segregated by project/site.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isAdmin && (
            <>
              <button
                onClick={() => {
                  setShowMappings(true);
                  void loadMappings();
                }}
                className="inline-flex items-center gap-2 rounded-xl border border-sky-500/30 bg-sky-500/10 px-3.5 py-2 text-sm font-medium text-sky-300 hover:bg-sky-500/20"
              >
                <Settings size={14} /> Site / Form Mappings
              </button>
              <button
                onClick={() => setShowCsvImport(true)}
                className="inline-flex items-center gap-2 rounded-xl border border-purple-500/30 bg-purple-500/10 px-3.5 py-2 text-sm font-medium text-purple-300 hover:bg-purple-500/20"
              >
                <Upload size={14} /> Import Meta CSV
              </button>
            </>
          )}
          <button
            onClick={() => { void Promise.all([loadSetup(), tab === "pipeline" ? loadLeads() : loadBuyers()]); }}
            className="inline-flex items-center gap-2 rounded-xl border border-white/15 px-3 py-2 text-sm hover:bg-white/5"
          >
            <RefreshCw size={14} /> Refresh
          </button>
          {isAdmin && (
            <button
              onClick={() => setShowCreate((open) => !open)}
              className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500"
            >
              <Plus size={15} /> Add Lead
            </button>
          )}
        </div>
      </header>

      {/* KPI Cards */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Metric label="Total Leads" value={crm?.total} hint="All sources" icon={<Activity size={16} />} />
        <Metric label="New Leads" value={crm?.new} hint="Pending first contact" icon={<Flame size={16} />} tone="amber" />
        <Metric label="Site Visits" value={(crm?.siteVisitsScheduled ?? 0) + (crm?.siteVisitsCompleted ?? 0)} hint={`${crm?.siteVisitsCompleted ?? 0} completed`} icon={<Building2 size={16} />} tone="teal" />
        <Metric label="Booking Tokens" value={crm?.bookingTokens} hint="Token / Advance paid" icon={<Tag size={16} />} tone="indigo" />
        <Metric label="Converted" value={crm?.converted} hint="Deals closed" icon={<BarChart3 size={16} />} tone="green" />
        <Metric label="Repeat Leads" value={crm?.duplicates} hint="Repeated form submissions" icon={<Layers size={16} />} tone="purple" />
      </section>

      {/* Meta Webhook Status Bar */}
      <section className={`${panelClass} flex flex-wrap items-center justify-between gap-3 p-4`}>
        <div className="flex items-start gap-3">
          <span className={`mt-0.5 grid size-9 place-items-center rounded-xl ${summary?.metaAdsConfigured ? "bg-emerald-500/10 text-emerald-300" : "bg-amber-400/10 text-amber-300"}`}>
            <ShieldCheck size={18} />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <p className="font-semibold">Meta Lead Ads Integration</p>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${summary?.metaAdsConfigured ? "bg-emerald-500/10 text-emerald-300 border border-emerald-500/20" : "bg-amber-400/10 text-amber-300 border border-amber-400/20"}`}>
                {summary?.metaAdsConfigured ? "Live Webhook Active" : "Config Required"}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Webhook: <code>/api/webhooks/meta-leads</code>. Form leads stream directly with attribution and WhatsApp routing.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
          {SOURCES.map((item) =>
            sourceCounts.get(item.value) ? (
              <span key={item.value} className="rounded-full border border-white/10 bg-white/[0.02] px-2.5 py-1">
                {item.label}: <strong className="text-foreground">{sourceCounts.get(item.value)}</strong>
              </span>
            ) : null
          )}
        </div>
      </section>

      {/* Manual Lead Creation Form */}
      {showCreate && (
        <section className={`${panelClass} p-4 sm:p-5 border-sky-500/30`}>
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold text-lg">Add Buyer Lead</h2>
              <p className="mt-1 text-xs text-muted-foreground">Manually log an inbound call, walk-in, WhatsApp inquiry, or external campaign lead.</p>
            </div>
            <button onClick={() => setShowCreate(false)} aria-label="Close form" className="rounded-full border border-white/15 p-1.5 hover:bg-white/10">
              <X size={15} />
            </button>
          </div>
          <form onSubmit={(event) => void createLead(event)} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <label className="text-xs text-muted-foreground">
              Buyer name *
              <input required minLength={2} maxLength={100} value={form.fullName} onChange={(e) => setFormField("fullName", e.target.value)} className={`${fieldClass} mt-1`} placeholder="Full name" />
            </label>
            <label className="text-xs text-muted-foreground">
              10-Digit Mobile *
              <input required value={form.phone} onChange={(e) => setFormField("phone", e.target.value)} className={`${fieldClass} mt-1`} placeholder="e.g. 9876543210" inputMode="tel" />
            </label>
            <label className="text-xs text-muted-foreground">
              Email (optional)
              <input type="email" value={form.email} onChange={(e) => setFormField("email", e.target.value)} className={`${fieldClass} mt-1`} placeholder="name@example.com" />
            </label>
            <label className="text-xs text-muted-foreground">
              Lead source
              <select value={form.source} onChange={(e) => setFormField("source", e.target.value as Source)} className={`${fieldClass} mt-1`}>
                {SOURCES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>
            <label className="text-xs text-muted-foreground">
              Interested Site / Project
              <select value={form.projectId} onChange={(e) => setFormField("projectId", e.target.value)} className={`${fieldClass} mt-1`}>
                <option value="">No specific project (General requirement)</option>
                {projects.map((project) => (
                  <option key={project._id} value={project._id}>{project.name} ({project.city})</option>
                ))}
              </select>
            </label>
            <label className="text-xs text-muted-foreground">
              Property type
              <input value={form.propertyType} onChange={(e) => setFormField("propertyType", e.target.value)} className={`${fieldClass} mt-1`} placeholder="Plot, 2BHK, 3BHK, Villa…" />
            </label>
            <label className="text-xs text-muted-foreground">
              Preferred Location
              <input value={form.preferredLocation} onChange={(e) => setFormField("preferredLocation", e.target.value)} className={`${fieldClass} mt-1`} placeholder="Locality or Sector" />
            </label>
            <label className="text-xs text-muted-foreground">
              Budget range
              <input value={form.budgetRange} onChange={(e) => setFormField("budgetRange", e.target.value)} className={`${fieldClass} mt-1`} placeholder="e.g. ₹50–75 Lakhs" />
            </label>
            <label className="text-xs text-muted-foreground">
              Purpose
              <select value={form.purchasePurpose} onChange={(e) => setFormField("purchasePurpose", e.target.value)} className={`${fieldClass} mt-1`}>
                <option value="">Not recorded</option>
                <option value="SELF_USE">Self-Use (End User)</option>
                <option value="INVESTMENT">Investment</option>
                <option value="UNDECIDED">Undecided</option>
              </select>
            </label>
            <label className="text-xs text-muted-foreground">
              Timeline
              <select value={form.purchaseTimeline} onChange={(e) => setFormField("purchaseTimeline", e.target.value)} className={`${fieldClass} mt-1`}>
                <option value="">Not recorded</option>
                <option value="IMMEDIATE">Immediate (Within 30 days)</option>
                <option value="WITHIN_3_MONTHS">Within 3 Months</option>
                <option value="3_TO_6_MONTHS">3–6 Months</option>
                <option value="6_TO_12_MONTHS">6–12 Months</option>
                <option value="MORE_THAN_12_MONTHS">More than a year</option>
              </select>
            </label>
            {isAdmin && (
              <label className="text-xs text-muted-foreground">
                Assign to Staff
                <select value={form.assignedToId} onChange={(e) => setFormField("assignedToId", e.target.value)} className={`${fieldClass} mt-1`}>
                  <option value="">Unassigned</option>
                  {staff.map((person) => (
                    <option key={person._id} value={person._id}>{person.name} ({person.role})</option>
                  ))}
                </select>
              </label>
            )}
            <label className="text-xs text-muted-foreground">
              Next follow-up date & time
              <input type="datetime-local" value={form.nextFollowUpAt} onChange={(e) => setFormField("nextFollowUpAt", e.target.value)} className={`${fieldClass} mt-1`} />
            </label>
            <label className="text-xs text-muted-foreground sm:col-span-2 xl:col-span-4">
              Requirement & Inquiry Notes
              <textarea maxLength={1200} value={form.requirement} onChange={(e) => setFormField("requirement", e.target.value)} rows={2} className={`${fieldClass} mt-1 resize-y`} placeholder="What did the buyer inquire about? Specific unit size, amenities, or financing details." />
            </label>
            <div className="sm:col-span-2 xl:col-span-4 rounded-xl border border-sky-400/20 bg-sky-400/[0.04] p-3">
              <label className="flex items-start gap-2 text-xs">
                <input type="checkbox" checked={form.contactConsent} onChange={(e) => setFormField("contactConsent", e.target.checked)} className="mt-0.5" />
                <span>
                  <strong className="text-foreground">Contact consent granted</strong>
                  <span className="mt-0.5 block text-muted-foreground">Buyer consented to receiving property details and updates via call and WhatsApp.</span>
                </span>
              </label>
              <input required minLength={4} maxLength={300} value={form.consentBasis} onChange={(e) => setFormField("consentBasis", e.target.value)} className={`${fieldClass} mt-2`} placeholder="Consent record (e.g. Meta Instant Form submission, verbal consent during call)" />
            </div>
            <div className="flex justify-end gap-2 sm:col-span-2 xl:col-span-4">
              <button type="button" onClick={() => setShowCreate(false)} className="rounded-xl border border-white/15 px-4 py-2 text-sm hover:bg-white/5">Cancel</button>
              <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-60">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Save Lead
              </button>
            </div>
          </form>
        </section>
      )}

      {/* Site Tabs Navigation: "hr ads hr site ka lead alag alag show ho" */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Sites & Projects View</p>
          <span className="text-xs text-muted-foreground">{total} total matching</span>
        </div>
        <div className="flex flex-wrap gap-2 border-b border-white/10 pb-3">
          <button
            onClick={() => setProjectId("")}
            className={`rounded-xl px-3.5 py-1.5 text-xs font-medium transition ${
              projectId === ""
                ? "bg-sky-500 text-white shadow-md shadow-sky-500/20"
                : "border border-white/10 bg-white/[0.02] text-muted-foreground hover:bg-white/5"
            }`}
          >
            All Sites ({summary?.leads.total ?? 0})
          </button>
          {projects.map((p) => (
            <button
              key={p._id}
              onClick={() => setProjectId(p._id)}
              className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition ${
                projectId === p._id
                  ? "bg-sky-500 text-white shadow-md shadow-sky-500/20"
                  : "border border-white/10 bg-white/[0.02] text-muted-foreground hover:bg-white/5"
              }`}
            >
              <Building2 size={12} />
              {p.name}
            </button>
          ))}
          <button
            onClick={() => setProjectId("GENERAL")}
            className={`rounded-xl px-3 py-1.5 text-xs font-medium transition ${
              projectId === "GENERAL"
                ? "bg-sky-500 text-white shadow-md shadow-sky-500/20"
                : "border border-white/10 bg-white/[0.02] text-muted-foreground hover:bg-white/5"
            }`}
          >
            Broader Requirements ({summary?.leads.broaderRequirements ?? 0})
          </button>
        </div>
      </section>

      {/* Main Tabs */}
      <nav className="flex gap-2 border-b border-white/10">
        <button
          onClick={() => setTab("pipeline")}
          className={`border-b-2 px-3 py-2 text-sm font-semibold transition ${
            tab === "pipeline" ? "border-sky-400 text-sky-300" : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Meta & CRM Pipeline ({total})
        </button>
        {isAdmin && (
          <button
            onClick={() => setTab("buyers")}
            className={`border-b-2 px-3 py-2 text-sm font-semibold transition ${
              tab === "buyers" ? "border-sky-400 text-sky-300" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Registered App Buyers ({summary?.registeredBuyers ?? 0})
          </button>
        )}
      </nav>

      {tab === "pipeline" ? (
        <>
          {/* Filters Bar */}
          <section className={`${panelClass} grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-5`}>
            <div className="relative">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className={`${fieldClass} pl-9`}
                placeholder="Search name, phone, email, ad, need…"
              />
            </div>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className={fieldClass}>
              <option value="">All Stages</option>
              {STATUSES.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
            <select value={source} onChange={(e) => setSource(e.target.value)} className={fieldClass}>
              <option value="">All Sources</option>
              {SOURCES.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
            <select value={campaign} onChange={(e) => setCampaign(e.target.value)} className={fieldClass}>
              <option value="">All Campaigns</option>
              {(summary?.distinctCampaigns ?? []).map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <select value={isDuplicate} onChange={(e) => setIsDuplicate(e.target.value)} className={fieldClass}>
              <option value="">All Submissions</option>
              <option value="true">Repeat Leads Only</option>
              <option value="false">Unique Leads Only</option>
            </select>
          </section>

          {loading ? (
            <Loading />
          ) : rows.length === 0 ? (
            <div className={`${panelClass} p-12 text-center text-sm text-muted-foreground`}>
              No buyer leads match the active filters.
            </div>
          ) : (
            <>
              {/* Mobile View */}
              <section className="space-y-3 lg:hidden">
                {rows.map((row) => (
                  <LeadCard
                    key={row._id}
                    row={row}
                    expanded={expandedId === row._id}
                    onStatus={(val) => void updateLead(row._id, { status: val })}
                    onHistory={() => void toggleHistory(row._id)}
                  >
                    {expandedId === row._id && (
                      <ActivityPanel
                        row={row}
                        isAdmin={isAdmin}
                        staff={staff}
                        activities={activities}
                        note={activityText}
                        setNote={setActivityText}
                        type={activityType}
                        setType={setActivityType}
                        onLog={() => void logActivity(row._id)}
                        onUpdate={(patch) => void updateLead(row._id, patch)}
                      />
                    )}
                  </LeadCard>
                ))}
              </section>

              {/* Desktop Table View */}
              <section className={`${panelClass} hidden overflow-x-auto lg:block`}>
                <table className="w-full min-w-[1150px] text-left text-sm">
                  <thead className="border-b border-white/10 text-[11px] uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="p-3">Buyer & Contact</th>
                      <th className="p-3">Site / Project</th>
                      <th className="p-3">Meta Ad & Campaign</th>
                      <th className="p-3">Budget & Requirements</th>
                      <th className="p-3">Pipeline Stage</th>
                      <th className="p-3">Actions</th>
                      <th className="p-3">Activity</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {rows.map((row) => (
                      <Fragment key={row._id}>
                        <tr className="align-top hover:bg-muted/40 transition">
                          {/* Buyer & Contact */}
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              <p className="font-semibold text-foreground">{row.fullName}</p>
                              {row.isDuplicate && (
                                <span className="rounded-full border border-purple-500/30 bg-purple-500/10 px-2 py-0.5 text-[10px] font-semibold text-purple-300">
                                  Repeat x{row.duplicateCount || 2}
                                </span>
                              )}
                              {row.buyerUserId && (
                                <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-300">App</span>
                              )}
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                              <a
                                href={`tel:${row.phone}`}
                                className="inline-flex items-center gap-1 text-sky-400 hover:underline"
                              >
                                <Phone size={11} />
                                {row.phone}
                              </a>
                              {row.email && <span className="text-muted-foreground">{row.email}</span>}
                            </div>
                            <p className="mt-1 text-[11px] text-muted-foreground">{dateLabel(row.createdAt)}</p>
                          </td>

                          {/* Site / Project */}
                          <td className="p-3">
                            {row.project ? (
                              <div>
                                <span className="inline-flex items-center gap-1 rounded-lg border border-sky-500/20 bg-sky-500/10 px-2.5 py-1 text-xs font-semibold text-sky-300">
                                  <Building2 size={12} />
                                  {row.project.name}
                                </span>
                                <p className="mt-1 text-[11px] text-muted-foreground">{row.project.city}</p>
                              </div>
                            ) : (
                              <span className="inline-flex rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-muted-foreground">
                                General Requirement
                              </span>
                            )}
                            {row.assignedTo && (
                              <p className="mt-1.5 text-[11px] text-muted-foreground">
                                Owner: <strong className="text-foreground">{row.assignedTo.name}</strong>
                              </p>
                            )}
                          </td>

                          {/* Meta Ad & Campaign */}
                          <td className="p-3 max-w-[220px]">
                            {row.source === "META_AD" ? (
                              <div className="space-y-1">
                                <span className="inline-flex items-center gap-1 rounded-md border border-blue-500/20 bg-blue-500/10 px-2 py-0.5 text-[11px] font-medium text-blue-300">
                                  <Megaphone size={11} /> Meta Ad
                                </span>
                                {row.providerCampaignName && (
                                  <p className="truncate text-xs font-medium text-foreground" title={row.providerCampaignName}>
                                    {row.providerCampaignName}
                                  </p>
                                )}
                                {row.providerAdName && (
                                  <p className="truncate text-[11px] text-muted-foreground" title={row.providerAdName}>
                                    Ad: {row.providerAdName}
                                  </p>
                                )}
                                {row.providerFormId && (
                                  <p className="text-[10px] text-muted-foreground">Form: {row.providerFormId}</p>
                                )}
                              </div>
                            ) : (
                              <div>
                                <span className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-muted-foreground">
                                  {sourceLabel(row.source)}
                                </span>
                              </div>
                            )}
                          </td>

                          {/* Budget & Requirements */}
                          <td className="p-3 max-w-[240px]">
                            {row.budgetRange && (
                              <p className="text-xs font-medium text-emerald-400">Budget: {row.budgetRange}</p>
                            )}
                            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                              {[row.propertyType, row.preferredLocation, row.requirement].filter(Boolean).join(" · ") || "No specific notes"}
                            </p>
                            {row.purchasePurpose && (
                              <p className="mt-1 text-[10px] text-muted-foreground">Purpose: {row.purchasePurpose}</p>
                            )}
                          </td>

                          {/* Pipeline Stage */}
                          <td className="p-3">
                            <select
                              aria-label={`Status for ${row.fullName}`}
                              value={row.status}
                              onChange={(e) => void updateLead(row._id, { status: e.target.value })}
                              className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium outline-none ${statusItem(row.status).tone}`}
                            >
                              {STATUSES.map((item) => (
                                <option key={item.value} value={item.value} className="bg-background text-foreground">
                                  {item.label}
                                </option>
                              ))}
                            </select>
                            {row.nextFollowUpAt && (
                              <p className="mt-1 text-[11px] text-muted-foreground flex items-center gap-1">
                                <Clock3 size={11} /> {dateTimeLabel(row.nextFollowUpAt)}
                              </p>
                            )}
                          </td>

                          {/* Actions: One-click WhatsApp & Call */}
                          <td className="p-3">
                            <div className="flex flex-col gap-1.5">
                              <a
                                href={`https://wa.me/91${row.phone}?text=${encodeURIComponent(
                                  generateWhatsAppGreeting(row.fullName, row.project?.name)
                                )}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5 text-xs font-medium text-emerald-300 hover:bg-emerald-500/20 transition"
                              >
                                <MessageCircle size={12} /> WhatsApp
                              </a>
                              <a
                                href={`tel:${row.phone}`}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-muted-foreground hover:bg-white/10 transition"
                              >
                                <Phone size={11} /> Call
                              </a>
                            </div>
                          </td>

                          {/* Activity / Follow-up */}
                          <td className="p-3">
                            <button
                              onClick={() => void toggleHistory(row._id)}
                              className="rounded-lg border border-white/15 px-3 py-1.5 text-xs hover:bg-white/5"
                            >
                              {expandedId === row._id ? "Close" : "History"}
                            </button>
                          </td>
                        </tr>

                        {expandedId === row._id && (
                          <tr key={`${row._id}-expanded`}>
                            <td colSpan={7} className="bg-white/[.02] p-4">
                              <ActivityPanel
                                row={row}
                                isAdmin={isAdmin}
                                staff={staff}
                                activities={activities}
                                note={activityText}
                                setNote={setActivityText}
                                type={activityType}
                                setType={setActivityType}
                                onLog={() => void logActivity(row._id)}
                                onUpdate={(patch) => void updateLead(row._id, patch)}
                              />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </section>

              <Pager page={page} totalPages={maxPage} total={total} onPage={setPage} />
            </>
          )}
        </>
      ) : (
        /* Registered Buyers Tab */
        <>
          <div className="relative max-w-xl">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={buyerQuery}
              onChange={(e) => setBuyerQuery(e.target.value)}
              className={`${fieldClass} pl-9`}
              placeholder="Search registered buyer name, phone, email…"
            />
          </div>
          {loading ? (
            <Loading />
          ) : buyers.length === 0 ? (
            <div className={`${panelClass} p-10 text-center text-sm text-muted-foreground`}>
              No registered buyer accounts found.
            </div>
          ) : (
            <>
              <section className={`${panelClass} overflow-x-auto`}>
                <table className="w-full min-w-[900px] text-left text-sm">
                  <thead className="border-b border-white/10 text-[11px] uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="p-3">Buyer</th>
                      <th className="p-3">Registered</th>
                      <th className="p-3">App Requirements</th>
                      <th className="p-3">Listing Enquiries</th>
                      <th className="p-3">CRM Enquiries</th>
                      <th className="p-3">Account Status</th>
                      <th className="p-3">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {buyers.map((buyer) => (
                      <Fragment key={buyer._id}>
                        <tr className="hover:bg-muted/40 transition">
                          <td className="p-3">
                            <p className="font-medium">{buyer.name}</p>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {buyer.email}
                              {buyer.phone ? ` · ${buyer.phone}` : ""}
                            </p>
                          </td>
                          <td className="p-3 text-xs text-muted-foreground">{dateLabel(buyer.createdAt)}</td>
                          <td className="p-3 font-semibold">{buyer.requirements}</td>
                          <td className="p-3 font-semibold">{buyer.platformLeads}</td>
                          <td className="p-3 font-semibold">{buyer.crmLeads}</td>
                          <td className="p-3">
                            <span className={`rounded-full px-2 py-1 text-[10px] ${buyer.disabled ? "bg-rose-500/10 text-rose-300" : "bg-emerald-500/10 text-emerald-300"}`}>
                              {buyer.disabled ? "Disabled" : "Active"}
                            </span>
                          </td>
                          <td className="p-3">
                            <button
                              onClick={() => void toggleBuyerInterests(buyer._id)}
                              className="rounded-lg border border-white/15 px-2.5 py-1.5 text-xs hover:bg-white/5"
                            >
                              {expandedBuyerId === buyer._id ? "Hide" : "View"}
                            </button>
                          </td>
                        </tr>
                        {expandedBuyerId === buyer._id && (
                          <tr key={`${buyer._id}-interests`}>
                            <td colSpan={7} className="bg-white/[.02] p-4">
                              {loadingBuyerInterests ? <Loading /> : <BuyerInterestDetails data={buyerInterests} />}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </section>
              <Pager page={buyerPage} totalPages={buyerMaxPage} total={buyerTotal} onPage={setBuyerPage} />
            </>
          )}
        </>
      )}

      {/* Meta Form Mappings Modal Dialog */}
      {showMappings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-2xl border border-white/10 bg-background p-6 shadow-2xl">
            <div className="flex items-start justify-between border-b border-white/10 pb-4">
              <div>
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <Settings size={18} className="text-sky-400" />
                  Meta Ad Form to Site / Project Mappings
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Map Facebook & Instagram Instant Form IDs and Campaign names directly to projects for automatic lead attribution.
                </p>
              </div>
              <button
                onClick={() => setShowMappings(false)}
                className="rounded-full border border-white/10 p-1.5 hover:bg-white/10"
              >
                <X size={16} />
              </button>
            </div>

            {/* Create Mapping Form */}
            <form onSubmit={(e) => void handleCreateMapping(e)} className="my-5 rounded-xl border border-white/10 bg-white/[0.02] p-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Link New Form / Ad</p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <label className="text-xs text-muted-foreground">
                  Form ID *
                  <input
                    required
                    value={mappingForm.formId}
                    onChange={(e) => setMappingForm((s) => ({ ...s, formId: e.target.value }))}
                    className={`${fieldClass} mt-1`}
                    placeholder="e.g. 104829104829102"
                  />
                </label>
                <label className="text-xs text-muted-foreground">
                  Form Name (optional)
                  <input
                    value={mappingForm.formName}
                    onChange={(e) => setMappingForm((s) => ({ ...s, formName: e.target.value }))}
                    className={`${fieldClass} mt-1`}
                    placeholder="e.g. Godrej Emerald 3BHK Launch"
                  />
                </label>
                <label className="text-xs text-muted-foreground">
                  Link to Project / Site *
                  <select
                    required
                    value={mappingForm.projectId}
                    onChange={(e) => setMappingForm((s) => ({ ...s, projectId: e.target.value }))}
                    className={`${fieldClass} mt-1`}
                  >
                    <option value="">Select an approved site</option>
                    {projects.map((p) => (
                      <option key={p._id} value={p._id}>{p.name} ({p.city})</option>
                    ))}
                  </select>
                </label>
                <label className="text-xs text-muted-foreground">
                  Campaign Name (optional)
                  <input
                    value={mappingForm.campaignName}
                    onChange={(e) => setMappingForm((s) => ({ ...s, campaignName: e.target.value }))}
                    className={`${fieldClass} mt-1`}
                    placeholder="e.g. Q4_Diwali_Plots_Campaign"
                  />
                </label>
                <label className="text-xs text-muted-foreground">
                  Ad Name (optional)
                  <input
                    value={mappingForm.adName}
                    onChange={(e) => setMappingForm((s) => ({ ...s, adName: e.target.value }))}
                    className={`${fieldClass} mt-1`}
                    placeholder="e.g. Video_Walkthrough_01"
                  />
                </label>
                <div className="flex items-end">
                  <button
                    type="submit"
                    disabled={savingMapping}
                    className="w-full rounded-xl bg-sky-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-sky-500 disabled:opacity-50"
                  >
                    {savingMapping ? "Linking…" : "Link Form to Site"}
                  </button>
                </div>
              </div>
            </form>

            {/* Mappings Table */}
            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Active Form Mappings</h3>
              {loadingMappings ? (
                <Loading />
              ) : mappings.length === 0 ? (
                <p className="py-6 text-center text-xs text-muted-foreground">No form mappings created yet.</p>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-white/10">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-white/10 bg-white/[0.02] text-muted-foreground">
                      <tr>
                        <th className="p-2.5">Form ID / Name</th>
                        <th className="p-2.5">Linked Site / Project</th>
                        <th className="p-2.5">Campaign / Ad Filter</th>
                        <th className="p-2.5">Status</th>
                        <th className="p-2.5">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {mappings.map((m) => (
                        <tr key={m._id} className="hover:bg-white/[0.02]">
                          <td className="p-2.5 font-medium">
                            <p className="font-semibold">{m.formName || "Untitled Form"}</p>
                            <code className="text-[10px] text-muted-foreground">{m.formId}</code>
                          </td>
                          <td className="p-2.5">
                            <span className="rounded-md border border-sky-500/20 bg-sky-500/10 px-2 py-0.5 text-[11px] font-medium text-sky-300">
                              {m.project?.name ?? "Linked Project"}
                            </span>
                            <p className="text-[10px] text-muted-foreground mt-0.5">{m.project?.city}</p>
                          </td>
                          <td className="p-2.5 text-muted-foreground">
                            {m.campaignName && <p>Campaign: {m.campaignName}</p>}
                            {m.adName && <p>Ad: {m.adName}</p>}
                            {!m.campaignName && !m.adName && <span>—</span>}
                          </td>
                          <td className="p-2.5">
                            <button
                              onClick={() => void toggleMappingStatus(m._id, m.isActive)}
                              className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                                m.isActive ? "bg-emerald-500/10 text-emerald-300" : "bg-rose-500/10 text-rose-300"
                              }`}
                            >
                              {m.isActive ? "Active" : "Inactive"}
                            </button>
                          </td>
                          <td className="p-2.5">
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => void syncPastLeads(m._id, m.formName || m.formId)}
                                disabled={syncingId === m._id}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-sky-500/30 bg-sky-500/10 px-2.5 py-1 text-[11px] font-medium text-sky-300 hover:bg-sky-500/20 disabled:opacity-50"
                                title="Fetch past leads from Meta Graph API for this form"
                              >
                                {syncingId === m._id ? (
                                  <Loader2 size={12} className="animate-spin" />
                                ) : (
                                  <RefreshCw size={12} />
                                )}
                                Sync Past Leads
                              </button>
                              <button
                                onClick={() => void deleteMapping(m._id)}
                                className="rounded-lg p-1.5 text-muted-foreground hover:bg-rose-500/10 hover:text-rose-400"
                                title="Delete mapping"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="mt-5 flex justify-end">
              <button
                onClick={() => setShowMappings(false)}
                className="rounded-xl border border-white/10 px-4 py-2 text-xs font-semibold hover:bg-white/5"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Meta Leads CSV Import Modal Dialog */}
      {showCsvImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-2xl border border-white/10 bg-background p-6 shadow-2xl">
            <div className="flex items-start justify-between border-b border-white/10 pb-4">
              <div>
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <FileSpreadsheet size={18} className="text-purple-400" />
                  Import Historical Meta Leads (CSV)
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Upload exported CSV leads from Meta Ads Manager / Business Suite. We automatically parse columns, deduplicate phone numbers, and map them to the selected project site.
                </p>
              </div>
              <button
                onClick={() => {
                  setShowCsvImport(false);
                  setCsvFile(null);
                }}
                className="rounded-full border border-white/10 p-1.5 hover:bg-white/10"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={(e) => void handleCsvImport(e)} className="mt-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">
                  Meta Leads CSV File *
                </label>
                <div className="relative rounded-xl border border-dashed border-white/20 bg-white/[0.02] p-4 text-center hover:bg-white/[0.04]">
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    required
                    onChange={(e) => setCsvFile(e.target.files?.[0] || null)}
                    className="absolute inset-0 size-full cursor-pointer opacity-0"
                  />
                  <div className="flex flex-col items-center justify-center gap-1.5 text-xs">
                    <Upload size={22} className="text-purple-400" />
                    {csvFile ? (
                      <span className="font-medium text-foreground">{csvFile.name} ({(csvFile.size / 1024).toFixed(1)} KB)</span>
                    ) : (
                      <>
                        <span className="font-medium text-foreground">Click or drag & drop Meta CSV file here</span>
                        <span className="text-[10px] text-muted-foreground">Exported from Meta Business Suite / Instant Forms</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">
                  Attribute to Project / Site (optional)
                </label>
                <select
                  value={csvProjectId}
                  onChange={(e) => setCsvProjectId(e.target.value)}
                  className={fieldClass}
                >
                  <option value="">Auto-detect from Form ID / Campaign mapping (or General Lead)</option>
                  {projects.map((p) => (
                    <option key={p._id} value={p._id}>
                      {p.name} ({p.city})
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  If left unselected, we will use your existing Form ID mappings to attribute leads to the correct site.
                </p>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 text-[11px] text-muted-foreground space-y-1">
                <p className="font-semibold text-foreground">Smart Ingestion Rules:</p>
                <p>• Duplicate leads (same phone number) will not create messy duplicates; their record is updated.</p>
                <p>• Buyer names, email addresses, campaign names, and creation timestamps will be preserved.</p>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => {
                    setShowCsvImport(false);
                    setCsvFile(null);
                  }}
                  className="rounded-xl border border-white/10 px-4 py-2 text-xs font-semibold hover:bg-white/5"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={importingCsv || !csvFile}
                  className="inline-flex items-center gap-2 rounded-xl bg-purple-600 px-4 py-2 text-xs font-semibold text-white hover:bg-purple-500 disabled:opacity-50"
                >
                  {importingCsv ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                  {importingCsv ? "Importing Leads…" : "Import Leads"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}

function Metric({
  label,
  value,
  hint,
  icon,
  tone = "blue",
}: {
  label: string;
  value?: number;
  hint: string;
  icon: React.ReactNode;
  tone?: "blue" | "amber" | "teal" | "indigo" | "green" | "purple";
}) {
  const tones = {
    blue: "text-sky-400",
    amber: "text-amber-400",
    teal: "text-teal-400",
    indigo: "text-indigo-400",
    green: "text-emerald-400",
    purple: "text-purple-400",
  };
  return (
    <div className={`${panelClass} p-3.5`}>
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>{label}</span>
        <span className={tones[tone]}>{icon}</span>
      </div>
      <p className="mt-2 text-2xl font-semibold text-foreground">{value ?? 0}</p>
      <p className="mt-0.5 text-[10px] text-muted-foreground">{hint}</p>
    </div>
  );
}

function Loading() {
  return (
    <p className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
      <Loader2 size={15} className="animate-spin" /> Loading…
    </p>
  );
}

function Pager({ page, totalPages, total, onPage }: { page: number; totalPages: number; total: number; onPage: (page: number) => void }) {
  return (
    <div className="flex items-center justify-between text-xs text-muted-foreground">
      <span>{total.toLocaleString("en-IN")} records</span>
      <div className="flex items-center gap-2">
        <button disabled={page <= 1} onClick={() => onPage(page - 1)} className="grid size-8 place-items-center rounded-lg border border-white/15 disabled:opacity-35" aria-label="Previous page">
          <ChevronLeft size={15} />
        </button>
        <span>Page {page} of {totalPages}</span>
        <button disabled={page >= totalPages} onClick={() => onPage(page + 1)} className="grid size-8 place-items-center rounded-lg border border-white/15 disabled:opacity-35" aria-label="Next page">
          <ChevronRight size={15} />
        </button>
      </div>
    </div>
  );
}

function LeadCard({
  row,
  expanded,
  onStatus,
  onHistory,
  children,
}: {
  row: Lead;
  expanded: boolean;
  onStatus: (status: Status) => void;
  onHistory: () => void;
  children?: React.ReactNode;
}) {
  return (
    <article className={`${panelClass} p-4 space-y-3`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <p className="font-semibold">{row.fullName}</p>
            {row.isDuplicate && (
              <span className="rounded-full border border-purple-500/30 bg-purple-500/10 px-2 py-0.5 text-[10px] font-semibold text-purple-300">
                Repeat x{row.duplicateCount || 2}
              </span>
            )}
          </div>
          <div className="mt-1 flex items-center gap-2 text-xs">
            <a href={`tel:${row.phone}`} className="inline-flex items-center gap-1 text-sky-400">
              <Phone size={11} /> {row.phone}
            </a>
            {row.email && <span className="text-muted-foreground text-[11px]">{row.email}</span>}
          </div>
        </div>
        <span className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-muted-foreground">
          {sourceLabel(row.source)}
        </span>
      </div>

      {/* Project & Ad Badges */}
      <div className="flex flex-wrap gap-2 text-xs">
        {row.project ? (
          <span className="inline-flex items-center gap-1 rounded-md border border-sky-500/20 bg-sky-500/10 px-2 py-0.5 font-medium text-sky-300">
            <Building2 size={11} /> {row.project.name}
          </span>
        ) : (
          <span className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-muted-foreground">
            General Requirement
          </span>
        )}
        {row.providerCampaignName && (
          <span className="rounded-md border border-blue-500/20 bg-blue-500/10 px-2 py-0.5 text-blue-300 font-medium">
            {row.providerCampaignName}
          </span>
        )}
        {row.budgetRange && (
          <span className="text-emerald-400 font-medium">Budget: {row.budgetRange}</span>
        )}
      </div>

      {/* Requirement Details */}
      <p className="text-xs text-muted-foreground">
        {[row.propertyType, row.preferredLocation, row.requirement].filter(Boolean).join(" · ") || "No additional requirements."}
      </p>

      {/* Status & Quick Actions */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/5 pt-3">
        <select
          value={row.status}
          onChange={(e) => onStatus(e.target.value as Status)}
          className={`rounded-lg border px-2 py-1 text-xs font-medium outline-none ${statusItem(row.status).tone}`}
        >
          {STATUSES.map((item) => (
            <option key={item.value} value={item.value} className="bg-background text-foreground">
              {item.label}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-1.5">
          <a
            href={`https://wa.me/91${row.phone}?text=${encodeURIComponent(
              generateWhatsAppGreeting(row.fullName, row.project?.name)
            )}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-300"
          >
            <MessageCircle size={12} /> WhatsApp
          </a>
          <button
            onClick={onHistory}
            className="rounded-lg border border-white/15 px-2.5 py-1 text-xs hover:bg-white/5"
          >
            {expanded ? "Close" : "History"}
          </button>
        </div>
      </div>

      {expanded && <div className="border-t border-white/10 pt-3">{children}</div>}
    </article>
  );
}

function ActivityPanel({
  row,
  isAdmin,
  staff,
  activities,
  note,
  setNote,
  type,
  setType,
  onLog,
  onUpdate,
}: {
  row: Lead;
  isAdmin: boolean;
  staff: Staff[];
  activities: ActivityRow[];
  note: string;
  setNote: (value: string) => void;
  type: "CALL" | "WHATSAPP" | "NOTE";
  setType: (value: "CALL" | "WHATSAPP" | "NOTE") => void;
  onLog: () => void;
  onUpdate: (patch: Record<string, unknown>) => void;
}) {
  const [followUp, setFollowUp] = useState(dateTimeInputValue(row.nextFollowUpAt));
  const [assignee, setAssignee] = useState(row.assignedTo?._id ?? "");

  useEffect(() => {
    setFollowUp(dateTimeInputValue(row.nextFollowUpAt));
    setAssignee(row.assignedTo?._id ?? "");
  }, [row._id, row.nextFollowUpAt, row.assignedTo?._id]);

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(280px,1fr)_minmax(300px,1fr)]">
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Activity & Call History</h3>
        {activities.length ? (
          <ol className="max-h-52 space-y-2 overflow-y-auto pr-1">
            {activities.map((activity) => (
              <li key={activity._id} className="rounded-lg border border-white/10 bg-white/[0.015] p-2.5">
                <p className="text-xs font-semibold">
                  {activity.type.replace(/_/g, " ")} · {activity.actor ?? "System"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground whitespace-pre-wrap">{activity.content}</p>
                <p className="mt-1 text-[10px] text-muted-foreground">{dateTimeLabel(activity.createdAt)}</p>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-xs text-muted-foreground">No follow-up notes recorded.</p>
        )}

        <div className="mt-3 flex gap-2">
          <select value={type} onChange={(e) => setType(e.target.value as typeof type)} className="rounded-lg border border-white/10 bg-background px-2 text-xs text-foreground">
            <option value="CALL">Call</option>
            <option value="WHATSAPP">WhatsApp</option>
            <option value="NOTE">Note</option>
          </select>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className={`${fieldClass} min-w-0`}
            placeholder="Outcome or next step…"
            maxLength={1200}
          />
          <button onClick={onLog} className="rounded-lg bg-sky-600 px-3 text-xs font-semibold text-white hover:bg-sky-500">
            Log
          </button>
        </div>
      </div>

      <div className="grid content-start gap-2 sm:grid-cols-2">
        <label className="text-xs text-muted-foreground">
          Next follow-up
          <input
            type="datetime-local"
            value={followUp}
            onChange={(e) => setFollowUp(e.target.value)}
            className={`${fieldClass} mt-1`}
          />
        </label>
        {isAdmin && (
          <label className="text-xs text-muted-foreground">
            Assigned to
            <select
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
              className={`${fieldClass} mt-1`}
            >
              <option value="">Unassigned</option>
              {staff.map((person) => (
                <option key={person._id} value={person._id}>{person.name}</option>
              ))}
            </select>
          </label>
        )}
        <button
          onClick={() =>
            onUpdate({
              nextFollowUpAt: followUp ? new Date(followUp).toISOString() : null,
              ...(isAdmin ? { assignedToId: assignee || null } : {}),
            })
          }
          className="rounded-lg border border-white/15 px-3 py-2 text-xs font-semibold hover:bg-white/5 sm:col-span-2"
        >
          Save follow-up reminder
        </button>
        <div className="text-[10px] text-muted-foreground sm:col-span-2 space-y-1">
          <p>Consent: {row.contactConsent ? row.consentBasis || "Confirmed" : "Not confirmed"}</p>
          {row.providerFormId && <p>Meta Form ID: {row.providerFormId}</p>}
          {row.providerAdName && <p>Meta Ad: {row.providerAdName}</p>}
          {row.providerCampaignName && <p>Meta Campaign: {row.providerCampaignName}</p>}
        </div>
      </div>
    </div>
  );
}

function BuyerInterestDetails({ data }: { data: BuyerInterests | null }) {
  if (!data) return <p className="text-sm text-muted-foreground">No interest details available.</p>;
  const currency = (value: number) =>
    new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value);
  const hasInterests = data.requirements.length + data.listingEnquiries.length + data.crmEnquiries.length > 0;
  if (!hasInterests) return <p className="text-sm text-muted-foreground">This buyer has no saved requirements or listing enquiries yet.</p>;

  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Broader requirements ({data.requirements.length})
        </h3>
        {data.requirements.length ? (
          <ul className="space-y-2">
            {data.requirements.map((item) => (
              <li key={item._id} className="rounded-xl border border-white/10 bg-background p-3">
                <p className="font-medium">{item.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">{item.propertyType} · {item.location}, {item.city}</p>
                <p className="mt-1 text-xs">
                  Budget: {item.minBudget == null ? "up to " : `${currency(item.minBudget)} – `}{currency(item.maxBudget)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{item.purpose || "Purpose not recorded"} · {item.timeline} · {item.status}</p>
                {item.details && <p className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">{item.details}</p>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">No broader requirements.</p>
        )}
      </section>
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          App listing enquiries ({data.listingEnquiries.length})
        </h3>
        {data.listingEnquiries.length ? (
          <ul className="space-y-2">
            {data.listingEnquiries.map((item) => (
              <li key={item._id} className="rounded-xl border border-white/10 bg-background p-3">
                <p className="font-medium">{item.projectName || "Project listing"}{item.projectCity ? ` · ${item.projectCity}` : ""}</p>
                <p className="mt-1 text-xs text-muted-foreground">{item.stage.replace(/_/g, " ")}{item.budgetRange ? ` · ${item.budgetRange}` : ""}</p>
                {(item.requirement || item.purchasePurpose || item.purchaseTimeline) && (
                  <p className="mt-1 text-xs text-muted-foreground">{[item.requirement, item.purchasePurpose, item.purchaseTimeline].filter(Boolean).join(" · ")}</p>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">No listing enquiries.</p>
        )}
      </section>
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Team / ad enquiries ({data.crmEnquiries.length})
        </h3>
        {data.crmEnquiries.length ? (
          <ul className="space-y-2">
            {data.crmEnquiries.map((item) => (
              <li key={item._id} className="rounded-xl border border-white/10 bg-background p-3">
                <p className="font-medium">{item.projectName || item.preferredLocation || item.propertyType || "General enquiry"}</p>
                <p className="mt-1 text-xs text-muted-foreground">{sourceLabel(item.source)} · {item.status}{item.budgetRange ? ` · ${item.budgetRange}` : ""}</p>
                {item.requirement && <p className="mt-1 text-xs text-muted-foreground">{item.requirement}</p>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">No team or ad enquiries.</p>
        )}
      </section>
    </div>
  );
}

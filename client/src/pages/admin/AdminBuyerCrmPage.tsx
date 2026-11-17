import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Activity, BarChart3, ChevronLeft, ChevronRight, Clock3, Headset, Loader2, MessageCircle, Phone, Plus, RefreshCw, Search, ShieldCheck, Users, X } from "lucide-react";
import { api } from "@/lib/api";

type Source = "META_AD" | "GOOGLE_AD" | "TELECALLER" | "WHATSAPP" | "WEBSITE" | "CUSTOMER_REFERRAL" | "OTHER";
type Status = "NEW" | "CONTACTED" | "QUALIFIED" | "SITE_VISIT_SCHEDULED" | "CONVERTED" | "LOST";
type Project = { _id: string; name: string; city: string; location: string };
type Staff = { _id: string; name: string; role: string };
type Lead = {
  _id: string; buyerUserId: string | null; fullName: string; phone: string; email: string | null;
  source: Source; status: Status; project: { _id: string; name: string; city: string } | null;
  propertyType: string | null; preferredLocation: string | null; budgetRange: string | null;
  purchasePurpose: string | null; purchaseTimeline: string | null; requirement: string | null;
  contactConsent: boolean; consentBasis: string | null; nextFollowUpAt: string | null;
  assignedTo: { _id: string; name: string } | null; createdAt: string;
};
type Buyer = { _id: string; name: string; email: string; phone: string | null; disabled: boolean; createdAt: string; requirements: number; platformLeads: number; crmLeads: number };
type BuyerInterests = {
  requirements: Array<{ _id: string; title: string; propertyType: string; city: string; location: string; minBudget: number | null; maxBudget: number; purpose: string | null; timeline: string; details: string | null; status: string; createdAt: string }>;
  listingEnquiries: Array<{ _id: string; projectId: string; projectName: string | null; projectCity: string | null; stage: string; requirement: string | null; budgetRange: string | null; purchasePurpose: string | null; purchaseTimeline: string | null; createdAt: string }>;
  crmEnquiries: Array<{ _id: string; source: string; status: string; projectName: string | null; preferredLocation: string | null; propertyType: string | null; budgetRange: string | null; requirement: string | null; contactConsent: boolean; createdAt: string }>;
};
type ActivityRow = { _id: string; type: string; content: string; createdAt: string; actor: string | null };
type Summary = { leads: { total: number; new: number; projectInterests: number; broaderRequirements: number; followUpsDue: number }; registeredBuyers: number; bySource: Array<{ source: string; total: number }>; metaAdsConfigured: boolean };

const SOURCES: Array<{ value: Source; label: string }> = [
  { value: "TELECALLER", label: "Telecalling" }, { value: "META_AD", label: "Facebook / Instagram ad" },
  { value: "GOOGLE_AD", label: "Google ad" }, { value: "WHATSAPP", label: "WhatsApp" },
  { value: "WEBSITE", label: "Website" }, { value: "CUSTOMER_REFERRAL", label: "Customer referral" }, { value: "OTHER", label: "Other" },
];
const STATUSES: Array<{ value: Status; label: string }> = [
  { value: "NEW", label: "New" }, { value: "CONTACTED", label: "Contacted" }, { value: "QUALIFIED", label: "Qualified" },
  { value: "SITE_VISIT_SCHEDULED", label: "Visit scheduled" }, { value: "CONVERTED", label: "Converted" }, { value: "LOST", label: "Lost" },
];
const sourceLabel = (source: string) => SOURCES.find((item) => item.value === source)?.label ?? source.replace(/_/g, " ");
const statusLabel = (status: string) => STATUSES.find((item) => item.value === status)?.label ?? status;
const dateLabel = (value: string) => new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
const dateTimeLabel = (value: string) => new Date(value).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
const dateTimeInputValue = (value: string | null) => {
  if (!value) return "";
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};
const fieldClass = "w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-sky-400/60";
const panelClass = "rounded-2xl border border-border bg-card";

const blankForm = () => ({
  fullName: "", phone: "", email: "", source: "TELECALLER" as Source, projectId: "", propertyType: "", preferredLocation: "",
  budgetRange: "", purchasePurpose: "", purchaseTimeline: "", requirement: "", nextFollowUpAt: "", assignedToId: "",
  contactConsent: false, consentBasis: "",
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
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(blankForm);
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [activities, setActivities] = useState<ActivityRow[]>([]);
  const [activityText, setActivityText] = useState("");
  const [activityType, setActivityType] = useState<"CALL" | "WHATSAPP" | "NOTE">("CALL");
  const [buyerQuery, setBuyerQuery] = useState("");
  const [buyerPage, setBuyerPage] = useState(1);
  const [buyerTotal, setBuyerTotal] = useState(0);
  const [expandedBuyerId, setExpandedBuyerId] = useState<string | null>(null);
  const [buyerInterests, setBuyerInterests] = useState<BuyerInterests | null>(null);
  const [loadingBuyerInterests, setLoadingBuyerInterests] = useState(false);

  const loadSetup = useCallback(async () => {
    try {
      const [summaryRes, projectsRes, staffRes] = await Promise.all([
        api.get("/buyer-crm/admin/summary"), api.get("/buyer-crm/admin/projects"), api.get("/buyer-crm/admin/staff"),
      ]);
      setSummary(summaryRes.data);
      setProjects(projectsRes.data.projects ?? []);
      setStaff(staffRes.data.staff ?? []);
    } catch (error: any) { toast.error(error?.response?.data?.error || "Could not load buyer CRM."); }
  }, []);

  const loadLeads = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get("/buyer-crm/admin/leads", {
        params: { page, limit: 30, q: query.trim() || undefined, status: status || undefined, source: source || undefined, projectId: projectId || undefined },
      });
      setRows(response.data.leads ?? []);
      setTotal(response.data.total ?? 0);
    } catch (error: any) { toast.error(error?.response?.data?.error || "Could not load buyer leads."); }
    finally { setLoading(false); }
  }, [page, query, status, source, projectId]);

  const loadBuyers = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get("/buyer-crm/admin/buyers", { params: { page: buyerPage, limit: 50, q: buyerQuery.trim() || undefined } });
      setBuyers(response.data.buyers ?? []);
      setBuyerTotal(response.data.total ?? 0);
    } catch (error: any) { toast.error(error?.response?.data?.error || "Could not load registered buyers."); }
    finally { setLoading(false); }
  }, [buyerPage, buyerQuery]);

  useEffect(() => { void loadSetup(); }, [loadSetup]);
  useEffect(() => { if (tab === "pipeline") void loadLeads(); else void loadBuyers(); }, [tab, loadLeads, loadBuyers]);
  useEffect(() => { setPage(1); }, [query, status, source, projectId]);
  useEffect(() => { setBuyerPage(1); }, [buyerQuery]);

  const maxPage = Math.max(1, Math.ceil(total / 30));
  const buyerMaxPage = Math.max(1, Math.ceil(buyerTotal / 50));
  const setFormField = <K extends keyof ReturnType<typeof blankForm>>(key: K, value: ReturnType<typeof blankForm>[K]) => setForm((current) => ({ ...current, [key]: value }));

  async function createLead(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.projectId && !form.requirement.trim() && !form.propertyType.trim() && !form.preferredLocation.trim() && !form.budgetRange.trim()) { toast.error("Choose a project or add details about the buyer's requirement."); return; }
    if (!form.contactConsent) { toast.error("Confirm the buyer agreed to be contacted."); return; }
    setSaving(true);
    try {
      await api.post("/buyer-crm/admin/leads", {
        ...form,
        email: form.email.trim() || undefined,
        projectId: form.projectId || undefined,
        nextFollowUpAt: form.nextFollowUpAt ? new Date(form.nextFollowUpAt).toISOString() : undefined,
        assignedToId: form.assignedToId || undefined,
      });
      toast.success("Buyer saved to the private pipeline.");
      setForm(blankForm());
      setShowCreate(false);
      setTab("pipeline");
      await Promise.all([loadLeads(), loadSetup()]);
    } catch (error: any) { toast.error(error?.response?.data?.error || "Could not save the buyer."); }
    finally { setSaving(false); }
  }

  async function updateLead(id: string, patch: Record<string, unknown>) {
    try {
      await api.patch(`/buyer-crm/admin/leads/${id}`, patch);
      await Promise.all([loadLeads(), loadSetup()]);
    } catch (error: any) { toast.error(error?.response?.data?.error || "Could not update this buyer lead."); }
  }

  async function toggleHistory(id: string) {
    if (expandedId === id) { setExpandedId(null); return; }
    setExpandedId(id);
    setActivityText("");
    try {
      const response = await api.get(`/buyer-crm/admin/leads/${id}/activities`);
      setActivities(response.data.activities ?? []);
    } catch { toast.error("Could not load the buyer history."); }
  }

  async function toggleBuyerInterests(id: string) {
    if (expandedBuyerId === id) { setExpandedBuyerId(null); return; }
    setExpandedBuyerId(id);
    setBuyerInterests(null);
    setLoadingBuyerInterests(true);
    try {
      const response = await api.get(`/buyer-crm/admin/buyers/${id}/interests`);
      setBuyerInterests(response.data);
    } catch (error: any) { toast.error(error?.response?.data?.error || "Could not load this buyer's interests."); }
    finally { setLoadingBuyerInterests(false); }
  }

  async function logActivity(id: string) {
    if (activityText.trim().length < 2) { toast.error("Add a short call or conversation note."); return; }
    try {
      await api.post(`/buyer-crm/admin/leads/${id}/activities`, { type: activityType, content: activityText.trim() });
      setActivityText("");
      const response = await api.get(`/buyer-crm/admin/leads/${id}/activities`);
      setActivities(response.data.activities ?? []);
      await loadLeads();
    } catch (error: any) { toast.error(error?.response?.data?.error || "Could not add the activity."); }
  }

  const sourceCounts = useMemo(() => new Map((summary?.bySource ?? []).map((row) => [row.source, row.total])), [summary]);
  const crm = summary?.leads;

  return (
    <main className="buyer-crm min-h-screen space-y-5 bg-background p-4 text-foreground sm:p-6 md:p-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="mb-1 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.2em] text-sky-300"><Headset size={14} /> Buyer operations</p>
          <h1 className="font-display text-2xl font-semibold sm:text-3xl">Buyer CRM</h1>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { void Promise.all([loadSetup(), tab === "pipeline" ? loadLeads() : loadBuyers()]); }} className="inline-flex items-center gap-2 rounded-xl border border-white/15 px-3 py-2 text-sm hover:bg-white/5"><RefreshCw size={14} /> Refresh</button>
          <button onClick={() => setShowCreate((open) => !open)} className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500"><Plus size={15} /> Add buyer</button>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Metric label="Registered buyers" value={summary?.registeredBuyers} hint="Private app accounts" icon={<Users size={16} />} />
        <Metric label="Buyer leads" value={crm?.total} hint="Ad + team enquiries" icon={<Activity size={16} />} />
        <Metric label="New to contact" value={crm?.new} hint="Unworked enquiries" icon={<Clock3 size={16} />} />
        <Metric label="Project interest" value={crm?.projectInterests} hint="Linked to a listing" icon={<BarChart3 size={16} />} />
        <Metric label="Follow-ups due" value={crm?.followUpsDue} hint={`${crm?.broaderRequirements ?? 0} broader needs`} icon={<MessageCircle size={16} />} />
      </section>

      <section className={`${panelClass} flex flex-wrap items-center justify-between gap-3 p-4`}>
        <div className="flex items-start gap-3">
          <span className={`mt-0.5 grid size-9 place-items-center rounded-xl ${summary?.metaAdsConfigured ? "bg-emerald-500/10 text-emerald-300" : "bg-amber-400/10 text-amber-300"}`}><ShieldCheck size={18} /></span>
          <div>
            <p className="font-semibold">Meta lead ads <span className={`ml-2 rounded-full px-2 py-0.5 text-[10px] ${summary?.metaAdsConfigured ? "bg-emerald-500/10 text-emerald-300" : "bg-amber-400/10 text-amber-300"}`}>{summary?.metaAdsConfigured ? "Credentials configured" : "Setup required"}</span></p>
            <p className="mt-1 text-xs text-muted-foreground">{summary?.metaAdsConfigured ? "Webhook endpoint: /api/webhooks/meta-leads. New lead forms will appear in this inbox." : "Connect the Facebook Page Lead Ads webhook and add its credentials on the API host to fetch new leads automatically."}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
          {SOURCES.map((item) => sourceCounts.get(item.value) ? <span key={item.value} className="rounded-full border border-white/10 px-2.5 py-1">{item.label}: {sourceCounts.get(item.value)}</span> : null)}
        </div>
      </section>

      {showCreate && <section className={`${panelClass} p-4 sm:p-5`}>
        <div className="mb-4 flex items-start justify-between gap-3"><div><h2 className="font-semibold">Add a buyer enquiry</h2><p className="mt-1 text-xs text-muted-foreground">Use for calls, WhatsApp, or a lead already collected from another ad source.</p></div><button onClick={() => setShowCreate(false)} aria-label="Close form" className="rounded-full border border-white/15 p-1.5"><X size={15} /></button></div>
        <form onSubmit={(event) => void createLead(event)} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <label className="text-xs text-muted-foreground">Buyer name<input required minLength={2} maxLength={100} value={form.fullName} onChange={(e) => setFormField("fullName", e.target.value)} className={`${fieldClass} mt-1`} placeholder="Full name" /></label>
          <label className="text-xs text-muted-foreground">Mobile<input required value={form.phone} onChange={(e) => setFormField("phone", e.target.value)} className={`${fieldClass} mt-1`} placeholder="10 digit mobile" inputMode="tel" /></label>
          <label className="text-xs text-muted-foreground">Email (optional)<input type="email" value={form.email} onChange={(e) => setFormField("email", e.target.value)} className={`${fieldClass} mt-1`} placeholder="name@example.com" /></label>
          <label className="text-xs text-muted-foreground">Lead source<select value={form.source} onChange={(e) => setFormField("source", e.target.value as Source)} className={`${fieldClass} mt-1`}>{SOURCES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          <label className="text-xs text-muted-foreground">Interested project (optional)<select value={form.projectId} onChange={(e) => setFormField("projectId", e.target.value)} className={`${fieldClass} mt-1`}><option value="">No specific project</option>{projects.map((project) => <option key={project._id} value={project._id}>{project.name} · {project.city}</option>)}</select></label>
          <label className="text-xs text-muted-foreground">Property type<input value={form.propertyType} onChange={(e) => setFormField("propertyType", e.target.value)} className={`${fieldClass} mt-1`} placeholder="Plot, apartment, villa…" /></label>
          <label className="text-xs text-muted-foreground">Preferred city / area<input value={form.preferredLocation} onChange={(e) => setFormField("preferredLocation", e.target.value)} className={`${fieldClass} mt-1`} placeholder="City or locality" /></label>
          <label className="text-xs text-muted-foreground">Budget range<input value={form.budgetRange} onChange={(e) => setFormField("budgetRange", e.target.value)} className={`${fieldClass} mt-1`} placeholder="₹30–40 lakh" /></label>
          <label className="text-xs text-muted-foreground">Purpose<select value={form.purchasePurpose} onChange={(e) => setFormField("purchasePurpose", e.target.value)} className={`${fieldClass} mt-1`}><option value="">Not recorded</option><option value="SELF_USE">Own use</option><option value="INVESTMENT">Investment</option><option value="UNDECIDED">Undecided</option></select></label>
          <label className="text-xs text-muted-foreground">Buying timeline<select value={form.purchaseTimeline} onChange={(e) => setFormField("purchaseTimeline", e.target.value)} className={`${fieldClass} mt-1`}><option value="">Not recorded</option><option value="IMMEDIATE">Immediately</option><option value="WITHIN_3_MONTHS">Within 3 months</option><option value="3_TO_6_MONTHS">3–6 months</option><option value="6_TO_12_MONTHS">6–12 months</option><option value="MORE_THAN_12_MONTHS">After 12 months</option><option value="NOT_DECIDED">Not decided</option></select></label>
          <label className="text-xs text-muted-foreground">Assign to<select value={form.assignedToId} onChange={(e) => setFormField("assignedToId", e.target.value)} className={`${fieldClass} mt-1`}><option value="">Unassigned</option>{staff.map((person) => <option key={person._id} value={person._id}>{person.name} · {person.role}</option>)}</select></label>
          <label className="text-xs text-muted-foreground">Next follow-up<input type="datetime-local" value={form.nextFollowUpAt} onChange={(e) => setFormField("nextFollowUpAt", e.target.value)} className={`${fieldClass} mt-1`} /></label>
          <label className="text-xs text-muted-foreground sm:col-span-2 xl:col-span-4">Requirement / call notes<textarea maxLength={1200} value={form.requirement} onChange={(e) => setFormField("requirement", e.target.value)} rows={2} className={`${fieldClass} mt-1 resize-y`} placeholder="What does this buyer need? For a general requirement, describe the property, locality, or budget." /></label>
          <div className="sm:col-span-2 xl:col-span-4 rounded-xl border border-amber-400/20 bg-amber-400/[0.04] p-3">
            <label className="flex items-start gap-2 text-xs"><input type="checkbox" checked={form.contactConsent} onChange={(e) => setFormField("contactConsent", e.target.checked)} className="mt-0.5" /><span><strong className="text-foreground">The buyer agreed to be contacted and to share these details with the Truvi team.</strong><span className="mt-0.5 block text-muted-foreground">Record how permission was given. Ad leads without explicit form consent are saved but remain marked as not contactable until permission is confirmed.</span></span></label>
            <input required minLength={4} maxLength={300} value={form.consentBasis} onChange={(e) => setFormField("consentBasis", e.target.value)} className={`${fieldClass} mt-2`} placeholder="e.g. Verbal permission during call on 17 Nov" />
          </div>
          <div className="flex justify-end gap-2 sm:col-span-2 xl:col-span-4"><button type="button" onClick={() => setShowCreate(false)} className="rounded-xl border border-white/15 px-4 py-2 text-sm">Cancel</button><button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Save buyer</button></div>
        </form>
      </section>}

      <nav className="flex gap-2 border-b border-white/10">
        <button onClick={() => setTab("pipeline")} className={`border-b-2 px-3 py-2 text-sm font-semibold ${tab === "pipeline" ? "border-sky-400 text-sky-300" : "border-transparent text-muted-foreground"}`}>Lead pipeline ({crm?.total ?? "—"})</button>
        <button onClick={() => setTab("buyers")} className={`border-b-2 px-3 py-2 text-sm font-semibold ${tab === "buyers" ? "border-sky-400 text-sky-300" : "border-transparent text-muted-foreground"}`}>Registered buyers ({summary?.registeredBuyers ?? "—"})</button>
      </nav>

      {tab === "pipeline" ? <>
        <section className={`${panelClass} grid gap-2 p-3 sm:grid-cols-2 xl:grid-cols-[minmax(220px,1fr)_repeat(3,minmax(150px,210px))]`}>
          <div className="relative"><Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><input value={query} onChange={(e) => setQuery(e.target.value)} className={`${fieldClass} pl-9`} placeholder="Search name, mobile, email, need…" /></div>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={fieldClass}><option value="">All statuses</option>{STATUSES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
          <select value={source} onChange={(e) => setSource(e.target.value)} className={fieldClass}><option value="">All sources</option>{SOURCES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className={fieldClass}><option value="">All interests</option><option value="GENERAL">Broader requirements</option>{projects.map((project) => <option key={project._id} value={project._id}>{project.name}</option>)}</select>
        </section>

        {loading ? <Loading /> : rows.length === 0 ? <div className={`${panelClass} p-10 text-center text-sm text-muted-foreground`}>No buyer leads match these filters. Add a call lead or connect Meta Lead Ads to start capturing enquiries here.</div> : <>
          <section className="space-y-2 lg:hidden">{rows.map((row) => <LeadCard key={row._id} row={row} expanded={expandedId === row._id} onStatus={(value) => void updateLead(row._id, { status: value })} onHistory={() => void toggleHistory(row._id)} onCall={() => { window.location.href = `tel:${row.phone}`; }}>{expandedId === row._id && <ActivityPanel row={row} staff={staff} activities={activities} note={activityText} setNote={setActivityText} type={activityType} setType={setActivityType} onLog={() => void logActivity(row._id)} onUpdate={(patch) => void updateLead(row._id, patch)} />}</LeadCard>)}</section>
          <section className={`${panelClass} hidden overflow-x-auto lg:block`}>
            <table className="w-full min-w-[1100px] text-left text-sm">
              <thead className="border-b border-white/10 text-[11px] uppercase tracking-wide text-muted-foreground"><tr><th className="p-3">Buyer</th><th className="p-3">Source</th><th className="p-3">Interest / requirement</th><th className="p-3">Consent</th><th className="p-3">Status</th><th className="p-3">Follow-up</th><th className="p-3">History</th></tr></thead>
              <tbody className="divide-y divide-border">{rows.map((row) => <Fragment key={row._id}>
                <tr className="align-top hover:bg-muted/60">
                  <td className="p-3"><p className="font-semibold">{row.fullName}{row.buyerUserId && <span className="ml-1.5 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-300">App buyer</span>}</p><p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">{row.contactConsent ? <a href={`tel:${row.phone}`} className="inline-flex items-center gap-1 text-sky-300 hover:underline"><Phone size={11} />{row.phone}</a> : <span>{row.phone} · no contact permission</span>}</p>{row.email && <p className="mt-0.5 text-xs text-muted-foreground">{row.email}</p>}</td>
                  <td className="p-3"><p>{sourceLabel(row.source)}</p><p className="mt-1 text-[11px] text-muted-foreground">{dateLabel(row.createdAt)}</p></td>
                  <td className="max-w-[310px] p-3"><p className="font-medium">{row.project?.name ?? "Broader requirement"}</p><p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{[row.requirement, row.preferredLocation, row.propertyType, row.budgetRange].filter(Boolean).join(" · ") || "No details yet"}</p>{row.assignedTo && <p className="mt-1 text-[10px] text-muted-foreground">Assigned: {row.assignedTo.name}</p>}</td>
                  <td className="p-3"><span className={`rounded-full px-2 py-1 text-[10px] ${row.contactConsent ? "bg-emerald-500/10 text-emerald-300" : "bg-amber-400/10 text-amber-300"}`}>{row.contactConsent ? "Contact allowed" : "Permission needed"}</span></td>
                  <td className="p-3"><select aria-label={`Status for ${row.fullName}`} value={row.status} onChange={(e) => void updateLead(row._id, { status: e.target.value })} className="rounded-lg border border-white/15 bg-background px-2 py-1.5 text-xs text-foreground">{STATUSES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></td>
                  <td className="p-3 text-xs text-muted-foreground">{row.nextFollowUpAt ? dateTimeLabel(row.nextFollowUpAt) : "Not set"}</td>
                  <td className="p-3"><button onClick={() => void toggleHistory(row._id)} className="rounded-lg border border-white/15 px-2.5 py-1.5 text-xs hover:bg-white/5">{expandedId === row._id ? "Close" : "Open"}</button></td>
                </tr>
                {expandedId === row._id && <tr key={`${row._id}-history`}><td colSpan={7} className="bg-white/[.018] p-4"><ActivityPanel row={row} staff={staff} activities={activities} note={activityText} setNote={setActivityText} type={activityType} setType={setActivityType} onLog={() => void logActivity(row._id)} onUpdate={(patch) => void updateLead(row._id, patch)} /></td></tr>}
              </Fragment>)}</tbody>
            </table>
          </section>
          <Pager page={page} totalPages={maxPage} total={total} onPage={setPage} />
        </>}
      </> : <>
        <div className="relative max-w-xl"><Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><input value={buyerQuery} onChange={(e) => setBuyerQuery(e.target.value)} className={`${fieldClass} pl-9`} placeholder="Search registered buyer name, mobile, email…" /></div>
        {loading ? <Loading /> : buyers.length === 0 ? <div className={`${panelClass} p-10 text-center text-sm text-muted-foreground`}>No registered buyer accounts found.</div> : <>
          <section className={`${panelClass} overflow-x-auto`}><table className="w-full min-w-[900px] text-left text-sm"><thead className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground"><tr><th className="p-3">Buyer</th><th className="p-3">Registered</th><th className="p-3">App requirements</th><th className="p-3">App listing enquiries</th><th className="p-3">CRM enquiries</th><th className="p-3">Account</th><th className="p-3">Interest details</th></tr></thead><tbody className="divide-y divide-border">{buyers.map((buyer) => <Fragment key={buyer._id}><tr className="hover:bg-muted/60"><td className="p-3"><p className="font-medium">{buyer.name}</p><p className="mt-0.5 text-xs text-muted-foreground">{buyer.email}{buyer.phone ? ` · ${buyer.phone}` : ""}</p></td><td className="p-3 text-xs text-muted-foreground">{dateLabel(buyer.createdAt)}</td><td className="p-3">{buyer.requirements}</td><td className="p-3">{buyer.platformLeads}</td><td className="p-3">{buyer.crmLeads}</td><td className="p-3"><span className={`rounded-full px-2 py-1 text-[10px] ${buyer.disabled ? "bg-rose-500/10 text-rose-300" : "bg-emerald-500/10 text-emerald-300"}`}>{buyer.disabled ? "Disabled" : "Active"}</span></td><td className="p-3"><button onClick={() => void toggleBuyerInterests(buyer._id)} className="rounded-lg border border-border px-2.5 py-1.5 text-xs hover:bg-muted">{expandedBuyerId === buyer._id ? "Hide details" : "View details"}</button></td></tr>{expandedBuyerId === buyer._id && <tr><td colSpan={7} className="bg-muted/40 p-4">{loadingBuyerInterests ? <Loading /> : <BuyerInterestDetails data={buyerInterests} />}</td></tr>}</Fragment>)}</tbody></table></section>
          <Pager page={buyerPage} totalPages={buyerMaxPage} total={buyerTotal} onPage={setBuyerPage} />
        </>}
      </>}
    </main>
  );
}

function Metric({ label, value, hint, icon }: { label: string; value?: number; hint: string; icon: React.ReactNode }) {
  return <div className={`${panelClass} p-3.5`}><div className="flex items-center justify-between gap-2 text-xs text-muted-foreground"><span>{label}</span><span className="text-sky-300">{icon}</span></div><p className="mt-2 text-2xl font-semibold text-foreground">{value ?? "—"}</p><p className="mt-0.5 text-[10px] text-muted-foreground">{hint}</p></div>;
}

function Loading() { return <p className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground"><Loader2 size={15} className="animate-spin" /> Loading…</p>; }

function Pager({ page, totalPages, total, onPage }: { page: number; totalPages: number; total: number; onPage: (page: number) => void }) {
  return <div className="flex items-center justify-between text-xs text-muted-foreground"><span>{total.toLocaleString("en-IN")} records</span><div className="flex items-center gap-2"><button disabled={page <= 1} onClick={() => onPage(page - 1)} className="grid size-8 place-items-center rounded-lg border border-white/15 disabled:opacity-35" aria-label="Previous page"><ChevronLeft size={15} /></button><span>Page {page} of {totalPages}</span><button disabled={page >= totalPages} onClick={() => onPage(page + 1)} className="grid size-8 place-items-center rounded-lg border border-white/15 disabled:opacity-35" aria-label="Next page"><ChevronRight size={15} /></button></div></div>;
}

function BuyerInterestDetails({ data }: { data: BuyerInterests | null }) {
  if (!data) return <p className="text-sm text-muted-foreground">No interest details are available.</p>;
  const currency = (value: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value);
  const hasInterests = data.requirements.length + data.listingEnquiries.length + data.crmEnquiries.length > 0;
  if (!hasInterests) return <p className="text-sm text-muted-foreground">This buyer has no saved requirements or listing enquiries yet.</p>;
  return <div className="grid gap-4 xl:grid-cols-3">
    <section><h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Broader requirements ({data.requirements.length})</h3>{data.requirements.length ? <ul className="space-y-2">{data.requirements.map((item) => <li key={item._id} className="rounded-xl border border-border bg-background p-3"><p className="font-medium">{item.title}</p><p className="mt-1 text-xs text-muted-foreground">{item.propertyType} · {item.location}, {item.city}</p><p className="mt-1 text-xs">Budget: {item.minBudget == null ? "up to " : `${currency(item.minBudget)} – `}{currency(item.maxBudget)}</p><p className="mt-1 text-xs text-muted-foreground">{item.purpose || "Purpose not recorded"} · {item.timeline} · {item.status}</p>{item.details && <p className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">{item.details}</p>}</li>)}</ul> : <p className="text-xs text-muted-foreground">No broader requirements.</p>}</section>
    <section><h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">App listing enquiries ({data.listingEnquiries.length})</h3>{data.listingEnquiries.length ? <ul className="space-y-2">{data.listingEnquiries.map((item) => <li key={item._id} className="rounded-xl border border-border bg-background p-3"><p className="font-medium">{item.projectName || "Project listing"}{item.projectCity ? ` · ${item.projectCity}` : ""}</p><p className="mt-1 text-xs text-muted-foreground">{item.stage.replace(/_/g, " ")}{item.budgetRange ? ` · ${item.budgetRange}` : ""}</p>{(item.requirement || item.purchasePurpose || item.purchaseTimeline) && <p className="mt-1 text-xs text-muted-foreground">{[item.requirement, item.purchasePurpose, item.purchaseTimeline].filter(Boolean).join(" · ")}</p>}</li>)}</ul> : <p className="text-xs text-muted-foreground">No listing enquiries.</p>}</section>
    <section><h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Team / ad enquiries ({data.crmEnquiries.length})</h3>{data.crmEnquiries.length ? <ul className="space-y-2">{data.crmEnquiries.map((item) => <li key={item._id} className="rounded-xl border border-border bg-background p-3"><p className="font-medium">{item.projectName || item.preferredLocation || item.propertyType || "General enquiry"}</p><p className="mt-1 text-xs text-muted-foreground">{sourceLabel(item.source)} · {statusLabel(item.status)}{item.budgetRange ? ` · ${item.budgetRange}` : ""}</p>{item.requirement && <p className="mt-1 text-xs text-muted-foreground">{item.requirement}</p>}</li>)}</ul> : <p className="text-xs text-muted-foreground">No team or ad enquiries.</p>}</section>
  </div>;
}

function LeadCard({ row, expanded, onStatus, onHistory, onCall, children }: { row: Lead; expanded: boolean; onStatus: (status: Status) => void; onHistory: () => void; onCall: () => void; children?: React.ReactNode }) {
  return <article className={`${panelClass} p-3.5`}>
    <div className="flex items-start justify-between gap-2"><div><p className="font-semibold">{row.fullName}</p>{row.contactConsent ? <button onClick={onCall} className="mt-1 inline-flex items-center gap-1 text-xs text-sky-300"><Phone size={12} />{row.phone}</button> : <p className="mt-1 text-xs text-muted-foreground">{row.phone} · permission needed</p>}</div><span className="rounded-full bg-sky-400/10 px-2 py-1 text-[10px] text-sky-300">{sourceLabel(row.source)}</span></div>
    <p className="mt-3 text-sm font-medium">{row.project?.name ?? "Broader requirement"}</p><p className="mt-1 text-xs text-muted-foreground">{[row.requirement, row.preferredLocation, row.propertyType, row.budgetRange].filter(Boolean).join(" · ") || "No details yet"}</p>
    <div className="mt-3 flex items-center justify-between gap-2"><select aria-label={`Status for ${row.fullName}`} value={row.status} onChange={(e) => onStatus(e.target.value as Status)} className="min-w-0 rounded-lg border border-white/15 bg-background px-2 py-1.5 text-xs text-foreground">{STATUSES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select><button onClick={onHistory} className="rounded-lg border border-white/15 px-2.5 py-1.5 text-xs">{expanded ? "Close history" : "History / follow-up"}</button></div>
    {expanded && <div className="mt-4 border-t border-border pt-4">{children}</div>}
  </article>;
}

function ActivityPanel({ row, staff, activities, note, setNote, type, setType, onLog, onUpdate }: {
  row: Lead; staff: Staff[]; activities: ActivityRow[]; note: string; setNote: (value: string) => void;
  type: "CALL" | "WHATSAPP" | "NOTE"; setType: (value: "CALL" | "WHATSAPP" | "NOTE") => void;
  onLog: () => void; onUpdate: (patch: Record<string, unknown>) => void;
}) {
  const [followUp, setFollowUp] = useState(dateTimeInputValue(row.nextFollowUpAt));
  const [assignee, setAssignee] = useState(row.assignedTo?._id ?? "");
  const [consentBasis, setConsentBasis] = useState(row.consentBasis ?? "");
  useEffect(() => { setFollowUp(dateTimeInputValue(row.nextFollowUpAt)); setAssignee(row.assignedTo?._id ?? ""); setConsentBasis(row.consentBasis ?? ""); }, [row._id, row.nextFollowUpAt, row.assignedTo?._id, row.consentBasis]);
  return <div className="grid gap-4 xl:grid-cols-[minmax(280px,1fr)_minmax(300px,1fr)]">
    <div><h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Contact history</h3>{activities.length ? <ol className="max-h-52 space-y-2 overflow-y-auto">{activities.map((activity) => <li key={activity._id} className="rounded-lg border border-white/10 p-2.5"><p className="text-xs font-semibold">{activity.type.replace(/_/g, " ")} · {activity.actor ?? "System"}</p><p className="mt-1 text-xs text-muted-foreground">{activity.content}</p><p className="mt-1 text-[10px] text-muted-foreground">{dateTimeLabel(activity.createdAt)}</p></li>)}</ol> : <p className="text-xs text-muted-foreground">No follow-up notes recorded.</p>}
      {row.contactConsent ? <div className="mt-3 flex gap-2"><select value={type} onChange={(e) => setType(e.target.value as typeof type)} className="rounded-lg border border-border bg-background px-2 text-xs text-foreground"><option value="CALL">Call</option><option value="WHATSAPP">WhatsApp</option><option value="NOTE">Note</option></select><input value={note} onChange={(e) => setNote(e.target.value)} className={`${fieldClass} min-w-0`} placeholder="Outcome or next step" maxLength={1200} /><button onClick={onLog} className="rounded-lg bg-sky-600 px-3 text-xs font-semibold text-white">Save</button></div> : <div className="mt-3 rounded-xl border border-amber-400/20 bg-amber-400/[0.04] p-3"><p className="text-xs text-amber-300">Contact is paused until the buyer's permission is confirmed.</p><input value={consentBasis} onChange={(e) => setConsentBasis(e.target.value)} maxLength={300} className={`${fieldClass} mt-2`} placeholder="Record how the buyer gave permission" /><button disabled={consentBasis.trim().length < 4} onClick={() => onUpdate({ contactConsent: true, consentBasis: consentBasis.trim() })} className="mt-2 rounded-lg bg-sky-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Record permission and enable contact</button></div>}</div>
    <div className="grid content-start gap-2 sm:grid-cols-2"><label className="text-xs text-muted-foreground">Next follow-up<input type="datetime-local" value={followUp} onChange={(e) => setFollowUp(e.target.value)} className={`${fieldClass} mt-1`} /></label><label className="text-xs text-muted-foreground">Assigned to<select value={assignee} onChange={(e) => setAssignee(e.target.value)} className={`${fieldClass} mt-1`}><option value="">Unassigned</option>{staff.map((person) => <option key={person._id} value={person._id}>{person.name}</option>)}</select></label><button onClick={() => onUpdate({ nextFollowUpAt: followUp ? new Date(followUp).toISOString() : null, assignedToId: assignee || null })} className="rounded-lg border border-white/15 px-3 py-2 text-xs font-semibold hover:bg-white/5 sm:col-span-2">Save follow-up & owner</button><p className="text-[10px] text-muted-foreground sm:col-span-2">Consent: {row.contactConsent ? row.consentBasis || "Recorded" : "Not recorded"}</p></div>
  </div>;
}

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Building2, Clock3, MapPin, Pencil, Plus, Search, X, CheckCircle2, IndianRupee, Ruler, MessageCircle, Send, Eye } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useAuthStore } from "@/store/authStore";

type RequirementStatus = "ACTIVE" | "CLOSED" | "UNDER_REVIEW" | "REJECTED" | "SPAM";
type PropertyType = "ANY" | "PLOTTED" | "RESIDENTIAL" | "APARTMENT" | "VILLA" | "COMMERCIAL" | "INDUSTRIAL" | "LAND" | "MIXED";
type ContactMethod = "PHONE" | "EMAIL" | "WHATSAPP" | "IN_APP";
type Visibility = "PRIVATE" | "TRUVI";
type Timeline = "IMMEDIATE" | "WITHIN_30_DAYS" | "WITHIN_3_MONTHS" | "WITHIN_6_MONTHS" | "FLEXIBLE";
type Purpose = "" | "INVESTMENT" | "SELF_USE" | "BUSINESS" | "OTHER";

interface PropertyRequirement {
  _id: string;
  title: string;
  propertyType: PropertyType;
  city: string;
  location: string;
  minBudget: number | null;
  maxBudget: number;
  minAreaSqft: number | null;
  maxAreaSqft: number | null;
  purpose: Exclude<Purpose, ""> | null;
  timeline: Timeline;
  details?: string | null;
  publicSummary?: string | null;
  preferredContactMethod: ContactMethod;
  visibility: Visibility;
  requirementKind?: "BUYER" | "CLIENT";
  clientName?: string | null;
  clientPhone?: string | null;
  clientEmail?: string | null;
  contactConsent: boolean;
  submittedByRole: string;
  status: RequirementStatus;
  createdAt: string;
  isOwn?: boolean;
}

interface RequirementResponse {
  id: string;
  message: string;
  status: "SENT" | "WITHDRAWN";
  createdAt: string;
  readAt: string | null;
  responderName: string;
  responderRole: string;
}

interface MatchRecord {
  match: { _id: string; createdAt: string };
  requirementTitle: string;
  project: {
    _id: string;
    name: string;
    city: string;
    location: string;
    projectType?: string | null;
    availabilityStatus?: string;
    [key: string]: unknown;
  };
}

interface RequirementForm {
  title: string;
  propertyType: PropertyType;
  city: string;
  location: string;
  minBudget: string;
  maxBudget: string;
  minAreaSqft: string;
  maxAreaSqft: string;
  purpose: Purpose;
  timeline: Timeline;
  details: string;
  publicSummary: string;
  preferredContactMethod: ContactMethod;
  visibility: Visibility;
  clientName: string;
  clientPhone: string;
  clientEmail: string;
  contactConsent: boolean;
}

const EMPTY_FORM: RequirementForm = {
  title: "",
  propertyType: "ANY",
  city: "",
  location: "",
  minBudget: "",
  maxBudget: "",
  minAreaSqft: "",
  maxAreaSqft: "",
  purpose: "",
  timeline: "WITHIN_30_DAYS",
  details: "",
  publicSummary: "",
  preferredContactMethod: "IN_APP",
  visibility: "TRUVI",
  clientName: "",
  clientPhone: "",
  clientEmail: "",
  contactConsent: false,
};

const PROPERTY_TYPES: { value: PropertyType; label: string }[] = [
  { value: "ANY", label: "Any property type" },
  { value: "PLOTTED", label: "Plot" },
  { value: "RESIDENTIAL", label: "Residential property" },
  { value: "APARTMENT", label: "Apartment / Flat" },
  { value: "VILLA", label: "Villa / Independent home" },
  { value: "COMMERCIAL", label: "Commercial" },
  { value: "INDUSTRIAL", label: "Industrial" },
  { value: "LAND", label: "Land" },
  { value: "MIXED", label: "Mixed use" },
];

const TIMELINES: { value: Timeline; label: string }[] = [
  { value: "IMMEDIATE", label: "Urgently / Immediately" },
  { value: "WITHIN_30_DAYS", label: "Within 30 days" },
  { value: "WITHIN_3_MONTHS", label: "Within 3 months" },
  { value: "WITHIN_6_MONTHS", label: "Within 6 months" },
  { value: "FLEXIBLE", label: "Flexible timeline" },
];

const formatMoney = (value: number | null | undefined) =>
  value == null
    ? null
    : new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value);

const labelForType = (value: string) =>
  PROPERTY_TYPES.find((item) => item.value === value)?.label ?? value.replace(/_/g, " ");

const labelForTimeline = (value: string) =>
  TIMELINES.find((item) => item.value === value)?.label ?? value.replace(/_/g, " ");

const roleLabel = (role: string) => ({
  BUYER: "Buyer",
  CP: "Channel Partner",
  DEVELOPER: "Developer",
  AMBASSADOR: "Ambassador",
  EMPLOYEE: "Employee",
}[role] ?? "Truvi user");

function budgetLabel(row: Pick<PropertyRequirement, "minBudget" | "maxBudget">) {
  const min = formatMoney(row.minBudget);
  const max = formatMoney(row.maxBudget);
  if (min && max) return `${min} – ${max}`;
  return max ? `Up to ${max}` : "Budget not provided";
}

export default function RequirementsPage() {
  const user = useAuthStore((state) => state.user);
  const isBuyer = user?.role === "BUYER";
  const [form, setForm] = useState<RequirementForm>({ ...EMPTY_FORM });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [mine, setMine] = useState<PropertyRequirement[]>([]);
  const [board, setBoard] = useState<Omit<PropertyRequirement, "details">[]>([]);
  const [matches, setMatches] = useState<MatchRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [boardType, setBoardType] = useState("ALL");
  const [boardCity, setBoardCity] = useState("");
  const [boardLocation, setBoardLocation] = useState("");
  const [boardBudgetMin, setBoardBudgetMin] = useState("");
  const [boardBudgetMax, setBoardBudgetMax] = useState("");
  const [boardTimeline, setBoardTimeline] = useState("ALL");
  const [boardStatus, setBoardStatus] = useState("ACTIVE");
  const [boardPage, setBoardPage] = useState(1);
  const [boardPagination, setBoardPagination] = useState({ page: 1, limit: 12, total: 0, totalPages: 0 });
  const [canRespondToRequirements, setCanRespondToRequirements] = useState(false);
  const [respondingTo, setRespondingTo] = useState<{ id: string; title: string } | null>(null);
  const [responseMessage, setResponseMessage] = useState("");
  const [submittingResponse, setSubmittingResponse] = useState(false);
  const [responsesByRequirement, setResponsesByRequirement] = useState<Record<string, RequirementResponse[]>>({});
  const [viewResponsesFor, setViewResponsesFor] = useState<string | null>(null);
  const [loadingResponsesFor, setLoadingResponsesFor] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [mineRes, boardRes, matchesRes] = await Promise.all([
        api.get("/requirements/mine"),
        api.get("/requirements/board", {
          params: {
            page: boardPage,
            limit: 12,
            q: search.trim() || undefined,
            propertyType: boardType !== "ALL" ? boardType : undefined,
            city: boardCity.trim() || undefined,
            location: boardLocation.trim() || undefined,
            budgetMin: boardBudgetMin ? Number(boardBudgetMin) : undefined,
            budgetMax: boardBudgetMax ? Number(boardBudgetMax) : undefined,
            timeline: boardTimeline !== "ALL" ? boardTimeline : undefined,
            status: boardStatus,
          },
        }),
        api.get("/requirements/matches"),
      ]);
      setMine((mineRes.data.requirements ?? []) as PropertyRequirement[]);
      setBoard((boardRes.data.requirements ?? []) as Omit<PropertyRequirement, "details">[]);
      setCanRespondToRequirements(boardRes.data.canRespond === true);
      setBoardPagination(boardRes.data.pagination ?? { page: 1, limit: 12, total: 0, totalPages: 0 });
      setMatches((matchesRes.data.matches ?? []) as MatchRecord[]);
    } catch (error: any) {
      toast.error(error?.response?.data?.error || "Could not load property requirements.");
    } finally {
      setLoading(false);
    }
  }, [boardPage, search, boardType, boardCity, boardLocation, boardBudgetMin, boardBudgetMax, boardTimeline, boardStatus]);

  useEffect(() => {
    void load();
  }, [load]);

  function changeForm<K extends keyof RequirementForm>(key: K, value: RequirementForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function resetForm() {
    setForm({ ...EMPTY_FORM });
    setEditingId(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.title.trim() || !form.city.trim() || !form.location.trim() || !form.minBudget || !form.maxBudget || Number(form.maxBudget) <= 0) {
      toast.error("Enter a requirement title, city, preferred location, minimum budget and maximum budget.");
      return;
    }
    if (user?.role !== "BUYER" && !form.contactConsent) {
      toast.error("Confirm that your client has consented before submitting this lead requirement.");
      return;
    }
    if (form.minBudget && Number(form.minBudget) > Number(form.maxBudget)) {
      toast.error("Minimum budget cannot exceed maximum budget.");
      return;
    }
    if (form.minAreaSqft && form.maxAreaSqft && Number(form.minAreaSqft) > Number(form.maxAreaSqft)) {
      toast.error("Minimum size cannot exceed maximum size.");
      return;
    }

    const payload = {
      title: form.title.trim(),
      propertyType: form.propertyType,
      city: form.city.trim(),
      location: form.location.trim(),
      minBudget: Number(form.minBudget),
      maxBudget: Number(form.maxBudget),
      minAreaSqft: form.minAreaSqft ? Number(form.minAreaSqft) : null,
      maxAreaSqft: form.maxAreaSqft ? Number(form.maxAreaSqft) : null,
      purpose: form.purpose || null,
      timeline: form.timeline,
      details: form.details.trim() || null,
      publicSummary: form.publicSummary.trim() || null,
      preferredContactMethod: form.preferredContactMethod,
      visibility: form.visibility,
      clientName: form.clientName.trim() || null,
      clientPhone: form.clientPhone.trim() || null,
      clientEmail: form.clientEmail.trim() || null,
      contactConsent: user?.role === "BUYER" ? false : form.contactConsent,
    };

    setSaving(true);
    try {
      if (editingId) {
        await api.patch(`/requirements/${editingId}`, payload);
        toast.success("Requirement updated.");
      } else {
        const response = await api.post("/requirements", payload);
        const reference = String(response.data.reference || response.data.requirement?._id || "");
        toast.success(reference
          ? `Requirement submitted. Reference: ${reference}`
          : "Requirement submitted successfully.");
      }
      resetForm();
      await load();
    } catch (error: any) {
      toast.error(error?.response?.data?.error || "Could not save the requirement.");
    } finally {
      setSaving(false);
    }
  }

  function editRequirement(row: PropertyRequirement) {
    setEditingId(row._id);
    setForm({
      title: row.title ?? "",
      propertyType: row.propertyType ?? "ANY",
      city: row.city ?? "",
      location: row.location ?? "",
      minBudget: row.minBudget == null ? "" : String(row.minBudget),
      maxBudget: String(row.maxBudget ?? ""),
      minAreaSqft: row.minAreaSqft == null ? "" : String(row.minAreaSqft),
      maxAreaSqft: row.maxAreaSqft == null ? "" : String(row.maxAreaSqft),
      purpose: row.purpose ?? "",
      timeline: row.timeline ?? "FLEXIBLE",
      details: row.details ?? "",
      publicSummary: row.publicSummary ?? "",
      preferredContactMethod: row.preferredContactMethod ?? "IN_APP",
      visibility: row.visibility ?? "TRUVI",
      clientName: row.clientName ?? "",
      clientPhone: row.clientPhone ?? "",
      clientEmail: row.clientEmail ?? "",
      contactConsent: row.contactConsent ?? false,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function submitRequirementResponse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!respondingTo || responseMessage.trim().length < 5) {
      toast.error("Please enter a response of at least 5 characters.");
      return;
    }
    setSubmittingResponse(true);
    try {
      await api.post(`/requirements/${respondingTo.id}/responses`, { message: responseMessage.trim() });
      toast.success("Your response was sent privately to the requirement owner.");
      setRespondingTo(null);
      setResponseMessage("");
      await load();
    } catch (error: any) {
      toast.error(error?.response?.data?.error || "Could not send your response.");
    } finally {
      setSubmittingResponse(false);
    }
  }

  async function toggleResponses(requirementId: string) {
    if (viewResponsesFor === requirementId) {
      setViewResponsesFor(null);
      return;
    }
    setViewResponsesFor(requirementId);
    if (responsesByRequirement[requirementId]) return;
    setLoadingResponsesFor(requirementId);
    try {
      const result = await api.get(`/requirements/mine/${requirementId}/responses`);
      setResponsesByRequirement((current) => ({
        ...current,
        [requirementId]: (result.data.responses ?? []) as RequirementResponse[],
      }));
    } catch (error: any) {
      setViewResponsesFor(null);
      toast.error(error?.response?.data?.error || "Could not load private requirement responses.");
    } finally {
      setLoadingResponsesFor(null);
    }
  }

  async function setStatus(row: PropertyRequirement, status: "ACTIVE" | "CLOSED") {
    try {
      await api.patch(`/requirements/${row._id}`, { status });
      toast.success(status === "CLOSED" ? "Requirement closed." : "Requirement reopened.");
      await load();
    } catch (error: any) {
      toast.error(error?.response?.data?.error || "Could not update requirement status.");
    }
  }

  const filteredBoard = board;

  const dashboardHref = user?.role === "BUYER"
    ? "/buyer/dashboard"
    : user?.role === "CP"
      ? "/cp/dashboard"
      : user?.role === "DEVELOPER"
        ? "/developer/dashboard"
        : user?.role === "AMBASSADOR"
          ? "/ambassador/dashboard"
          : user?.role === "EMPLOYEE"
            ? "/employee/dashboard"
            : "/admin";

  return (
    <main className="min-h-screen px-4 py-7 pb-28 text-white sm:px-6 md:px-10">
      <div className="mx-auto max-w-7xl space-y-7">
        <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-300">Truvi property network</p>
            <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">
              {isBuyer ? "Share Your Requirement" : "Share Your Lead Requirement"}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              Need a property that is not listed yet? Share the location, budget and timeline. Your requirement stays on the noticeboard until it is fulfilled or closed, and matching live projects appear here automatically.
            </p>
          </div>
          <Link to={dashboardHref} className="text-sm text-teal-300 hover:text-teal-200">← Back to dashboard</Link>
        </header>

        <section className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(330px,0.9fr)]">
          <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4 shadow-xl shadow-black/10 sm:p-6">
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">{editingId ? "Edit your requirement" : "Tell us what you need"}</h2>
                <p className="mt-1 text-sm text-muted-foreground">You can submit even when no matching property is listed on Truvi.</p>
              </div>
              {editingId && (
                <Button type="button" variant="ghost" size="sm" onClick={resetForm}><X size={15} /> Cancel edit</Button>
              )}
            </div>

            <form onSubmit={submit} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm">
                  <span className="mb-1.5 block text-white/80">Requirement title</span>
                  <input required value={form.title} onChange={(event) => changeForm("title", event.target.value)} maxLength={120} placeholder="e.g. Urgent residential plot requirement" className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 outline-none transition focus:border-teal-400/70" />
                </label>
                <label className="block text-sm">
                  <span className="mb-1.5 block text-white/80">Property type</span>
                  <select value={form.propertyType} onChange={(event) => changeForm("propertyType", event.target.value as PropertyType)} className="w-full rounded-xl border border-white/10 bg-[#111820] px-3 py-2.5 outline-none focus:border-teal-400/70">
                    {PROPERTY_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                  </select>
                </label>
                <label className="block text-sm">
                  <span className="mb-1.5 block text-white/80">City</span>
                  <input required value={form.city} onChange={(event) => changeForm("city", event.target.value)} maxLength={100} placeholder="e.g. Lucknow" className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 outline-none focus:border-teal-400/70" />
                </label>
                <label className="block text-sm">
                  <span className="mb-1.5 block text-white/80">Preferred location / locality</span>
                  <input required value={form.location} onChange={(event) => changeForm("location", event.target.value)} maxLength={160} placeholder="e.g. Sultanpur Road" className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 outline-none focus:border-teal-400/70" />
                </label>
                <label className="block text-sm">
                  <span className="mb-1.5 block text-white/80">Minimum budget (₹)</span>
                  <input required type="number" min="0" step="1000" value={form.minBudget} onChange={(event) => changeForm("minBudget", event.target.value)} placeholder="e.g. 2500000" className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 outline-none focus:border-teal-400/70" />
                </label>
                <label className="block text-sm">
                  <span className="mb-1.5 block text-white/80">Maximum budget (₹)</span>
                  <input required type="number" min="1" step="1000" value={form.maxBudget} onChange={(event) => changeForm("maxBudget", event.target.value)} placeholder="e.g. 4000000" className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 outline-none focus:border-teal-400/70" />
                </label>
                <label className="block text-sm">
                  <span className="mb-1.5 block text-white/80">Minimum size in sq. ft. (optional)</span>
                  <input type="number" min="1" value={form.minAreaSqft} onChange={(event) => changeForm("minAreaSqft", event.target.value)} placeholder="Any size" className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 outline-none focus:border-teal-400/70" />
                </label>
                <label className="block text-sm">
                  <span className="mb-1.5 block text-white/80">Maximum size in sq. ft. (optional)</span>
                  <input type="number" min="1" value={form.maxAreaSqft} onChange={(event) => changeForm("maxAreaSqft", event.target.value)} placeholder="Any size" className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 outline-none focus:border-teal-400/70" />
                </label>
                <label className="block text-sm">
                  <span className="mb-1.5 block text-white/80">Purpose (optional)</span>
                  <select value={form.purpose} onChange={(event) => changeForm("purpose", event.target.value as Purpose)} className="w-full rounded-xl border border-white/10 bg-[#111820] px-3 py-2.5 outline-none focus:border-teal-400/70">
                    <option value="">Not specified</option>
                    <option value="INVESTMENT">Investment</option>
                    <option value="SELF_USE">Personal use</option>
                    <option value="BUSINESS">Business use</option>
                    <option value="OTHER">Other</option>
                  </select>
                </label>
                <label className="block text-sm">
                  <span className="mb-1.5 block text-white/80">When do you need it?</span>
                  <select value={form.timeline} onChange={(event) => changeForm("timeline", event.target.value as Timeline)} className="w-full rounded-xl border border-white/10 bg-[#111820] px-3 py-2.5 outline-none focus:border-teal-400/70">
                    {TIMELINES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                  </select>
                </label>
                <label className="block text-sm">
                  <span className="mb-1.5 block text-white/80">Preferred contact method</span>
                  <select value={form.preferredContactMethod} onChange={(event) => changeForm("preferredContactMethod", event.target.value as ContactMethod)} className="w-full rounded-xl border border-white/10 bg-[#111820] px-3 py-2.5 outline-none focus:border-teal-400/70">
                    <option value="IN_APP">Truvi in-app</option>
                    <option value="PHONE">Phone call</option>
                    <option value="EMAIL">Email</option>
                    <option value="WHATSAPP">WhatsApp (manual follow-up preference)</option>
                  </select>
                </label>
                <label className="block text-sm">
                  <span className="mb-1.5 block text-white/80">Noticeboard visibility</span>
                  <select value={form.visibility} onChange={(event) => changeForm("visibility", event.target.value as Visibility)} className="w-full rounded-xl border border-white/10 bg-[#111820] px-3 py-2.5 outline-none focus:border-teal-400/70">
                    <option value="TRUVI">Visible to authorized Truvi users</option>
                    <option value="PRIVATE">Private — only me and authorized admins</option>
                  </select>
                </label>
              </div>

              {!isBuyer && (
                <section className="rounded-xl border border-amber-400/20 bg-amber-400/[0.04] p-4">
                  <h3 className="font-medium text-amber-100">Client details (private)</h3>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">Only collect contact details that are necessary. They are visible only to the submitting partner and authorized admins, never on the noticeboard.</p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <label className="block text-sm">
                      <span className="mb-1.5 block text-white/80">Client name (optional)</span>
                      <input value={form.clientName} onChange={(event) => changeForm("clientName", event.target.value)} maxLength={120} className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 outline-none focus:border-amber-300/70" />
                    </label>
                    <label className="block text-sm">
                      <span className="mb-1.5 block text-white/80">Client phone (optional)</span>
                      <input value={form.clientPhone} onChange={(event) => changeForm("clientPhone", event.target.value)} maxLength={30} autoComplete="off" placeholder="Only if needed and authorized" className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 outline-none focus:border-amber-300/70" />
                    </label>
                    <label className="block text-sm sm:col-span-2">
                      <span className="mb-1.5 block text-white/80">Client email (optional)</span>
                      <input type="email" value={form.clientEmail} onChange={(event) => changeForm("clientEmail", event.target.value)} maxLength={254} autoComplete="off" placeholder="Only if needed and authorized" className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 outline-none focus:border-amber-300/70" />
                    </label>
                  </div>
                  <label className="mt-3 flex items-start gap-2.5 text-sm">
                    <input required type="checkbox" checked={form.contactConsent} onChange={(event) => changeForm("contactConsent", event.target.checked)} className="mt-1 size-4 accent-amber-300" />
                    <span>I confirm the client has agreed to share this property requirement with Truvi. I will not submit another person’s contact details without authorization.</span>
                  </label>
                </section>
              )}

              <label className="block text-sm">
                <span className="mb-1.5 block text-white/80">Noticeboard summary (visible to authorized Truvi users, optional)</span>
                <textarea value={form.publicSummary} onChange={(event) => changeForm("publicSummary", event.target.value)} maxLength={400} rows={2} placeholder="e.g. Preferably near the main road. Do not include any contact details." className="w-full resize-y rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 outline-none focus:border-teal-400/70" />
              </label>

              <label className="block text-sm">
                <span className="mb-1.5 block text-white/80">Additional requirement details (private to you and authorized admins)</span>
                <textarea value={form.details} onChange={(event) => changeForm("details", event.target.value)} maxLength={1200} rows={3} placeholder="Describe anything else you need. Do not enter another person's private contact information without permission." className="w-full resize-y rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 outline-none focus:border-teal-400/70" />
              </label>

              <div className="flex flex-wrap items-center gap-3 pt-1">
                <Button type="submit" disabled={saving}>
                  {editingId ? <Pencil size={15} /> : <Plus size={16} />}
                  {saving ? "Saving..." : editingId ? "Update requirement" : "Submit requirement"}
                </Button>
                <p className="text-xs text-muted-foreground">Your contact details are not displayed on the public noticeboard.</p>
              </div>
            </form>
          </div>

          <div className="space-y-5">
            <section className="rounded-2xl border border-teal-400/20 bg-teal-400/[0.05] p-5">
              <div className="flex items-center gap-2"><CheckCircle2 className="text-teal-300" size={19} /><h2 className="font-semibold">How it works</h2></div>
              <ol className="mt-4 space-y-3 text-sm leading-6 text-white/75">
                <li><span className="mr-2 text-teal-300">01</span> Submit your location, budget and timeline.</li>
                <li><span className="mr-2 text-teal-300">02</span> Your requirement stays active even when no listing matches today.</li>
                <li><span className="mr-2 text-teal-300">03</span> When approved inventory matches, Truvi creates an in-app alert and attempts email delivery if email notifications are enabled and configured.</li>
              </ol>
            </section>

            <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
              <h2 className="font-semibold">My matching properties</h2>
              <p className="mt-1 text-xs text-muted-foreground">Approved projects with available inventory that fits an active requirement.</p>
              <div className="mt-4 space-y-3">
                {matches.length === 0 && <p className="rounded-xl border border-dashed border-white/10 p-4 text-sm text-muted-foreground">{loading ? "Checking for matches..." : "No matches yet. We will check again when you submit a requirement or matching inventory goes live."}</p>}
                {matches.map((item) => (
                  <div key={item.match._id} className="rounded-xl border border-white/10 bg-black/15 p-3">
                    <p className="text-xs text-teal-300">{item.requirementTitle}</p>
                    <h3 className="mt-1 font-medium">{item.project.name}</h3>
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground"><MapPin size={13} /> {item.project.location}, {item.project.city}</p>
                    <Link to={`/inventory/${item.project._id}/presentation`} className="mt-3 inline-flex text-sm font-medium text-teal-300 hover:text-teal-200">View project →</Link>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-4 sm:p-6">
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
            <div>
              <h2 className="text-xl font-semibold">My requirements</h2>
              <p className="mt-1 text-sm text-muted-foreground">Edit the details or close a requirement when your need has been fulfilled.</p>
            </div>
            <span className="text-sm text-muted-foreground">{mine.length} saved</span>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {mine.map((row) => (
              <article key={row._id} className="rounded-xl border border-white/10 bg-black/15 p-4">
                <div className="flex items-start justify-between gap-3">
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${row.status === "ACTIVE" ? "bg-emerald-400/10 text-emerald-300" : row.status === "CLOSED" ? "bg-white/10 text-white/60" : "bg-amber-400/10 text-amber-200"}`}>{row.status.replace(/_/g, " ")}</span>
                  <span className="text-xs text-muted-foreground">{new Date(row.createdAt).toLocaleDateString("en-IN")}</span>
                </div>
                <h3 className="mt-3 font-semibold">{row.title}</h3>
                <p className="mt-1 flex items-center gap-1.5 text-sm text-white/75"><Building2 size={14} /> {labelForType(row.propertyType)}</p>
                <p className="mt-1 flex items-center gap-1.5 text-sm text-white/75"><MapPin size={14} /> {row.location}, {row.city}</p>
                <p className="mt-1 flex items-center gap-1.5 text-sm text-white/75"><IndianRupee size={14} /> {budgetLabel(row)}</p>
                <p className="mt-1 flex items-center gap-1.5 text-sm text-white/75"><Clock3 size={14} /> {labelForTimeline(row.timeline)}</p>
                {(row.minAreaSqft || row.maxAreaSqft) && <p className="mt-1 flex items-center gap-1.5 text-sm text-white/75"><Ruler size={14} /> {row.minAreaSqft ?? "Any"} – {row.maxAreaSqft ?? "Any"} sq. ft.</p>}
                <div className="mt-4 flex flex-wrap gap-2">
                  {(row.status === "ACTIVE" || row.status === "CLOSED") && (
                    <>
                      <Button variant="outline" size="sm" type="button" onClick={() => editRequirement(row)}><Pencil size={13} /> Edit</Button>
                      <Button variant="ghost" size="sm" type="button" onClick={() => setStatus(row, row.status === "ACTIVE" ? "CLOSED" : "ACTIVE")}>
                        {row.status === "ACTIVE" ? <X size={13} /> : <CheckCircle2 size={13} />}
                        {row.status === "ACTIVE" ? "Withdraw" : "Reopen"}
                      </Button>
                    </>
                  )}
                  {row.status === "UNDER_REVIEW" && <span className="text-xs text-amber-200">Waiting for admin review</span>}
                  <Button variant="outline" size="sm" type="button" onClick={() => void toggleResponses(row._id)}>
                    <Eye size={13} /> {viewResponsesFor === row._id ? "Hide responses" : "Responses"}
                  </Button>
                </div>
                {viewResponsesFor === row._id && (
                  <div className="mt-3 space-y-2 border-t border-white/10 pt-3">
                    <p className="text-xs font-medium text-teal-200">Private responses</p>
                    {loadingResponsesFor === row._id && <p className="text-xs text-muted-foreground">Loading responses…</p>}
                    {(responsesByRequirement[row._id] ?? []).map((response) => (
                      <div key={response.id} className="rounded-lg border border-white/10 bg-white/[0.035] p-3">
                        <p className="text-sm font-medium">{response.responderName} <span className="text-xs font-normal text-muted-foreground">· {roleLabel(response.responderRole)}</span></p>
                        <p className="mt-2 whitespace-pre-wrap text-sm leading-5 text-white/75">{response.message}</p>
                        <p className="mt-2 text-[11px] text-muted-foreground">{new Date(response.createdAt).toLocaleString("en-IN")}</p>
                      </div>
                    ))}
                    {!loadingResponsesFor && (responsesByRequirement[row._id] ?? []).length === 0 && <p className="text-xs text-muted-foreground">No responses yet.</p>}
                  </div>
                )}
                </div>
              </article>
            ))}
            {mine.length === 0 && !loading && <p className="rounded-xl border border-dashed border-white/10 p-4 text-sm text-muted-foreground md:col-span-2 xl:col-span-3">You have not submitted a requirement yet. Use the form above to get started.</p>}
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-4 sm:p-6">
          <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
            <div>
              <h2 className="text-xl font-semibold">Requirement noticeboard</h2>
              <p className="mt-1 text-sm text-muted-foreground">Active requests shared with the authorized Truvi community. Personal contact details and private notes are never shown here.</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3">
                <Search size={15} className="text-muted-foreground" />
                <input value={search} onChange={(event) => { setSearch(event.target.value); setBoardPage(1); }} placeholder="Search requirements" className="min-w-0 bg-transparent py-2.5 text-sm outline-none" />
              </label>
              <input value={boardCity} onChange={(event) => { setBoardCity(event.target.value); setBoardPage(1); }} placeholder="Filter city" className="rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm outline-none focus:border-teal-400/70" />
              <input value={boardLocation} onChange={(event) => { setBoardLocation(event.target.value); setBoardPage(1); }} placeholder="Filter locality" className="rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm outline-none focus:border-teal-400/70" />
              <select value={boardType} onChange={(event) => { setBoardType(event.target.value); setBoardPage(1); }} className="rounded-xl border border-white/10 bg-[#111820] px-3 py-2.5 text-sm outline-none">
                <option value="ALL">All property types</option>
                {PROPERTY_TYPES.filter((item) => item.value !== "ANY").map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
              <input type="number" min="0" value={boardBudgetMin} onChange={(event) => { setBoardBudgetMin(event.target.value); setBoardPage(1); }} placeholder="Minimum budget ₹" className="rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm outline-none focus:border-teal-400/70" />
              <input type="number" min="1" value={boardBudgetMax} onChange={(event) => { setBoardBudgetMax(event.target.value); setBoardPage(1); }} placeholder="Maximum budget ₹" className="rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm outline-none focus:border-teal-400/70" />
              <select value={boardTimeline} onChange={(event) => { setBoardTimeline(event.target.value); setBoardPage(1); }} className="rounded-xl border border-white/10 bg-[#111820] px-3 py-2.5 text-sm outline-none">
                <option value="ALL">Any urgency</option>
                {TIMELINES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
              <select value={boardStatus} onChange={(event) => { setBoardStatus(event.target.value); setBoardPage(1); }} className="rounded-xl border border-white/10 bg-[#111820] px-3 py-2.5 text-sm outline-none">
                <option value="ACTIVE">Active requirements</option>
                <option value="CLOSED">Closed requirements</option>
              </select>
            </div>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filteredBoard.map((row) => (
              <article key={row._id} className="rounded-xl border border-white/10 bg-black/15 p-4">
                <div className="flex items-start justify-between gap-3">
                  <span className="rounded-full bg-sky-400/10 px-2.5 py-1 text-[11px] font-semibold text-sky-300">{roleLabel(row.submittedByRole)}</span>
                  <span className="text-xs text-muted-foreground">{new Date(row.createdAt).toLocaleDateString("en-IN")}</span>
                </div>
                <h3 className="mt-3 font-semibold">{row.title}</h3>
                <p className="mt-1 text-sm text-white/70">{labelForType(row.propertyType)}</p>
                <p className="mt-2 flex items-center gap-1.5 text-sm text-white/75"><MapPin size={14} /> {row.location}, {row.city}</p>
                <p className="mt-1 flex items-center gap-1.5 text-sm text-white/75"><IndianRupee size={14} /> {budgetLabel(row)}</p>
                <p className="mt-1 flex items-center gap-1.5 text-sm text-white/75"><Clock3 size={14} /> {labelForTimeline(row.timeline)}</p>
                {row.publicSummary && <p className="mt-3 rounded-lg bg-white/[0.04] p-3 text-sm leading-5 text-white/70">{row.publicSummary}</p>}
                <span className="mt-3 inline-block rounded-full bg-white/5 px-2.5 py-1 text-[11px] text-muted-foreground">{row.status.replace(/_/g, " ")}</span>
              </article>
            ))}
            {filteredBoard.length === 0 && <p className="rounded-xl border border-dashed border-white/10 p-4 text-sm text-muted-foreground md:col-span-2 xl:col-span-3">{loading ? "Loading noticeboard..." : "No requirements match these filters."}</p>}
          </div>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
            <p className="text-xs text-muted-foreground">{boardPagination.total} requirements · Page {boardPagination.page} of {Math.max(1, boardPagination.totalPages)}</p>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" disabled={boardPage <= 1 || loading} onClick={() => setBoardPage((page) => Math.max(1, page - 1))}>Previous</Button>
              <Button type="button" variant="outline" size="sm" disabled={boardPage >= boardPagination.totalPages || loading || boardPagination.totalPages === 0} onClick={() => setBoardPage((page) => page + 1)}>Next</Button>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

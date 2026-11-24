import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { toast } from "sonner";
import {
  ArrowLeft,
  Building2,
  Calendar,
  CalendarClock,
  CheckCircle2,
  FileCheck2,
  Image as ImageIcon,
  Info,
  LayoutGrid,
  Loader2,
  Mail,
  MapPin,
  Percent,
  Phone,
  ShieldCheck,
  Sparkles,
  UploadCloud,
  User,
  UserCheck,
  Video,
  X,
} from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { PROJECT_TYPE_OPTIONS, inventoryTerms } from "@/lib/projectTypes";
import { APPROVAL_AUTHORITIES, authorityMeta } from "@/lib/approvals";

/** Everything a developer uploads for a complete listing. Step 1 collects the
 *  core details; the rest is added on the project workspace right after. */
const UPLOAD_CHECKLIST = [
  "Project details (name, location, approval no., possession date)",
  "Floor plans, master plan & brochure (PDF)",
  "Project photos & walkthrough videos",
  "Plot / Flat inventory (sizes, numbers, pricing)",
  "Amenities & master specifications",
  "Payment plans & developer promotional offers",
  "Live construction progress timeline updates",
  "Unit availability tracking (available / sold / blocked)",
  "Direct sales & inquiry contact details",
  "Legal documents & approvals (public after verification)",
];

const COMMISSION_PRESETS = [1.5, 2, 2.5, 3, 4, 5];

interface DeveloperOption {
  _id: string;
  name: string;
  email: string;
}

/** Friendly labels for the server's validation field names */
const FIELD_LABELS: Record<string, string> = {
  name: "Project name",
  description: "Description",
  city: "City",
  location: "Location",
  commissionPercent: "Commission %",
  brochureUrl: "Brochure URL",
  priceListUrl: "Price list URL",
  salesContact: "Sales contact",
};

/** Turn a server "Validation failed" response into a specific, human message */
function validationMessage(data: any): string | null {
  const fieldErrors = data?.issues?.fieldErrors as Record<string, string[]> | undefined;
  if (!fieldErrors) return null;
  const first = Object.entries(fieldErrors).find(([, msgs]) => msgs?.length);
  if (!first) return null;
  const [field, msgs] = first;
  return `${FIELD_LABELS[field] ?? field}: ${msgs[0]}`;
}

const EMPTY_FORM = {
  name: "",
  description: "",
  city: "",
  location: "",
  projectType: "",
  approvalAuthority: "RERA" as "RERA" | "DISTRICT_PANCHAYAT" | "DTCP",
  reraNumber: "",
  totalUnits: "",
  possessionDate: "",
  salesName: "",
  salesPhone: "",
  salesEmail: "",
  commissionPercent: 3,
  developerId: "",
};
type ProjectForm = typeof EMPTY_FORM;

/** Auto-save draft per user account so leaving the page never loses progress */
const DRAFT_KEY = (userId: string) => `truvi-new-project-draft:${userId}`;

function loadFormDraft(userId: string | undefined): ProjectForm | null {
  if (!userId) return null;
  try {
    const raw = localStorage.getItem(DRAFT_KEY(userId));
    return raw ? { ...EMPTY_FORM, ...JSON.parse(raw) } : null;
  } catch {
    return null;
  }
}

function isBlank(form: ProjectForm): boolean {
  return (Object.keys(EMPTY_FORM) as (keyof ProjectForm)[]).every((k) => form[k] === EMPTY_FORM[k]);
}

export default function NewProjectPage() {
  const navigate = useNavigate();
  const isAdmin = useAuthStore((s) => s.user?.role === "ADMIN");
  const userId = useAuthStore((s) => s.user?._id);
  const [restored] = useState(() => loadFormDraft(userId));
  const [form, setForm] = useState<ProjectForm>(() => restored ?? EMPTY_FORM);
  const [draftRestored, setDraftRestored] = useState(!!restored && !isBlank(restored));
  const [developers, setDevelopers] = useState<DeveloperOption[]>([]);
  const [photos, setPhotos] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);

  // Auto-save the form as a draft on every change
  useEffect(() => {
    if (!userId) return;
    try {
      if (isBlank(form)) localStorage.removeItem(DRAFT_KEY(userId));
      else localStorage.setItem(DRAFT_KEY(userId), JSON.stringify(form));
    } catch {
      /* storage unavailable — nothing to save */
    }
  }, [form, userId]);

  function discardDraft() {
    if (window.confirm("Are you sure you want to discard this draft and start fresh?")) {
      setForm(EMPTY_FORM);
      setDraftRestored(false);
      if (userId) {
        try {
          localStorage.removeItem(DRAFT_KEY(userId));
        } catch {
          /* ignore */
        }
      }
      toast.info("Draft discarded.");
    }
  }

  // Admins can assign the new listing to an existing developer.
  useEffect(() => {
    if (!isAdmin) return;
    api
      .get("/admin/users", { params: { role: "DEVELOPER" } })
      .then((res) => setDevelopers(res.data.users))
      .catch(() => {});
  }, [isAdmin]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("Please enter a project name.");
      return;
    }
    if (form.description.trim().length < 10) {
      toast.error("Description must be at least 10 characters.");
      return;
    }
    if (!form.city.trim() || !form.location.trim()) {
      toast.error("Please provide both city and locality.");
      return;
    }

    setLoading(true);
    try {
      const { data } = await api.post("/projects", {
        name: form.name.trim(),
        description: form.description.trim(),
        city: form.city.trim(),
        location: form.location.trim(),
        projectType: form.projectType || undefined,
        approvalAuthority: form.approvalAuthority,
        reraNumber: form.reraNumber?.trim() || undefined,
        totalUnits: form.totalUnits ? Number(form.totalUnits) : undefined,
        possessionDate: form.possessionDate || undefined,
        salesContact:
          form.salesName || form.salesPhone || form.salesEmail
            ? {
                name: form.salesName.trim() || undefined,
                phone: form.salesPhone.trim() || undefined,
                email: form.salesEmail.trim() || undefined,
              }
            : undefined,
        commissionPercent: Number(form.commissionPercent),
        developerId: isAdmin && form.developerId ? form.developerId : undefined,
      });

      // Clear local draft copy
      try {
        if (userId) localStorage.removeItem(DRAFT_KEY(userId));
      } catch {
        /* ignore */
      }

      // Upload photos / videos if chosen
      if (photos.length) {
        let uploaded = 0;
        for (const file of photos) {
          try {
            const isVideo = file.type.startsWith("video/");
            const fd = new FormData();
            fd.append("file", file);
            fd.append("category", isVideo ? "GALLERY_VIDEO" : "GALLERY_IMAGE");
            fd.append("title", file.name.replace(/\.[^.]+$/, "") || (isVideo ? "Project video" : "Project photo"));
            await api.post(`/presentation/${data.project._id}/assets`, fd, {
              headers: { "Content-Type": "multipart/form-data" },
            });
            uploaded += 1;
          } catch {
            /* skip failed file */
          }
        }
        const files = uploaded ? ` with ${uploaded} media asset${uploaded === 1 ? "" : "s"}` : "";
        toast.success(
          isAdmin
            ? `Project listing initialized${files} — now add plans, inventory & documents.`
            : `Draft project created${files} — complete details then submit for review.`,
        );
      } else {
        toast.success(
          isAdmin
            ? "Project listing initialized — now add plans, photos, inventory & documents."
            : "Draft project created — complete details then submit for review.",
        );
      }

      // Redirect into workspace
      navigate(isAdmin ? `/admin/listings/${data.project._id}` : `/developer/projects/${data.project._id}`);
    } catch (err: any) {
      const data = err?.response?.data;
      toast.error(validationMessage(data) || data?.error || "Failed to create project");
    } finally {
      setLoading(false);
    }
  }

  const selectedAuthority = authorityMeta(form.approvalAuthority);

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-black text-foreground">
      {/* Top Header & Navigation Bar */}
      <header className="sticky top-0 z-30 border-b border-white/10 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3.5 sm:px-6 lg:px-8">
          <Link
            to={isAdmin ? "/admin/listings" : "/developer/crm"}
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-white/10 hover:text-foreground transition"
          >
            <ArrowLeft size={14} /> Back to Listings
          </Link>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold text-emerald-300">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Auto-saved Draft
            </span>
            <span className="hidden sm:inline-block rounded-full border border-sky-500/30 bg-sky-500/10 px-3 py-1 text-[11px] font-semibold text-sky-300">
              Step 1 of 2 · Core Profile
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Page Hero Title */}
        <div className="mb-8">
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold tracking-wider uppercase text-sky-400">
            <Building2 size={14} />
            <span>Project Initialization</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-white sm:text-3xl lg:text-4xl">
            Add New Project Listing
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
            Complete the core identity, location, legal sanctions, and visual cover for this property.
            Once saved, your dedicated project workspace opens immediately to add floor plans, master maps,
            plot-by-plot inventory, and legal documents.
          </p>

          {/* Draft Restored Banner */}
          {draftRestored && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-200 backdrop-blur-md">
              <div className="flex items-center gap-2.5">
                <Info size={16} className="text-amber-400 shrink-0" />
                <span>We restored your previous unsaved inputs so you can continue without losing your progress.</span>
              </div>
              <button
                type="button"
                onClick={discardDraft}
                className="rounded-lg border border-amber-500/40 bg-amber-500/20 px-3 py-1 text-[11px] font-semibold text-amber-100 hover:bg-amber-500/30 transition"
              >
                Discard &amp; Start Fresh
              </button>
            </div>
          )}
        </div>

        {/* 2-Column Responsive Layout */}
        <form onSubmit={submit} className="grid grid-cols-1 gap-8 lg:grid-cols-12">
          {/* Main Form Boxes (8 Columns) */}
          <div className="space-y-6 lg:col-span-8">
            {/* Box 1: Project Identity & Category */}
            <section className="rounded-2xl border border-white/10 bg-card/60 p-5 sm:p-7 shadow-xl backdrop-blur-md space-y-5">
              <div className="flex items-center gap-3 border-b border-white/10 pb-4">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-sky-500/30 bg-sky-500/10 text-sky-400 shadow-sm">
                  <Building2 size={18} />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-white uppercase tracking-wide">
                    1. Project Identity &amp; Classification
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Project brand name, development type, and public description
                  </p>
                </div>
              </div>

              <div className="grid gap-5">
                {/* Project Name */}
                <div className="space-y-1.5">
                  <label htmlFor="projectName" className="block text-xs font-semibold text-foreground">
                    Project Name <span className="text-rose-400">*</span>
                  </label>
                  <div className="relative">
                    <Building2 size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input
                      id="projectName"
                      required
                      minLength={2}
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      placeholder="e.g. Truvi Haven Luxury Plots"
                      className="h-11 w-full rounded-xl border border-white/15 bg-background/80 pl-10 pr-4 text-sm text-white placeholder:text-muted-foreground outline-none transition focus:border-sky-400 focus:ring-1 focus:ring-sky-400"
                    />
                  </div>
                </div>

                {/* Project Type */}
                <div className="space-y-1.5">
                  <label htmlFor="projectType" className="block text-xs font-semibold text-foreground">
                    Project Category
                  </label>
                  <select
                    id="projectType"
                    value={form.projectType}
                    onChange={(e) => setForm({ ...form, projectType: e.target.value })}
                    className="h-11 w-full rounded-xl border border-white/15 bg-background/80 px-3.5 text-sm text-white outline-none transition focus:border-sky-400 focus:ring-1 focus:ring-sky-400"
                  >
                    <option value="">— Select project category —</option>
                    {PROJECT_TYPE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.emoji} {o.label} ({o.group}s of {o.unit}s)
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] text-muted-foreground">
                    {form.projectType
                      ? `Your inventory will organize ${inventoryTerms(form.projectType).unit.toLowerCase()}s categorized by ${inventoryTerms(form.projectType).group.toLowerCase()}.`
                      : "Apartment, Villa, Plotted Development, Commercial, or Mixed — shapes your inventory schema."}
                  </p>
                </div>

                {/* Description */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label htmlFor="projectDesc" className="block text-xs font-semibold text-foreground">
                      Description &amp; Highlights <span className="text-rose-400">*</span>
                    </label>
                    <span
                      className={`text-[11px] font-medium ${
                        form.description.trim().length >= 10 ? "text-emerald-400" : "text-amber-400"
                      }`}
                    >
                      {form.description.trim().length} characters (min 10)
                    </span>
                  </div>
                  <textarea
                    id="projectDesc"
                    required
                    minLength={10}
                    rows={4}
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    placeholder="Describe the architectural concept, serene surroundings, connectivity benefits, master amenities, and investor growth potential..."
                    className="w-full rounded-xl border border-white/15 bg-background/80 p-3.5 text-sm text-white placeholder:text-muted-foreground outline-none transition focus:border-sky-400 focus:ring-1 focus:ring-sky-400"
                  />
                </div>
              </div>
            </section>

            {/* Box 2: Location & Geographic Details */}
            <section className="rounded-2xl border border-white/10 bg-card/60 p-5 sm:p-7 shadow-xl backdrop-blur-md space-y-5">
              <div className="flex items-center gap-3 border-b border-white/10 pb-4">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 shadow-sm">
                  <MapPin size={18} />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-white uppercase tracking-wide">
                    2. Location &amp; Geographic Area
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Target city and specific corridor / landmark for buyer discovery
                  </p>
                </div>
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label htmlFor="projectCity" className="block text-xs font-semibold text-foreground">
                    City <span className="text-rose-400">*</span>
                  </label>
                  <div className="relative">
                    <MapPin size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input
                      id="projectCity"
                      required
                      minLength={2}
                      value={form.city}
                      onChange={(e) => setForm({ ...form, city: e.target.value })}
                      placeholder="e.g. Bangalore, Hyderabad, Pune"
                      className="h-11 w-full rounded-xl border border-white/15 bg-background/80 pl-10 pr-4 text-sm text-white placeholder:text-muted-foreground outline-none transition focus:border-sky-400 focus:ring-1 focus:ring-sky-400"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="projectLoc" className="block text-xs font-semibold text-foreground">
                    Location / Locality <span className="text-rose-400">*</span>
                  </label>
                  <div className="relative">
                    <MapPin size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input
                      id="projectLoc"
                      required
                      minLength={2}
                      value={form.location}
                      onChange={(e) => setForm({ ...form, location: e.target.value })}
                      placeholder="e.g. Devanahalli, Airport Expressway"
                      className="h-11 w-full rounded-xl border border-white/15 bg-background/80 pl-10 pr-4 text-sm text-white placeholder:text-muted-foreground outline-none transition focus:border-sky-400 focus:ring-1 focus:ring-sky-400"
                    />
                  </div>
                </div>
              </div>
            </section>

            {/* Box 3: Legal Approvals & Compliance */}
            <section className="rounded-2xl border border-white/10 bg-card/60 p-5 sm:p-7 shadow-xl backdrop-blur-md space-y-5">
              <div className="flex items-center gap-3 border-b border-white/10 pb-4">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-indigo-500/30 bg-indigo-500/10 text-indigo-400 shadow-sm">
                  <ShieldCheck size={18} />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-white uppercase tracking-wide">
                    3. Legal Approvals &amp; Sanctions
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Sanctioning bodies, RERA registration, or local development authority approval
                  </p>
                </div>
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label htmlFor="approvalAuth" className="block text-xs font-semibold text-foreground">
                    Sanctioned / Approved By
                  </label>
                  <select
                    id="approvalAuth"
                    value={form.approvalAuthority}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        approvalAuthority: e.target.value as typeof form.approvalAuthority,
                      })
                    }
                    className="h-11 w-full rounded-xl border border-white/15 bg-background/80 px-3.5 text-sm text-white outline-none transition focus:border-sky-400 focus:ring-1 focus:ring-sky-400"
                  >
                    {APPROVAL_AUTHORITIES.map((a) => (
                      <option key={a.value} value={a.value}>
                        {a.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="reraNo" className="block text-xs font-semibold text-foreground">
                    {selectedAuthority.numberLabel}
                  </label>
                  <div className="relative">
                    <ShieldCheck size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input
                      id="reraNo"
                      value={form.reraNumber}
                      onChange={(e) => setForm({ ...form, reraNumber: e.target.value })}
                      placeholder={selectedAuthority.placeholder}
                      className="h-11 w-full rounded-xl border border-white/15 bg-background/80 pl-10 pr-4 text-sm text-white placeholder:text-muted-foreground outline-none transition focus:border-sky-400 focus:ring-1 focus:ring-sky-400"
                    />
                  </div>
                </div>
              </div>

              {/* Compliance Guidance Notice */}
              <div className="flex items-start gap-3 rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-3.5 text-xs text-indigo-200">
                <Info size={16} className="text-indigo-400 shrink-0 mt-0.5" />
                <p className="leading-relaxed">
                  Provide the official sanction order reference. District Panchayat or DTCP approval does not
                  automatically exempt a project from RERA registration. Truvi’s legal desk independently verifies
                  statutory evidence before public activation.
                </p>
              </div>
            </section>

            {/* Box 4: Development Scope & Timeline */}
            <section className="rounded-2xl border border-white/10 bg-card/60 p-5 sm:p-7 shadow-xl backdrop-blur-md space-y-5">
              <div className="flex items-center gap-3 border-b border-white/10 pb-4">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-400 shadow-sm">
                  <CalendarClock size={18} />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-white uppercase tracking-wide">
                    4. Development Scope &amp; Timeline
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Project scale, planned units or plots, and target possession timeframe
                  </p>
                </div>
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label htmlFor="possessionDate" className="block text-xs font-semibold text-foreground">
                    Target Possession Date
                  </label>
                  <div className="relative">
                    <Calendar size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input
                      id="possessionDate"
                      type="date"
                      value={form.possessionDate}
                      onChange={(e) => setForm({ ...form, possessionDate: e.target.value })}
                      className="h-11 w-full rounded-xl border border-white/15 bg-background/80 pl-10 pr-4 text-sm text-white outline-none transition focus:border-sky-400 focus:ring-1 focus:ring-sky-400"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="totalUnits" className="block text-xs font-semibold text-foreground">
                    Total Plots / Units Planned
                  </label>
                  <div className="relative">
                    <LayoutGrid size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input
                      id="totalUnits"
                      type="number"
                      min={0}
                      value={form.totalUnits}
                      onChange={(e) => setForm({ ...form, totalUnits: e.target.value })}
                      placeholder="e.g. 120"
                      className="h-11 w-full rounded-xl border border-white/15 bg-background/80 pl-10 pr-4 text-sm text-white placeholder:text-muted-foreground outline-none transition focus:border-sky-400 focus:ring-1 focus:ring-sky-400"
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Shown on preview cards until you map individual plots in the next step.
                  </p>
                </div>
              </div>
            </section>

            {/* Box 5: Sales Desk & Direct Enquiries */}
            <section className="rounded-2xl border border-white/10 bg-card/60 p-5 sm:p-7 shadow-xl backdrop-blur-md space-y-5">
              <div className="flex items-center gap-3 border-b border-white/10 pb-4">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-blue-500/30 bg-blue-500/10 text-blue-400 shadow-sm">
                  <Phone size={18} />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-white uppercase tracking-wide">
                    5. Sales Desk &amp; Direct Enquiries
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Official sales contact details displayed on the public presentation page
                  </p>
                </div>
              </div>

              <div className="grid gap-5 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <label htmlFor="salesName" className="block text-xs font-semibold text-foreground">
                    Sales Contact Name
                  </label>
                  <div className="relative">
                    <User size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input
                      id="salesName"
                      value={form.salesName}
                      onChange={(e) => setForm({ ...form, salesName: e.target.value })}
                      placeholder="e.g. Ramesh Kumar"
                      className="h-11 w-full rounded-xl border border-white/15 bg-background/80 pl-10 pr-4 text-sm text-white placeholder:text-muted-foreground outline-none transition focus:border-sky-400 focus:ring-1 focus:ring-sky-400"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="salesPhone" className="block text-xs font-semibold text-foreground">
                    Official Phone
                  </label>
                  <div className="relative">
                    <Phone size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input
                      id="salesPhone"
                      type="tel"
                      value={form.salesPhone}
                      onChange={(e) => setForm({ ...form, salesPhone: e.target.value })}
                      placeholder="+91 98765 43210"
                      className="h-11 w-full rounded-xl border border-white/15 bg-background/80 pl-10 pr-4 text-sm text-white placeholder:text-muted-foreground outline-none transition focus:border-sky-400 focus:ring-1 focus:ring-sky-400"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="salesEmail" className="block text-xs font-semibold text-foreground">
                    Official Email
                  </label>
                  <div className="relative">
                    <Mail size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input
                      id="salesEmail"
                      type="email"
                      value={form.salesEmail}
                      onChange={(e) => setForm({ ...form, salesEmail: e.target.value })}
                      placeholder="sales@truvihaven.com"
                      className="h-11 w-full rounded-xl border border-white/15 bg-background/80 pl-10 pr-4 text-sm text-white placeholder:text-muted-foreground outline-none transition focus:border-sky-400 focus:ring-1 focus:ring-sky-400"
                    />
                  </div>
                </div>
              </div>
            </section>

            {/* Box 6: Channel Partner Commission */}
            <section className="rounded-2xl border border-white/10 bg-card/60 p-5 sm:p-7 shadow-xl backdrop-blur-md space-y-5">
              <div className="flex items-center gap-3 border-b border-white/10 pb-4">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-purple-500/30 bg-purple-500/10 text-purple-400 shadow-sm">
                  <Percent size={18} />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-white uppercase tracking-wide">
                    6. Channel Partner Brokerage
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Commission percentage offered to verified Truvi Channel Partners on successful deals
                  </p>
                </div>
              </div>

              <div className="grid gap-5 sm:grid-cols-2 items-center">
                <div className="space-y-1.5">
                  <label htmlFor="commPercent" className="block text-xs font-semibold text-foreground">
                    Commission Rate (%)
                  </label>
                  <div className="relative">
                    <Percent size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input
                      id="commPercent"
                      type="number"
                      step="0.1"
                      min={0}
                      max={20}
                      value={form.commissionPercent}
                      onChange={(e) => setForm({ ...form, commissionPercent: Number(e.target.value) })}
                      className="h-11 w-full rounded-xl border border-white/15 bg-background/80 pl-10 pr-4 text-sm text-white outline-none transition focus:border-sky-400 focus:ring-1 focus:ring-sky-400"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <span className="block text-xs font-semibold text-muted-foreground">
                    Quick Preset Rates
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {COMMISSION_PRESETS.map((rate) => (
                      <button
                        key={rate}
                        type="button"
                        onClick={() => setForm({ ...form, commissionPercent: rate })}
                        className={`rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                          form.commissionPercent === rate
                            ? "border-purple-500 bg-purple-500/20 text-purple-200"
                            : "border-white/10 bg-white/5 text-muted-foreground hover:border-white/20 hover:text-white"
                        }`}
                      >
                        {rate}%
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            {/* Box 7: Project Media & Visuals */}
            <section className="rounded-2xl border border-white/10 bg-card/60 p-5 sm:p-7 shadow-xl backdrop-blur-md space-y-5">
              <div className="flex items-center gap-3 border-b border-white/10 pb-4">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-400 shadow-sm">
                  <ImageIcon size={18} />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-white uppercase tracking-wide">
                    7. Project Photos &amp; Walkthrough Videos
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    High-definition exterior, landscape, and layout visuals (Max 50 MB per file)
                  </p>
                </div>
              </div>

              {/* Upload Dropzone */}
              <label className="group flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-white/15 bg-white/[0.015] p-6 text-center transition hover:border-sky-400/50 hover:bg-sky-500/[0.03]">
                <div className="flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/5 text-sky-400 group-hover:scale-110 group-hover:bg-sky-500/10 transition">
                  <UploadCloud size={24} />
                </div>
                <p className="mt-3 text-sm font-semibold text-white">
                  Click to browse or drag photos &amp; videos here
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Supports JPG, PNG, WEBP, and MP4 up to 50 MB each. First photo becomes the listing cover.
                </p>
                <span className="mt-4 inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-card/80 px-4 py-2 text-xs font-semibold text-white group-hover:border-sky-400 transition">
                  + Choose Photos &amp; Videos
                </span>
                <input
                  type="file"
                  accept="image/*,video/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    const picked = Array.from(e.target.files ?? []);
                    const tooBig = picked.filter((f) => f.size > 50 * 1024 * 1024);
                    const ok = picked.filter((f) => f.size <= 50 * 1024 * 1024);
                    if (tooBig.length) toast.error(`${tooBig.length} file(s) skipped — over 50 MB`);
                    if (ok.length) setPhotos((prev) => [...prev, ...ok]);
                    e.target.value = "";
                  }}
                />
              </label>

              {/* Media Preview Grid */}
              {photos.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{photos.length} visual asset(s) ready for upload</span>
                    <button
                      type="button"
                      onClick={() => setPhotos([])}
                      className="text-rose-400 hover:underline"
                    >
                      Clear all photos
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                    {photos.map((file, i) => {
                      const isVideo = file.type.startsWith("video/");
                      return (
                        <div
                          key={i}
                          className="group relative aspect-video overflow-hidden rounded-xl border border-white/15 bg-black/60 shadow-md"
                        >
                          {isVideo ? (
                            <video
                              src={URL.createObjectURL(file)}
                              className="h-full w-full object-cover"
                              muted
                              playsInline
                            />
                          ) : (
                            <img
                              src={URL.createObjectURL(file)}
                              alt={file.name}
                              className="h-full w-full object-cover group-hover:scale-105 transition duration-300"
                            />
                          )}

                          {/* Overlay Badges */}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent pointer-events-none" />

                          {i === 0 && !isVideo && (
                            <span className="absolute bottom-2 left-2 rounded-lg bg-sky-600/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white shadow-md">
                              ★ Listing Cover
                            </span>
                          )}

                          {isVideo && (
                            <span className="absolute bottom-2 left-2 flex items-center gap-1 rounded-lg bg-purple-600/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white shadow-md">
                              <Video size={10} /> Video
                            </span>
                          )}

                          <button
                            type="button"
                            onClick={() => setPhotos((prev) => prev.filter((_, idx) => idx !== i))}
                            className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-xs text-white hover:bg-rose-600 transition"
                            title="Remove file"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </section>

            {/* Box 8: Developer Ownership (Admin Only) */}
            {isAdmin && (
              <section className="rounded-2xl border border-white/10 bg-card/60 p-5 sm:p-7 shadow-xl backdrop-blur-md space-y-4">
                <div className="flex items-center gap-3 border-b border-white/10 pb-4">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-400 shadow-sm">
                    <UserCheck size={18} />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-white uppercase tracking-wide">
                      8. Developer Ownership &amp; Attribution (Admin)
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      Assign this listing to an approved developer or keep under Truvi Admin
                    </p>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="devSelect" className="block text-xs font-semibold text-foreground">
                    Assign Developer
                  </label>
                  <select
                    id="devSelect"
                    value={form.developerId}
                    onChange={(e) => setForm({ ...form, developerId: e.target.value })}
                    className="h-11 w-full rounded-xl border border-white/15 bg-background/80 px-3.5 text-sm text-white outline-none transition focus:border-sky-400 focus:ring-1 focus:ring-sky-400"
                  >
                    <option value="">— Create under my admin account —</option>
                    {developers.map((dev) => (
                      <option key={dev._id} value={dev._id}>
                        👤 {dev.name} ({dev.email})
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] text-muted-foreground">
                    Leave blank to own the listing directly under Truvi admin.
                  </p>
                </div>
              </section>
            )}
          </div>

          {/* Right Column / Sticky Sidebar (4 Columns) */}
          <div className="lg:col-span-4 space-y-6">
            <div className="sticky top-24 space-y-6">
              {/* Primary Action Box */}
              <div className="rounded-2xl border border-sky-500/30 bg-gradient-to-b from-sky-950/40 via-card/80 to-card p-6 shadow-2xl backdrop-blur-xl space-y-5">
                <div>
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-sky-400">
                    <Sparkles size={14} /> Ready to Initialize
                  </span>
                  <h3 className="mt-1 text-base font-bold text-white">
                    Create &amp; Open Workspace
                  </h3>
                  <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                    Clicking below saves this project profile and opens the management workspace to upload your
                    master layout, plot pricing, and legal documents.
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 px-5 py-3.5 text-sm font-bold text-white shadow-lg shadow-sky-500/25 hover:from-sky-400 hover:to-blue-500 disabled:opacity-50 transition"
                >
                  {loading ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Initializing Listing…
                    </>
                  ) : (
                    <>
                      <span>Create Project &amp; Continue</span>
                      <span>→</span>
                    </>
                  )}
                </button>

                <div className="flex items-center justify-between border-t border-white/10 pt-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-emerald-400" />
                    Auto-saved in browser
                  </span>
                  <button
                    type="button"
                    onClick={discardDraft}
                    className="text-xs text-muted-foreground hover:text-rose-400 hover:underline transition"
                  >
                    Reset Form
                  </button>
                </div>
              </div>

              {/* Workspace Journey Roadmap */}
              <div className="rounded-2xl border border-white/10 bg-card/60 p-6 shadow-xl backdrop-blur-md space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Listing Setup Journey
                </h3>
                <ol className="relative border-l border-white/15 ml-3 space-y-4 text-xs">
                  <li className="ml-4">
                    <span className="absolute -left-1.5 mt-0.5 h-3 w-3 rounded-full border-2 border-sky-400 bg-sky-500" />
                    <p className="font-bold text-sky-300">1. Core Profile Details</p>
                    <p className="text-[11px] text-muted-foreground">Name, city, approvals &amp; cover media (current)</p>
                  </li>
                  <li className="ml-4 opacity-75">
                    <span className="absolute -left-1.5 mt-0.5 h-3 w-3 rounded-full border border-white/30 bg-card" />
                    <p className="font-semibold text-white">2. Master Plans &amp; Brochures</p>
                    <p className="text-[11px] text-muted-foreground">High-res master layout PDF, floor plans &amp; CAD</p>
                  </li>
                  <li className="ml-4 opacity-75">
                    <span className="absolute -left-1.5 mt-0.5 h-3 w-3 rounded-full border border-white/30 bg-card" />
                    <p className="font-semibold text-white">3. Plots &amp; Unit Inventory</p>
                    <p className="text-[11px] text-muted-foreground">Add plot numbers, sizes (sqft), facing &amp; rates</p>
                  </li>
                  <li className="ml-4 opacity-75">
                    <span className="absolute -left-1.5 mt-0.5 h-3 w-3 rounded-full border border-white/30 bg-card" />
                    <p className="font-semibold text-white">4. Legal Documents &amp; Verification</p>
                    <p className="text-[11px] text-muted-foreground">RERA certificate, title deeds, NOCs &amp; sanctions</p>
                  </li>
                  <li className="ml-4 opacity-75">
                    <span className="absolute -left-1.5 mt-0.5 h-3 w-3 rounded-full border border-white/30 bg-card" />
                    <p className="font-semibold text-white">5. Public Activation</p>
                    <p className="text-[11px] text-muted-foreground">Published to buyers, investors, and CP directory</p>
                  </li>
                </ol>
              </div>

              {/* Complete Listing Checklist Card */}
              <div className="rounded-2xl border border-white/10 bg-card/60 p-6 shadow-xl backdrop-blur-md space-y-3.5">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  <FileCheck2 size={15} className="text-emerald-400" />
                  <span>Full Listing Checklist</span>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Items you can configure on the project workspace right after creation:
                </p>
                <ul className="space-y-2 text-xs">
                  {UPLOAD_CHECKLIST.map((item) => (
                    <li key={item} className="flex items-start gap-2 text-[11px] text-foreground/80">
                      <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-emerald-400" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </form>
      </main>
    </div>
  );
}

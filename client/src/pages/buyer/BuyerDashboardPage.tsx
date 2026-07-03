import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { HeartButton } from "@/components/HeartButton";
import { CompareCheckbox } from "@/components/CompareCheckbox";
import { CompareBar } from "@/components/CompareBar";
import { SiteVisitModal } from "@/components/SiteVisitModal";
import { DocumentUpload } from "@/components/DocumentUpload";
import { useAuthStore } from "@/store/authStore";
import { toast } from "sonner";
import {
  PlusCircle,
  CalendarDays,
  Heart,
  FolderOpen,
  FileDown,
  FileText,
  TrendingUp,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import { format } from "date-fns";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import type { Project, SiteVisit, SharedDocument, BuyerDocument } from "@/types";

// ─── types & constants ────────────────────────────────────────────────────────

type Tab = "saved" | "visits" | "documents" | "investments";

interface Investment {
  _id: string;
  propertyName: string;
  purchasePrice: number;
  purchaseDate: string;
  currentValue: number;
  rentalIncome: number;
  createdAt: string;
}

const VISIT_STATUS_LABEL: Record<string, string> = {
  SCHEDULED: "Pending",
  CONFIRMED: "Confirmed",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  NO_SHOW: "No Show",
};
const VISIT_STATUS_VARIANT: Record<string, string> = {
  SCHEDULED: "warning",
  CONFIRMED: "info",
  COMPLETED: "success",
  CANCELLED: "danger",
  NO_SHOW: "default",
};

const FILE_TYPE_LABEL: Record<string, string> = {
  BROCHURE:   "Brochure",
  FLOOR_PLAN: "Floor Plan",
  PRICE_LIST: "Price List",
  LEGAL:      "Legal",
  OTHER:      "Document",
};
const FILE_TYPE_VARIANT: Record<string, string> = {
  BROCHURE:   "info",
  FLOOR_PLAN: "default",
  PRICE_LIST: "warning",
  LEGAL:      "danger",
  OTHER:      "default",
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BuyerDashboardPage() {
  const user = useAuthStore((s) => s.user);
  const [tab, setTab] = useState<Tab>("saved");

  // Saved properties
  const [savedProjects, setSavedProjects] = useState<Project[]>([]);
  const [savedLoading, setSavedLoading] = useState(true);

  // Site visits
  const [siteVisits, setSiteVisits] = useState<SiteVisit[]>([]);
  const [visitsLoading, setVisitsLoading] = useState(false);
  const [visitsFetched, setVisitsFetched] = useState(false);

  // Documents
  const [sharedDocs, setSharedDocs] = useState<SharedDocument[]>([]);
  const [myDocs, setMyDocs] = useState<BuyerDocument[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [docsFetched, setDocsFetched] = useState(false);

  // Investments
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [investmentsLoading, setInvestmentsLoading] = useState(false);
  const [investmentsFetched, setInvestmentsFetched] = useState(false);

  // Load saved properties on mount
  useEffect(() => {
    api
      .get("/buyer/dashboard")
      .then((res) =>
        setSavedProjects(
          (res.data.savedProjects || []).map((p: Project) => ({ ...p, isSaved: true }))
        )
      )
      .catch((err: any) => toast.error(err?.response?.data?.error || "Failed to load saved projects"))
      .finally(() => setSavedLoading(false));
  }, []);

  // Lazy-load site visits
  useEffect(() => {
    if (tab !== "visits" || visitsFetched) return;
    setVisitsLoading(true);
    api
      .get("/site-visits")
      .then((res) => { setSiteVisits(res.data.siteVisits || []); setVisitsFetched(true); })
      .catch((err: any) => toast.error(err?.response?.data?.error || "Failed to load site visits"))
      .finally(() => setVisitsLoading(false));
  }, [tab, visitsFetched]);

  // Lazy-load documents
  useEffect(() => {
    if (tab !== "documents" || docsFetched) return;
    setDocsLoading(true);
    Promise.all([
      api.get("/documents/shared"),
      api.get("/documents/my"),
    ])
      .then(([sharedRes, myRes]) => {
        setSharedDocs(sharedRes.data.documents || []);
        setMyDocs(myRes.data.documents || []);
        setDocsFetched(true);
      })
      .catch((err: any) => toast.error(err?.response?.data?.error || "Failed to load documents"))
      .finally(() => setDocsLoading(false));
  }, [tab, docsFetched]);

  // Lazy-load investments
  useEffect(() => {
    if (tab !== "investments" || investmentsFetched) return;
    setInvestmentsLoading(true);
    api
      .get("/investments")
      .then((res) => { setInvestments(res.data.investments || []); setInvestmentsFetched(true); })
      .catch((err: any) => toast.error(err?.response?.data?.error || "Failed to load investments"))
      .finally(() => setInvestmentsLoading(false));
  }, [tab, investmentsFetched]);

  function handleUnsave(projectId: string, saved: boolean) {
    if (!saved) setSavedProjects((prev) => prev.filter((p) => p._id !== projectId));
  }

  function handleVisitBooked() {
    setVisitsFetched(false);
  }

  function refreshMyDocs() {
    api.get("/documents/my")
      .then((res) => setMyDocs(res.data.documents || []))
      .catch(() => {});
  }

  return (
    <main className="min-h-screen bg-[#0B1220] p-6 text-white md:p-10 pb-28">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Buyer Dashboard</h1>
          <p className="mt-1 text-sm text-neutral-400">
            {user?.name ? `Welcome back, ${user.name}` : "Your properties at a glance"}
          </p>
        </div>
        <Link to="/buyer/projects">
          <Button size="sm">
            <PlusCircle size={15} className="mr-1.5" />
            Browse Properties
          </Button>
        </Link>
      </div>

      {/* Tabs */}
      <div className="mt-7 flex gap-1 border-b border-neutral-800 overflow-x-auto">
        <TabButton active={tab === "saved"} onClick={() => setTab("saved")}>
          <Heart size={14} className="mr-1.5" />
          Saved
          {savedProjects.length > 0 && (
            <span className="ml-1.5 rounded-full bg-neutral-700 px-1.5 py-0.5 text-[10px] leading-none">
              {savedProjects.length}
            </span>
          )}
        </TabButton>

        <TabButton active={tab === "visits"} onClick={() => setTab("visits")}>
          <CalendarDays size={14} className="mr-1.5" />
          Site Visits
          {visitsFetched && siteVisits.length > 0 && (
            <span className="ml-1.5 rounded-full bg-neutral-700 px-1.5 py-0.5 text-[10px] leading-none">
              {siteVisits.length}
            </span>
          )}
        </TabButton>

        <TabButton active={tab === "documents"} onClick={() => setTab("documents")}>
          <FolderOpen size={14} className="mr-1.5" />
          Documents
        </TabButton>

        <TabButton active={tab === "investments"} onClick={() => setTab("investments")}>
          <TrendingUp size={14} className="mr-1.5" />
          Investments
          {investmentsFetched && investments.length > 0 && (
            <span className="ml-1.5 rounded-full bg-neutral-700 px-1.5 py-0.5 text-[10px] leading-none">
              {investments.length}
            </span>
          )}
        </TabButton>
      </div>

      {/* Tab content */}
      <section className="mt-6">
        {tab === "saved" && (
          <SavedTab
            projects={savedProjects}
            loading={savedLoading}
            onToggle={handleUnsave}
            onVisitBooked={handleVisitBooked}
          />
        )}
        {tab === "visits" && (
          <VisitsTab
            visits={siteVisits}
            loading={visitsLoading}
            onRefresh={() => setVisitsFetched(false)}
          />
        )}
        {tab === "documents" && (
          <DocumentsTab
            sharedDocs={sharedDocs}
            myDocs={myDocs}
            loading={docsLoading}
            onRefreshMyDocs={refreshMyDocs}
          />
        )}
        {tab === "investments" && (
          <InvestmentsTab
            investments={investments}
            loading={investmentsLoading}
            onUpdate={setInvestments}
          />
        )}
      </section>

      <CompareBar />
    </main>
  );
}

// ─── TabButton ────────────────────────────────────────────────────────────────

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex shrink-0 items-center px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
        active
          ? "border-blue-500 text-white"
          : "border-transparent text-neutral-500 hover:text-neutral-300"
      }`}
    >
      {children}
    </button>
  );
}

// ─── Saved Properties tab ─────────────────────────────────────────────────────

function SavedTab({
  projects,
  loading,
  onToggle,
  onVisitBooked,
}: {
  projects: Project[];
  loading: boolean;
  onToggle: (id: string, saved: boolean) => void;
  onVisitBooked: () => void;
}) {
  if (loading) return <p className="text-sm text-neutral-500">Loading saved properties…</p>;
  if (projects.length === 0) return <SavedEmptyState />;

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {projects.map((project) => (
        <SavedProjectCard
          key={project._id}
          project={project}
          onToggle={onToggle}
          onVisitBooked={onVisitBooked}
        />
      ))}
    </div>
  );
}

function SavedProjectCard({
  project,
  onToggle,
  onVisitBooked,
}: {
  project: Project;
  onToggle: (id: string, saved: boolean) => void;
  onVisitBooked: () => void;
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const devName =
    typeof project.developerId === "object" ? (project.developerId as any).name : null;

  return (
    <>
      <div className="relative rounded-2xl border border-neutral-800 bg-[#121A2B] p-5 flex flex-col gap-3 hover:border-neutral-600 transition-colors">
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            {project.listingTier === "FEATURED" && <Badge variant="featured">Featured</Badge>}
            <Badge variant={project.approvalStatus === "APPROVED" ? "success" : "warning"}>
              {project.approvalStatus}
            </Badge>
          </div>
          <HeartButton projectId={project._id} initialSaved={true} onToggle={onToggle} />
        </div>

        <div>
          <h3 className="text-base font-semibold leading-tight">{project.name}</h3>
          <p className="mt-0.5 text-sm text-neutral-400">{project.location}, {project.city}</p>
          {devName && <p className="mt-0.5 text-xs text-neutral-500">by {devName}</p>}
        </div>

        <p className="text-sm text-neutral-300 line-clamp-2">{project.description}</p>

        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-500">
          {project.reraNumber && <span>RERA: {project.reraNumber}</span>}
          <span>Commission: {project.commissionPercent}%</span>
          {project.priceListUrl && <span>Price list available</span>}
        </div>

        <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-1">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => setModalOpen(true)}>Request Site Visit</Button>
            {project.brochureUrl && (
              <a href={project.brochureUrl} target="_blank" rel="noreferrer">
                <Button size="sm" variant="secondary">View Brochure</Button>
              </a>
            )}
          </div>
          <CompareCheckbox projectId={project._id} />
        </div>
      </div>

      {modalOpen && (
        <SiteVisitModal
          projectId={project._id}
          projectName={project.name}
          onClose={() => setModalOpen(false)}
          onSuccess={onVisitBooked}
        />
      )}
    </>
  );
}

function SavedEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-neutral-700 bg-[#121A2B] py-16 text-center">
      <span className="text-4xl">🏠</span>
      <p className="mt-4 text-base font-medium text-neutral-300">No saved properties yet</p>
      <p className="mt-1 text-sm text-neutral-500">Browse and tap ♥ to save ones you love.</p>
      <Link to="/buyer/projects" className="mt-5">
        <Button size="sm">Browse Properties</Button>
      </Link>
    </div>
  );
}

// ─── Site Visits tab ──────────────────────────────────────────────────────────

function VisitsTab({
  visits,
  loading,
  onRefresh,
}: {
  visits: SiteVisit[];
  loading: boolean;
  onRefresh: () => void;
}) {
  if (loading) return <p className="text-sm text-neutral-500">Loading site visits…</p>;

  if (visits.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-neutral-700 bg-[#121A2B] py-16 text-center">
        <span className="text-4xl">📅</span>
        <p className="mt-4 text-base font-medium text-neutral-300">No site visits yet</p>
        <p className="mt-1 text-sm text-neutral-500">Request one from any property card.</p>
        <Link to="/buyer/projects" className="mt-5">
          <Button size="sm">Browse Properties</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {visits.map((v) => {
        const projectName =
          typeof v.projectId === "object" ? v.projectId.name : "Property";
        const date = (() => {
          try { return format(new Date(v.scheduledAt), "dd MMM yyyy"); } catch { return v.scheduledAt; }
        })();
        const statusLabel = VISIT_STATUS_LABEL[v.status] ?? v.status;
        const statusVariant = (VISIT_STATUS_VARIANT[v.status] ?? "default") as any;

        return (
          <div
            key={v._id}
            className="flex flex-col gap-2 rounded-2xl border border-neutral-800 bg-[#121A2B] p-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="space-y-0.5">
              <p className="font-medium text-white">{projectName}</p>
              <p className="text-sm text-neutral-400">
                {date}{v.timeSlot && <> · {v.timeSlot}</>}
              </p>
              {v.contactNumber && (
                <p className="text-xs text-neutral-500">Contact: {v.contactNumber}</p>
              )}
              {v.reportNotes && (
                <p className="text-xs text-neutral-500 line-clamp-1">Notes: {v.reportNotes}</p>
              )}
            </div>
            <Badge variant={statusVariant} className="self-start sm:self-center shrink-0">
              {statusLabel}
            </Badge>
          </div>
        );
      })}
      <button
        onClick={onRefresh}
        className="mt-2 text-xs text-neutral-500 hover:text-neutral-300 transition-colors"
      >
        Refresh
      </button>
    </div>
  );
}

// ─── Documents tab ────────────────────────────────────────────────────────────

function DocumentsTab({
  sharedDocs,
  myDocs,
  loading,
  onRefreshMyDocs,
}: {
  sharedDocs: SharedDocument[];
  myDocs: BuyerDocument[];
  loading: boolean;
  onRefreshMyDocs: () => void;
}) {
  if (loading) return <p className="text-sm text-neutral-500">Loading documents…</p>;

  return (
    <div className="space-y-8">
      {/* ── Shared Documents ──────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <FileDown size={16} className="text-blue-400" />
          <h2 className="text-base font-semibold">Shared Documents</h2>
          <span className="text-xs text-neutral-500">— files shared by agents &amp; builders</span>
        </div>

        {sharedDocs.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-neutral-800 bg-[#121A2B] px-5 py-10 text-center">
            <p className="text-sm text-neutral-500">No documents shared yet. Check back after your agent uploads project materials.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {sharedDocs.map((doc) => {
              const projectName =
                typeof doc.projectId === "object" ? doc.projectId.name : "Property";
              const typeLabel = FILE_TYPE_LABEL[doc.fileType] ?? doc.fileType;
              const typeVariant = (FILE_TYPE_VARIANT[doc.fileType] ?? "default") as any;

              return (
                <div
                  key={doc._id}
                  className="flex items-center justify-between gap-4 rounded-xl border border-neutral-800 bg-[#121A2B] px-4 py-3"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <FileText size={16} className="shrink-0 text-neutral-500" />
                    <div className="min-w-0">
                      <a
                        href={doc.fileUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="block truncate text-sm font-medium text-blue-400 hover:underline"
                      >
                        {doc.fileName}
                      </a>
                      <p className="text-xs text-neutral-500">{projectName}</p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge variant={typeVariant}>{typeLabel}</Badge>
                    <a
                      href={doc.fileUrl}
                      target="_blank"
                      rel="noreferrer"
                      download
                      aria-label="Download"
                      className="rounded-full p-1.5 text-neutral-500 hover:bg-white/10 hover:text-blue-400 transition-colors"
                    >
                      <FileDown size={14} />
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── My Documents (KYC) ───────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <FolderOpen size={16} className="text-amber-400" />
          <h2 className="text-base font-semibold">My Documents</h2>
          <span className="text-xs text-neutral-500">— your KYC documents</span>
        </div>
        <DocumentUpload docs={myDocs} loading={false} onRefresh={onRefreshMyDocs} />
      </div>
    </div>
  );
}

// ─── Investment Tracker tab ───────────────────────────────────────────────────

function formatINR(n: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
}

function calcMetrics(inv: Investment) {
  const purchaseDate = new Date(inv.purchaseDate);
  const now = new Date();
  const months =
    (now.getFullYear() - purchaseDate.getFullYear()) * 12 +
    (now.getMonth() - purchaseDate.getMonth());
  const cumulativeRental = (inv.rentalIncome || 0) * Math.max(months, 0);
  const appreciation = inv.currentValue - inv.purchasePrice;
  const appreciationPct =
    inv.purchasePrice > 0 ? (appreciation / inv.purchasePrice) * 100 : 0;
  const totalReturn = appreciation + cumulativeRental;
  const roi =
    inv.purchasePrice > 0 ? (totalReturn / inv.purchasePrice) * 100 : 0;
  return { appreciationPct, roi, cumulativeRental, months };
}

const EMPTY_FORM = {
  propertyName: "",
  purchasePrice: "",
  purchaseDate: "",
  currentValue: "",
  rentalIncome: "",
};

function InvestmentsTab({
  investments,
  loading,
  onUpdate,
}: {
  investments: Investment[];
  loading: boolean;
  onUpdate: (invs: Investment[]) => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Investment | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);

  function openAdd() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  }

  function openEdit(inv: Investment) {
    setEditing(inv);
    setForm({
      propertyName: inv.propertyName,
      purchasePrice: String(inv.purchasePrice),
      purchaseDate: inv.purchaseDate.slice(0, 10),
      currentValue: String(inv.currentValue),
      rentalIncome: inv.rentalIncome ? String(inv.rentalIncome) : "",
    });
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditing(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.propertyName || !form.purchasePrice || !form.purchaseDate || !form.currentValue) {
      toast.error("Please fill in all required fields.");
      return;
    }
    setSubmitting(true);
    const payload = {
      propertyName: form.propertyName.trim(),
      purchasePrice: Number(form.purchasePrice),
      purchaseDate: form.purchaseDate,
      currentValue: Number(form.currentValue),
      rentalIncome: form.rentalIncome ? Number(form.rentalIncome) : 0,
    };
    try {
      if (editing) {
        const res = await api.put(`/investments/${editing._id}`, payload);
        onUpdate(investments.map((i) => (i._id === editing._id ? res.data.investment : i)));
        toast.success("Investment updated.");
      } else {
        const res = await api.post("/investments", payload);
        onUpdate([res.data.investment, ...investments]);
        toast.success("Investment added.");
      }
      closeForm();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to save investment.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Remove this investment?")) return;
    try {
      await api.delete(`/investments/${id}`);
      onUpdate(investments.filter((i) => i._id !== id));
      toast.success("Investment removed.");
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to remove investment.");
    }
  }

  if (loading) return <p className="text-sm text-neutral-500">Loading investments…</p>;

  // Portfolio summary
  const totalInvested = investments.reduce((s, i) => s + i.purchasePrice, 0);
  const totalCurrentValue = investments.reduce((s, i) => s + i.currentValue, 0);
  const totalRental = investments.reduce((inv, i) => {
    const { cumulativeRental } = calcMetrics(i);
    return inv + cumulativeRental;
  }, 0);
  const portfolioROI =
    totalInvested > 0
      ? (((totalCurrentValue - totalInvested) + totalRental) / totalInvested) * 100
      : 0;

  const chartData = investments.map((inv) => {
    const { appreciationPct } = calcMetrics(inv);
    return {
      name: inv.propertyName.length > 14
        ? inv.propertyName.slice(0, 13) + "…"
        : inv.propertyName,
      "Purchase": inv.purchasePrice / 1_00_000,
      "Current": inv.currentValue / 1_00_000,
      appreciationPct,
    };
  });

  return (
    <div className="space-y-6">
      {/* ── Summary ─────────────────────────────────────────────── */}
      {investments.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <SummaryCard label="Total Invested" value={formatINR(totalInvested)} />
            <SummaryCard label="Current Value" value={formatINR(totalCurrentValue)} />
            <SummaryCard
              label="Rental Income"
              value={formatINR(totalRental)}
              sub="cumulative"
            />
            <SummaryCard
              label="Portfolio ROI"
              value={`${portfolioROI >= 0 ? "+" : ""}${portfolioROI.toFixed(1)}%`}
              highlight={portfolioROI >= 0 ? "green" : "red"}
            />
          </div>

          {/* Chart */}
          <div className="rounded-2xl border border-neutral-800 bg-[#121A2B] p-5">
            <p className="mb-4 text-sm font-medium text-neutral-300">
              Purchase vs Current Value (₹ Lakh)
            </p>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData} barGap={4} barCategoryGap="30%">
                <XAxis
                  dataKey="name"
                  tick={{ fill: "#9ca3af", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: "#6b7280", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => `${v}L`}
                />
                <Tooltip
                  contentStyle={{
                    background: "#1e2a3b",
                    border: "1px solid #334155",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  formatter={(value: number) => [`₹${value.toFixed(1)}L`]}
                  labelStyle={{ color: "#e2e8f0" }}
                />
                <Bar dataKey="Purchase" radius={[4, 4, 0, 0]}>
                  {chartData.map((_, i) => (
                    <Cell key={i} fill="#3b82f6" />
                  ))}
                </Bar>
                <Bar dataKey="Current" radius={[4, 4, 0, 0]}>
                  {chartData.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={entry.appreciationPct >= 0 ? "#22c55e" : "#ef4444"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="mt-3 flex items-center gap-4 text-xs text-neutral-500">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-sm bg-blue-500" />
                Purchase Price
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-sm bg-green-500" />
                Current Value
              </span>
            </div>
          </div>
        </>
      )}

      {/* ── Header row ──────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">
          {investments.length === 0 ? "My Investments" : `${investments.length} Investment${investments.length !== 1 ? "s" : ""}`}
        </h2>
        <Button size="sm" onClick={openAdd}>
          <PlusCircle size={14} className="mr-1.5" />
          Add Investment
        </Button>
      </div>

      {/* ── Cards ───────────────────────────────────────────────── */}
      {investments.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-neutral-700 bg-[#121A2B] py-16 text-center">
          <span className="text-4xl">📈</span>
          <p className="mt-4 text-base font-medium text-neutral-300">No investments tracked yet</p>
          <p className="mt-1 text-sm text-neutral-500">Add a property you've purchased to track its performance.</p>
          <Button size="sm" className="mt-5" onClick={openAdd}>
            Add Investment
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {investments.map((inv) => (
            <InvestmentCard
              key={inv._id}
              investment={inv}
              onEdit={() => openEdit(inv)}
              onDelete={() => handleDelete(inv._id)}
            />
          ))}
        </div>
      )}

      {/* ── Form modal ──────────────────────────────────────────── */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl border border-neutral-700 bg-[#121A2B] p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-semibold">
                {editing ? "Edit Investment" : "Add Investment"}
              </h3>
              <button
                onClick={closeForm}
                className="rounded-full p-1 text-neutral-500 hover:bg-white/10 hover:text-white transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs text-neutral-400 mb-1">
                  Property Name / Reference <span className="text-red-400">*</span>
                </label>
                <input
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white placeholder-neutral-600 focus:border-blue-500 focus:outline-none"
                  placeholder="e.g. Prestige Lakeside – Unit 4B"
                  value={form.propertyName}
                  onChange={(e) => setForm((f) => ({ ...f, propertyName: e.target.value }))}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-neutral-400 mb-1">
                    Purchase Price (₹) <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="number"
                    min={0}
                    className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white placeholder-neutral-600 focus:border-blue-500 focus:outline-none"
                    placeholder="5000000"
                    value={form.purchasePrice}
                    onChange={(e) => setForm((f) => ({ ...f, purchasePrice: e.target.value }))}
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs text-neutral-400 mb-1">
                    Purchase Date <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="date"
                    className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                    value={form.purchaseDate}
                    onChange={(e) => setForm((f) => ({ ...f, purchaseDate: e.target.value }))}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-neutral-400 mb-1">
                    Current Est. Value (₹) <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="number"
                    min={0}
                    className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white placeholder-neutral-600 focus:border-blue-500 focus:outline-none"
                    placeholder="6500000"
                    value={form.currentValue}
                    onChange={(e) => setForm((f) => ({ ...f, currentValue: e.target.value }))}
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs text-neutral-400 mb-1">
                    Monthly Rental (₹)
                    <span className="ml-1 text-neutral-600">optional</span>
                  </label>
                  <input
                    type="number"
                    min={0}
                    className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white placeholder-neutral-600 focus:border-blue-500 focus:outline-none"
                    placeholder="25000"
                    value={form.rentalIncome}
                    onChange={(e) => setForm((f) => ({ ...f, rentalIncome: e.target.value }))}
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-1">
                <Button type="button" variant="secondary" className="flex-1" onClick={closeForm}>
                  Cancel
                </Button>
                <Button type="submit" className="flex-1" disabled={submitting}>
                  {submitting ? "Saving…" : editing ? "Save Changes" : "Add Investment"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  sub,
  highlight,
}: {
  label: string;
  value: string;
  sub?: string;
  highlight?: "green" | "red";
}) {
  const valueClass =
    highlight === "green"
      ? "text-green-400"
      : highlight === "red"
      ? "text-red-400"
      : "text-white";

  return (
    <div className="rounded-2xl border border-neutral-800 bg-[#121A2B] p-4">
      <p className="text-xs text-neutral-500">{label}</p>
      <p className={`mt-1 text-lg font-semibold ${valueClass}`}>{value}</p>
      {sub && <p className="text-[10px] text-neutral-600">{sub}</p>}
    </div>
  );
}

function InvestmentCard({
  investment,
  onEdit,
  onDelete,
}: {
  investment: Investment;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { appreciationPct, roi, cumulativeRental, months } = calcMetrics(investment);
  const isPositive = roi >= 0;

  return (
    <div className="rounded-2xl border border-neutral-800 bg-[#121A2B] p-5 flex flex-col gap-3 hover:border-neutral-600 transition-colors">
      {/* Name + actions */}
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold leading-tight">{investment.propertyName}</h3>
        <div className="flex shrink-0 gap-1">
          <button
            onClick={onEdit}
            className="rounded-full p-1.5 text-neutral-500 hover:bg-white/10 hover:text-blue-400 transition-colors"
          >
            <Pencil size={13} />
          </button>
          <button
            onClick={onDelete}
            className="rounded-full p-1.5 text-neutral-500 hover:bg-white/10 hover:text-red-400 transition-colors"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {/* ROI badge */}
      <div className="flex items-center gap-2">
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
            isPositive
              ? "bg-green-500/15 text-green-400"
              : "bg-red-500/15 text-red-400"
          }`}
        >
          <TrendingUp size={11} />
          ROI {isPositive ? "+" : ""}{roi.toFixed(1)}%
        </span>
        <span
          className={`text-xs ${
            appreciationPct >= 0 ? "text-green-500" : "text-red-500"
          }`}
        >
          {appreciationPct >= 0 ? "▲" : "▼"} {Math.abs(appreciationPct).toFixed(1)}% appreciation
        </span>
      </div>

      {/* Price row */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <p className="text-neutral-500">Purchased</p>
          <p className="font-medium text-white">{formatINR(investment.purchasePrice)}</p>
        </div>
        <div>
          <p className="text-neutral-500">Current Value</p>
          <p className={`font-medium ${investment.currentValue >= investment.purchasePrice ? "text-green-400" : "text-red-400"}`}>
            {formatINR(investment.currentValue)}
          </p>
        </div>
      </div>

      {/* Rental + date */}
      <div className="grid grid-cols-2 gap-2 text-xs border-t border-neutral-800 pt-3">
        <div>
          <p className="text-neutral-500">Rental Income</p>
          <p className="font-medium text-white">
            {investment.rentalIncome
              ? `${formatINR(investment.rentalIncome)}/mo`
              : "—"}
          </p>
          {investment.rentalIncome > 0 && months > 0 && (
            <p className="text-[10px] text-neutral-600">
              {formatINR(cumulativeRental)} cumulative
            </p>
          )}
        </div>
        <div>
          <p className="text-neutral-500">Purchase Date</p>
          <p className="font-medium text-white">
            {(() => {
              try {
                return format(new Date(investment.purchaseDate), "dd MMM yyyy");
              } catch {
                return investment.purchaseDate;
              }
            })()}
          </p>
          {months > 0 && (
            <p className="text-[10px] text-neutral-600">{months} month{months !== 1 ? "s" : ""} ago</p>
          )}
        </div>
      </div>
    </div>
  );
}

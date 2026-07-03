import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { HeartButton } from "@/components/HeartButton";
import { CompareCheckbox } from "@/components/CompareCheckbox";
import { CompareBar } from "@/components/CompareBar";
import { SiteVisitModal } from "@/components/SiteVisitModal";
import { useAuthStore } from "@/store/authStore";
import { toast } from "sonner";
import { PlusCircle, CalendarDays, Heart } from "lucide-react";
import { format } from "date-fns";
import type { Project, SiteVisit } from "@/types";

type Tab = "saved" | "visits";

const STATUS_LABEL: Record<string, string> = {
  SCHEDULED: "Pending",
  CONFIRMED: "Confirmed",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  NO_SHOW: "No Show",
};
const STATUS_VARIANT: Record<string, string> = {
  SCHEDULED: "warning",
  CONFIRMED: "info",
  COMPLETED: "success",
  CANCELLED: "danger",
  NO_SHOW: "default",
};

export default function BuyerDashboardPage() {
  const user = useAuthStore((s) => s.user);
  const [tab, setTab] = useState<Tab>("saved");

  const [savedProjects, setSavedProjects] = useState<Project[]>([]);
  const [savedLoading, setSavedLoading] = useState(true);

  const [siteVisits, setSiteVisits] = useState<SiteVisit[]>([]);
  const [visitsLoading, setVisitsLoading] = useState(false);
  const [visitsFetched, setVisitsFetched] = useState(false);

  // ── load saved properties ────────────────────────────────────────────────
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

  // ── load site visits (lazy — only when tab opened) ───────────────────────
  useEffect(() => {
    if (tab !== "visits" || visitsFetched) return;
    setVisitsLoading(true);
    api
      .get("/site-visits")
      .then((res) => { setSiteVisits(res.data.siteVisits || []); setVisitsFetched(true); })
      .catch((err: any) => toast.error(err?.response?.data?.error || "Failed to load site visits"))
      .finally(() => setVisitsLoading(false));
  }, [tab, visitsFetched]);

  function handleUnsave(projectId: string, saved: boolean) {
    if (!saved) setSavedProjects((prev) => prev.filter((p) => p._id !== projectId));
  }

  function handleVisitBooked() {
    // Invalidate so next tab-open re-fetches
    setVisitsFetched(false);
  }

  return (
    <main className="min-h-screen bg-[#0B1220] p-6 text-white md:p-10 pb-28">
      {/* Page header */}
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
      <div className="mt-7 flex gap-1 border-b border-neutral-800">
        <TabButton active={tab === "saved"} onClick={() => setTab("saved")}>
          <Heart size={14} className="mr-1.5" />
          Saved Properties
          {savedProjects.length > 0 && (
            <span className="ml-1.5 rounded-full bg-neutral-700 px-1.5 py-0.5 text-[10px] leading-none">
              {savedProjects.length}
            </span>
          )}
        </TabButton>
        <TabButton active={tab === "visits"} onClick={() => setTab("visits")}>
          <CalendarDays size={14} className="mr-1.5" />
          My Site Visits
          {visitsFetched && siteVisits.length > 0 && (
            <span className="ml-1.5 rounded-full bg-neutral-700 px-1.5 py-0.5 text-[10px] leading-none">
              {siteVisits.length}
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
            onRefresh={() => { setVisitsFetched(false); }}
          />
        )}
      </section>

      <CompareBar />
    </main>
  );
}

// ── Tab button ───────────────────────────────────────────────────────────────

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
      className={`flex items-center px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
        active
          ? "border-blue-500 text-white"
          : "border-transparent text-neutral-500 hover:text-neutral-300"
      }`}
    >
      {children}
    </button>
  );
}

// ── Saved Properties tab ─────────────────────────────────────────────────────

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
            <Button size="sm" onClick={() => setModalOpen(true)}>
              Request Site Visit
            </Button>
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
      <p className="mt-1 text-sm text-neutral-500">
        Browse properties and tap the heart icon to save ones you love.
      </p>
      <Link to="/buyer/projects" className="mt-5">
        <Button size="sm">Browse Properties</Button>
      </Link>
    </div>
  );
}

// ── My Site Visits tab ───────────────────────────────────────────────────────

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
        <p className="mt-1 text-sm text-neutral-500">
          Request a visit from any property card — we'll confirm your slot soon.
        </p>
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
          try { return format(new Date(v.scheduledAt), "dd MMM yyyy"); }
          catch { return v.scheduledAt; }
        })();
        const statusLabel = STATUS_LABEL[v.status] ?? v.status;
        const statusVariant = (STATUS_VARIANT[v.status] ?? "default") as any;

        return (
          <div
            key={v._id}
            className="flex flex-col gap-2 rounded-2xl border border-neutral-800 bg-[#121A2B] p-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="space-y-0.5">
              <p className="font-medium text-white">{projectName}</p>
              <p className="text-sm text-neutral-400">
                {date}
                {v.timeSlot && <> · {v.timeSlot}</>}
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

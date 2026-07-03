import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { HeartButton } from "@/components/HeartButton";
import { CompareCheckbox } from "@/components/CompareCheckbox";
import { CompareBar } from "@/components/CompareBar";
import { useAuthStore } from "@/store/authStore";
import { toast } from "sonner";
import { PlusCircle } from "lucide-react";
import type { Project } from "@/types";

export default function BuyerDashboardPage() {
  const user = useAuthStore((s) => s.user);
  const [savedProjects, setSavedProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadSavedProjects() {
    setLoading(true);
    try {
      const res = await api.get("/buyer/dashboard");
      setSavedProjects(
        (res.data.savedProjects || []).map((p: Project) => ({ ...p, isSaved: true }))
      );
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to load saved projects");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSavedProjects();
  }, []);

  function handleToggle(projectId: string, saved: boolean) {
    if (!saved) {
      setSavedProjects((prev) => prev.filter((p) => p._id !== projectId));
    }
  }

  return (
    <main className="min-h-screen bg-[#0B1220] p-6 text-white md:p-10 pb-28">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Saved Properties</h1>
          <p className="mt-1 text-sm text-neutral-400">
            {user?.name ? `${user.name}'s` : "Your"} shortlist — tap ♥ to remove · tick Compare to compare side-by-side · or{" "}
            <Link to="/buyer/projects" className="text-rose-400 hover:underline">
              browse more
            </Link>
            .
          </p>
        </div>
        <Link to="/buyer/projects">
          <Button size="sm">
            <PlusCircle size={15} className="mr-1.5" />
            Browse Properties
          </Button>
        </Link>
      </div>

      {/* Content */}
      <section className="mt-8">
        {loading ? (
          <p className="text-sm text-neutral-500">Loading saved properties…</p>
        ) : savedProjects.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {savedProjects.map((project) => (
              <SavedProjectCard
                key={project._id}
                project={project}
                onToggle={handleToggle}
              />
            ))}
          </div>
        )}
      </section>

      <CompareBar />
    </main>
  );
}

function SavedProjectCard({
  project,
  onToggle,
}: {
  project: Project;
  onToggle: (id: string, saved: boolean) => void;
}) {
  const devName =
    typeof project.developerId === "object"
      ? (project.developerId as any).name
      : null;

  async function requestSiteVisit() {
    try {
      await api.post("/site-visits", {
        projectId: project._id,
        scheduledAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
        notes: "Buyer requested a site visit via Truvi",
      });
      toast.success("Site visit request submitted. The channel partner will follow up soon.");
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to request a site visit");
    }
  }

  return (
    <div className="relative rounded-2xl border border-neutral-800 bg-[#121A2B] p-5 flex flex-col gap-3 hover:border-neutral-600 transition-colors">
      {/* Badges + heart */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          {project.listingTier === "FEATURED" && (
            <Badge variant="featured">Featured</Badge>
          )}
          <Badge variant={project.approvalStatus === "APPROVED" ? "success" : "warning"}>
            {project.approvalStatus}
          </Badge>
        </div>
        <HeartButton
          projectId={project._id}
          initialSaved={true}
          onToggle={onToggle}
        />
      </div>

      {/* Info */}
      <div>
        <h3 className="text-base font-semibold leading-tight">{project.name}</h3>
        <p className="mt-0.5 text-sm text-neutral-400">
          {project.location}, {project.city}
        </p>
        {devName && (
          <p className="mt-0.5 text-xs text-neutral-500">by {devName}</p>
        )}
      </div>

      <p className="text-sm text-neutral-300 line-clamp-2">{project.description}</p>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-500">
        {project.reraNumber && <span>RERA: {project.reraNumber}</span>}
        <span>Commission: {project.commissionPercent}%</span>
        {project.priceListUrl && <span>Price list available</span>}
      </div>

      {/* Actions + compare */}
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-1">
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={requestSiteVisit}>
            Request Site Visit
          </Button>
          {project.brochureUrl && (
            <a href={project.brochureUrl} target="_blank" rel="noreferrer">
              <Button size="sm" variant="secondary">
                View Brochure
              </Button>
            </a>
          )}
        </div>
        <CompareCheckbox projectId={project._id} />
      </div>
    </div>
  );
}

function EmptyState() {
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

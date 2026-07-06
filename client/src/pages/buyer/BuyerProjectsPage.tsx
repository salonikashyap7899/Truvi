import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { HeartButton } from "@/components/HeartButton";
import { CompareCheckbox } from "@/components/CompareCheckbox";
import { CompareBar } from "@/components/CompareBar";
import { SiteVisitModal } from "@/components/SiteVisitModal";
import { toast } from "sonner";
import { Bookmark, Search } from "lucide-react";
import TrustScoreWidget, { mockScoreFromId } from "@/components/TrustScoreWidget";
import LegalRiskCard, { mockRiskFromId } from "@/components/LegalRiskCard";
import PriceFairnessMeter from "@/components/PriceFairnessMeter";
import type { Project } from "@/types";

export default function BuyerProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get("/buyer/projects")
      .then((res) => setProjects(res.data.projects))
      .catch((err: any) => toast.error(err?.response?.data?.error || "Failed to load projects"))
      .finally(() => setLoading(false));
  }, []);

  function handleToggle(projectId: string, saved: boolean) {
    setProjects((prev) =>
      prev.map((p) => (p._id === projectId ? { ...p, isSaved: saved } : p))
    );
  }

  const filtered = projects.filter(
    (p) =>
      search === "" ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.city.toLowerCase().includes(search.toLowerCase()) ||
      p.location.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <main className="min-h-screen p-6 text-white md:p-10 pb-28">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Browse Inventory</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Tap ♥ to save · tick Compare to compare · find saved in{" "}
            <Link to="/buyer/dashboard" className="text-rose-400 hover:underline">
              Saved Properties
            </Link>
            .
          </p>
        </div>
        <Link to="/buyer/dashboard">
          <Button variant="secondary" size="sm">
            <Bookmark size={15} className="mr-1.5" />
            Saved
          </Button>
        </Link>
      </div>

      {/* Search */}
      <div className="relative mt-6 max-w-sm">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search by name, city or area…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-9 w-full rounded-lg border border-white/15 glass pl-9 pr-3 text-sm text-white placeholder:text-muted-foreground outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
        />
      </div>

      {/* Grid */}
      {loading ? (
        <p className="mt-10 text-sm text-muted-foreground">Loading properties…</p>
      ) : filtered.length === 0 ? (
        <p className="mt-10 text-sm text-muted-foreground">No properties found.</p>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((project) => (
            <ProjectCard key={project._id} project={project} onToggle={handleToggle} />
          ))}
        </div>
      )}

      <CompareBar />
    </main>
  );
}

function ProjectCard({
  project,
  onToggle,
}: {
  project: Project;
  onToggle: (id: string, saved: boolean) => void;
}) {
  const [modalOpen, setModalOpen] = useState(false);

  const devName =
    typeof project.developerId === "object"
      ? (project.developerId as any).name
      : null;

  return (
    <>
      <div className="relative rounded-2xl border border-white/10 glass p-5 flex flex-col gap-3 hover:border-white/20 transition-colors">
        {/* Featured badge + heart */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            {project.listingTier === "FEATURED" && (
              <Badge variant="featured">Featured</Badge>
            )}
            <Badge variant={project.approvalStatus === "APPROVED" ? "success" : "warning"}>
              {project.approvalStatus}
            </Badge>
            {project.isVerified && (
              <span className="inline-flex items-center gap-1 rounded-full bg-green-900/40 px-2 py-0.5 text-xs font-medium text-green-400 border border-green-800">
                ✓ Verified
              </span>
            )}
          </div>
          <HeartButton
            projectId={project._id}
            initialSaved={!!project.isSaved}
            onToggle={onToggle}
          />
        </div>

        {/* Info */}
        <div>
          <h3 className="text-base font-semibold leading-tight">{project.name}</h3>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {project.location}, {project.city}
          </p>
          {devName && (
            <p className="mt-0.5 text-xs text-muted-foreground">by {devName}</p>
          )}
        </div>

        <p className="text-sm text-foreground/90 line-clamp-2">{project.description}</p>

        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {project.reraNumber && <span>RERA: {project.reraNumber}</span>}
          <span>Commission: {project.commissionPercent}%</span>
          {project.priceListUrl && <span>Price list available</span>}
        </div>

        <TrustScoreWidget
          score={project.trustScore ?? mockScoreFromId(project._id)}
          compact
        />
        <LegalRiskCard
          level={project.legalRiskLevel ?? mockRiskFromId(project._id)}
          compact
        />
        <PriceFairnessMeter projectId={project._id} compact />

        {/* Actions + compare */}
        <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-1">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => setModalOpen(true)}>
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

      {modalOpen && (
        <SiteVisitModal
          projectId={project._id}
          projectName={project.name}
          onClose={() => setModalOpen(false)}
        />
      )}
    </>
  );
}

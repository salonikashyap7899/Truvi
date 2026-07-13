import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { ArrowLeft, ExternalLink, MapPin, Building2 } from "lucide-react";
import PresentationManager from "@/components/PresentationManager";
import UnitsManager from "@/components/UnitsManager";
import type { Project } from "@/types";

export default function AdminProjectManagePage() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get(`/presentation/${id}`)
      .then((res) => setProject(res.data.project))
      .catch((err: any) => toast.error(err?.response?.data?.error || "Failed to load project"))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="min-h-screen p-10 text-white">Loading…</div>;
  if (!project) {
    return (
      <main className="min-h-screen p-10 text-white">
        <p className="text-muted-foreground">Project not found.</p>
        <Link to="/admin/listings" className="mt-3 inline-block text-sm text-blue-400 hover:underline">← Back to Listings</Link>
      </main>
    );
  }

  const devName = typeof project.developerId === "object" ? (project.developerId as any).name : null;

  return (
    <main className="min-h-screen p-6 text-white md:p-10 pb-28">
      <Link to="/admin/listings" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-white transition-colors">
        <ArrowLeft size={14} /> Back to Listings
      </Link>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{project.name}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5"><MapPin size={13} /> {project.location}, {project.city}</span>
            {devName && <span className="inline-flex items-center gap-1.5"><Building2 size={13} /> by {devName}</span>}
          </p>
        </div>
        <Link
          to={`/inventory/${project._id}/presentation`}
          className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-4 py-2 text-sm text-blue-300 hover:border-blue-500/50 hover:text-blue-200"
        >
          Preview public page <ExternalLink size={13} />
        </Link>
      </div>

      <p className="mt-4 rounded-lg border border-white/10 glass px-4 py-3 text-sm text-muted-foreground">
        As an admin you can add and manage everything buyers see here: plots &amp; pricing, project images, videos, plans,
        3D renders, documents, and the features/amenities list.
      </p>

      {/* Plots / units */}
      <UnitsManager projectId={project._id} />

      {/* Images, videos, plans, documents + structured info */}
      <PresentationManager project={project} onProjectUpdated={setProject} />
    </main>
  );
}

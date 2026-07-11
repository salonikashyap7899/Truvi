import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "@/lib/api";
import { ArrowLeft, Box, Loader2, MapPin, Maximize2 } from "lucide-react";
import type { Project } from "@/types";

/**
 * Immersive 3D viewer for a listing. Embeds the third-party 3D experience
 * (Matterport, Sketchfab, Google Maps 3D/satellite, ...) stored on the
 * project's threeDModelUrl. The iframe fills the viewport so the user can
 * rotate/zoom/pan with the platform's native controls on any device.
 */
export default function ThreeDViewPage() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [frameLoaded, setFrameLoaded] = useState(false);

  useEffect(() => {
    document.title = "TRUVI — 3D Property View";
    if (!id) return;
    api
      .get(`/presentation/${id}`)
      .then((res) => setProject(res.data.project))
      .catch((err: any) => setError(err?.response?.data?.error || "Failed to load the listing"))
      .finally(() => setLoading(false));
  }, [id]);

  function enterFullscreen() {
    document.getElementById("truvi-3d-frame")?.requestFullscreen?.();
  }

  return (
    <main className="flex h-screen flex-col bg-[#06090f] text-white">
      {/* Top bar */}
      <header className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            to="/inventory"
            className="grid size-9 shrink-0 place-items-center rounded-full border border-white/15 text-muted-foreground transition hover:bg-white/10 hover:text-white"
          >
            <ArrowLeft size={15} />
          </Link>
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.25em] text-sky-300">
              <Box size={11} /> 3D Property View
            </p>
            {project && (
              <>
                <h1 className="truncate font-display text-base font-semibold sm:text-lg">{project.name}</h1>
                <p className="hidden truncate text-xs text-muted-foreground sm:flex sm:items-center sm:gap-1">
                  <MapPin size={11} /> {project.location}, {project.city}
                </p>
              </>
            )}
          </div>
        </div>
        {project?.threeDModelUrl && (
          <button
            onClick={enterFullscreen}
            className="inline-flex shrink-0 items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs font-medium text-white transition hover:bg-white/10"
          >
            <Maximize2 size={13} />
            <span className="hidden sm:inline">Fullscreen</span>
          </button>
        )}
      </header>

      {/* Viewer */}
      <div className="relative flex-1">
        {loading ? (
          <div className="absolute inset-0 grid place-items-center">
            <div className="flex flex-col items-center gap-3 text-muted-foreground">
              <Loader2 size={28} className="animate-spin text-sky-300" />
              <p className="text-sm">Preparing 3D experience…</p>
            </div>
          </div>
        ) : error || !project ? (
          <div className="absolute inset-0 grid place-items-center px-6 text-center">
            <div>
              <p className="text-lg font-semibold">Listing not found</p>
              <p className="mt-2 text-sm text-muted-foreground">{error || "This property is no longer available."}</p>
              <Link to="/inventory" className="mt-5 inline-block rounded-full border border-white/15 px-5 py-2.5 text-sm hover:bg-white/10">
                Back to inventory
              </Link>
            </div>
          </div>
        ) : !project.threeDModelUrl ? (
          <div className="absolute inset-0 grid place-items-center px-6 text-center">
            <div>
              <div className="mx-auto grid size-16 place-items-center rounded-3xl border border-sky-400/25 bg-sky-500/10">
                <Box size={26} className="text-sky-300" />
              </div>
              <p className="mt-5 text-lg font-semibold">3D View Coming Soon</p>
              <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
                Our team is preparing the interactive 3D experience for {project.name}. Check back shortly.
              </p>
              <Link
                to={`/inventory/${project._id}/presentation`}
                className="mt-5 inline-block rounded-full border border-white/15 px-5 py-2.5 text-sm hover:bg-white/10"
              >
                View project presentation instead
              </Link>
            </div>
          </div>
        ) : (
          <>
            {/* Loading shimmer under the iframe until the scene is ready */}
            {!frameLoaded && (
              <div className="absolute inset-0 grid place-items-center bg-[#06090f]">
                <div className="flex flex-col items-center gap-3 text-muted-foreground">
                  <Loader2 size={28} className="animate-spin text-sky-300" />
                  <p className="text-sm">Loading 3D scene…</p>
                </div>
              </div>
            )}
            <iframe
              id="truvi-3d-frame"
              src={project.threeDModelUrl}
              title={`3D view of ${project.name}`}
              className="h-full w-full border-0"
              loading="lazy"
              allow="fullscreen; xr-spatial-tracking; accelerometer; gyroscope; magnetometer"
              allowFullScreen
              referrerPolicy="no-referrer-when-downgrade"
              onLoad={() => setFrameLoaded(true)}
            />
          </>
        )}
      </div>
    </main>
  );
}

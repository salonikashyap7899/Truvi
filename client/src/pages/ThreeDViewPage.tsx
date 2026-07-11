import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "@/lib/api";
import {
  ArrowLeft, Box, Loader2, MapPin, Maximize2, Building2, Trees,
  Plane, Footprints, Orbit, RotateCw, Satellite, Moon, Sun, Gamepad2,
} from "lucide-react";
import type { Project } from "@/types";
import type { ScenePreset, UnitSummary } from "@/components/Property3DScene";

// The three.js scene is its own chunk so the page shell paints instantly.
const Property3DScene = lazy(() => import("@/components/Property3DScene"));

/**
 * Immersive, game-style 3D exploration of a listing. A procedurally built
 * township — towers, plots, roads, clubhouse, trees — generated from the
 * project's real unit mix, freely explorable with rotate/zoom/pan.
 * If the admin has attached an external embed (satellite / Matterport / ...)
 * it is offered as an alternate view.
 */
export default function ThreeDViewPage() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [unitSummary, setUnitSummary] = useState<UnitSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [mode, setMode] = useState<"scene" | "embed">("scene");
  const [preset, setPreset] = useState<ScenePreset>("default");
  const [presetTrigger, setPresetTrigger] = useState(0);
  const [autoRotate, setAutoRotate] = useState(true);
  const [night, setNight] = useState(false);
  const [walk, setWalk] = useState(false);
  const viewerRef = useRef<HTMLDivElement>(null);

  // First-person walking needs a mouse + keyboard; hide it on touch devices.
  const canWalk = typeof window !== "undefined" && !("ontouchstart" in window);

  useEffect(() => {
    document.title = "TRUVI — 3D Property View";
    if (!id) return;
    api
      .get(`/presentation/${id}`)
      .then((res) => {
        setProject(res.data.project);
        setUnitSummary(res.data.unitSummary ?? null);
      })
      .catch((err: any) => setError(err?.response?.data?.error || "Failed to load the listing"))
      .finally(() => setLoading(false));
  }, [id]);

  function flyTo(next: ScenePreset) {
    setPreset(next);
    setPresetTrigger((n) => n + 1);
    setAutoRotate(false);
  }

  function enterFullscreen() {
    viewerRef.current?.requestFullscreen?.();
  }

  const presetButtons: Array<{ key: ScenePreset; label: string; icon: React.ReactNode }> = [
    { key: "default", label: "Orbit", icon: <Orbit size={13} /> },
    { key: "aerial", label: "Aerial", icon: <Plane size={13} /> },
    { key: "street", label: "Street", icon: <Footprints size={13} /> },
  ];

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
        <div className="flex shrink-0 items-center gap-2">
          {project?.threeDModelUrl && (
            <button
              onClick={() => setMode((m) => (m === "scene" ? "embed" : "scene"))}
              className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs font-medium text-white transition hover:bg-white/10"
            >
              {mode === "scene" ? <Satellite size={13} /> : <Box size={13} />}
              <span className="hidden sm:inline">{mode === "scene" ? "Satellite view" : "3D scene"}</span>
            </button>
          )}
          <button
            onClick={enterFullscreen}
            className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs font-medium text-white transition hover:bg-white/10"
          >
            <Maximize2 size={13} />
            <span className="hidden sm:inline">Fullscreen</span>
          </button>
        </div>
      </header>

      {/* Viewer */}
      <div ref={viewerRef} className="relative flex-1 bg-[#06090f]">
        {loading ? (
          <CenterNote>
            <Loader2 size={28} className="animate-spin text-sky-300" />
            <p className="text-sm text-muted-foreground">Building 3D world…</p>
          </CenterNote>
        ) : error || !project ? (
          <CenterNote>
            <p className="text-lg font-semibold">Listing not found</p>
            <p className="text-sm text-muted-foreground">{error || "This property is no longer available."}</p>
            <Link to="/inventory" className="mt-2 rounded-full border border-white/15 px-5 py-2.5 text-sm hover:bg-white/10">
              Back to inventory
            </Link>
          </CenterNote>
        ) : mode === "embed" && project.threeDModelUrl ? (
          <iframe
            src={project.threeDModelUrl}
            title={`Satellite view of ${project.name}`}
            className="h-full w-full border-0"
            loading="lazy"
            allow="fullscreen; xr-spatial-tracking; accelerometer; gyroscope; magnetometer"
            allowFullScreen
            referrerPolicy="no-referrer-when-downgrade"
          />
        ) : (
          <>
            <Suspense
              fallback={
                <CenterNote>
                  <Loader2 size={28} className="animate-spin text-sky-300" />
                  <p className="text-sm text-muted-foreground">Loading 3D engine…</p>
                </CenterNote>
              }
            >
              <Property3DScene
                project={project}
                unitSummary={unitSummary}
                preset={preset}
                presetTrigger={presetTrigger}
                autoRotate={autoRotate}
                night={night}
                walk={walk}
                onExitWalk={() => setWalk(false)}
              />
            </Suspense>

            {/* Camera controls overlay */}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-2 pb-4">
              <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-1.5 rounded-full border border-white/15 bg-black/55 p-1.5 backdrop-blur">
                {!walk &&
                  presetButtons.map((b) => (
                    <button
                      key={b.key}
                      onClick={() => flyTo(b.key)}
                      className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-medium transition ${
                        preset === b.key ? "bg-sky-500/25 text-sky-200" : "text-white/70 hover:bg-white/10 hover:text-white"
                      }`}
                    >
                      {b.icon} {b.label}
                    </button>
                  ))}
                {canWalk && (
                  <button
                    onClick={() => setWalk((v) => !v)}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-medium transition ${
                      walk ? "bg-violet-500/25 text-violet-200" : "text-white/70 hover:bg-white/10 hover:text-white"
                    }`}
                  >
                    <Gamepad2 size={13} /> {walk ? "Exit walk" : "Walk"}
                  </button>
                )}
                <span className="mx-0.5 h-5 w-px bg-white/15" />
                <button
                  onClick={() => setNight((v) => !v)}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-medium transition ${
                    night ? "bg-indigo-500/25 text-indigo-200" : "text-white/70 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  {night ? <Sun size={13} /> : <Moon size={13} />} {night ? "Day" : "Night"}
                </button>
                {!walk && (
                  <button
                    onClick={() => setAutoRotate((v) => !v)}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-medium transition ${
                      autoRotate ? "bg-emerald-500/20 text-emerald-200" : "text-white/70 hover:bg-white/10 hover:text-white"
                    }`}
                  >
                    <RotateCw size={13} /> Auto-rotate
                  </button>
                )}
              </div>
              <p className="rounded-full bg-black/40 px-4 py-1.5 text-[11px] text-white/60 backdrop-blur">
                {walk
                  ? "Click the scene to look around · WASD / arrows to move · Shift to run · Esc to exit"
                  : "Drag to rotate · Scroll / pinch to zoom · Right-drag / two fingers to pan"}
              </p>
            </div>

            {/* Live inventory legend */}
            {unitSummary && unitSummary.total > 0 && (
              <div className="absolute left-4 top-4 space-y-1.5 rounded-2xl border border-white/12 bg-black/55 px-4 py-3 text-xs backdrop-blur">
                <p className="flex items-center gap-1.5 font-semibold text-white">
                  <Building2 size={12} /> Live inventory
                </p>
                <p className="text-white/70">
                  {unitSummary.total} units · <span className="text-emerald-300">{unitSummary.available} available</span>
                </p>
                <p className="flex items-center gap-1.5 text-white/50">
                  <Trees size={11} /> Layout generated from this project's real unit mix
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}

function CenterNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 grid place-items-center px-6 text-center">
      <div className="flex flex-col items-center gap-3">{children}</div>
    </div>
  );
}

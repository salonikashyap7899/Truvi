import { Suspense, lazy, useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "@/lib/api";
import { formatINR } from "@/lib/utils";
import {
  ArrowLeft, Box, Loader2, MapPin, Maximize2,
  Plane, Footprints, Orbit, RotateCw, Satellite, Moon, Sun, Gamepad2,
  X, Compass, Ruler, IndianRupee, CheckCircle2, XCircle, MessageCircle,
} from "lucide-react";
import type { Project } from "@/types";
import type { PlotSelection, SceneUnit, ScenePreset } from "@/components/Property3DScene";

// The three.js scene is its own chunk so the page shell paints instantly.
const Property3DScene = lazy(() => import("@/components/Property3DScene"));

const WA_NUMBER = "919196366358";

/** Approximate plot dimensions from area, assuming a 40 ft depth. */
function plotDimensions(areaSqft: number): string {
  const depth = 40;
  const width = Math.max(10, Math.round(areaSqft / depth));
  return `≈ ${width} ft × ${depth} ft`;
}

/**
 * Immersive, game-style 3D master plan of a listing. Every unit renders as a
 * numbered plot — green when available, red when booked — clickable for full
 * details and booking. Towers, night mode, walk mode, camera presets, and the
 * optional satellite/provider embed are all preserved.
 */
export default function ThreeDViewPage() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [units, setUnits] = useState<SceneUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [mode, setMode] = useState<"scene" | "embed">("scene");
  const [preset, setPreset] = useState<ScenePreset>("default");
  const [presetTrigger, setPresetTrigger] = useState(0);
  const [autoRotate, setAutoRotate] = useState(true);
  const [night, setNight] = useState(false);
  const [walk, setWalk] = useState(false);
  const [selected, setSelected] = useState<PlotSelection | null>(null);
  const viewerRef = useRef<HTMLDivElement>(null);

  // First-person walking needs a mouse + keyboard; hide it on touch devices.
  const canWalk = typeof window !== "undefined" && !("ontouchstart" in window);

  const load = useCallback(async () => {
    if (!id) return;
    const res = await api.get(`/presentation/${id}`);
    setProject(res.data.project);
    setUnits(res.data.units ?? []);
  }, [id]);

  useEffect(() => {
    document.title = "TRUVI — 3D Property View";
    load()
      .catch((err: any) => setError(err?.response?.data?.error || "Failed to load the listing"))
      .finally(() => setLoading(false));
  }, [load]);

  // Live availability: bookings flip plots green → red without a reload.
  useEffect(() => {
    const tick = () => load().catch(() => null);
    const interval = setInterval(tick, 30_000);
    window.addEventListener("focus", tick);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", tick);
    };
  }, [load]);

  // Keep the open panel in sync when a poll changes the selected plot's status.
  useEffect(() => {
    if (!selected) return;
    const fresh = units.find((u) => u._id === selected.unit._id);
    if (fresh && fresh.status !== selected.unit.status) {
      setSelected({ ...selected, unit: fresh });
    }
  }, [units]); // eslint-disable-line react-hooks/exhaustive-deps

  function flyTo(next: ScenePreset) {
    setSelected(null);
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

  const availableCount = units.filter((u) => u.status === "AVAILABLE").length;

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
            <p className="text-sm text-muted-foreground">Building 3D master plan…</p>
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
                units={units}
                preset={preset}
                presetTrigger={presetTrigger}
                autoRotate={autoRotate}
                night={night}
                walk={walk}
                onExitWalk={() => setWalk(false)}
                selectedUnitId={selected?.unit._id ?? null}
                onSelectPlot={setSelected}
              />
            </Suspense>

            {/* Legend + live availability */}
            <div className="absolute left-4 top-4 space-y-2 rounded-2xl border border-white/12 bg-black/55 px-4 py-3 text-xs backdrop-blur">
              <p className="font-semibold text-white">Master plan</p>
              <p className="flex items-center gap-2 text-white/80">
                <span className="inline-block size-3 rounded-sm bg-[#2fbe63]" /> Available ({availableCount})
              </p>
              <p className="flex items-center gap-2 text-white/80">
                <span className="inline-block size-3 rounded-sm bg-[#e14b44]" /> Booked ({units.length - availableCount})
              </p>
              <p className="max-w-[170px] text-[11px] leading-snug text-white/50">
                Tap a green plot to see details &amp; book
              </p>
            </div>

            {/* Camera controls overlay */}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-2 pb-4">
              <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-1.5 rounded-full border border-white/15 bg-black/55 p-1.5 backdrop-blur">
                {!walk &&
                  presetButtons.map((b) => (
                    <button
                      key={b.key}
                      onClick={() => flyTo(b.key)}
                      className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-medium transition ${
                        preset === b.key && !selected ? "bg-sky-500/25 text-sky-200" : "text-white/70 hover:bg-white/10 hover:text-white"
                      }`}
                    >
                      {b.icon} {b.label}
                    </button>
                  ))}
                {canWalk && (
                  <button
                    onClick={() => { setSelected(null); setWalk((v) => !v); }}
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
                  : "Drag to rotate · Scroll / pinch to zoom · Tap a plot for details"}
              </p>
            </div>

            {/* Plot detail panel — side card on desktop, bottom sheet on mobile */}
            {selected && project && (
              <PlotPanel selection={selected} project={project} onClose={() => setSelected(null)} />
            )}
          </>
        )}
      </div>
    </main>
  );
}

function PlotPanel({
  selection,
  project,
  onClose,
}: {
  selection: PlotSelection;
  project: Project;
  onClose: () => void;
}) {
  const { unit, facing } = selection;
  const available = unit.status === "AVAILABLE";
  const isPlot = unit.type.toLowerCase().includes("plot");

  const waMessage = encodeURIComponent(
    `Hi Truvi Ventures, I'm interested in booking ${isPlot ? "Plot" : "Unit"} ${unit.unitNumber} (${unit.type}, ${unit.areaSqft} sqft) at ${project.name}, ${project.location}, ${project.city}. Please share the next steps.`,
  );

  return (
    <aside className="absolute inset-x-3 bottom-24 z-10 rounded-3xl border border-white/15 bg-[#0a0f18]/95 p-5 shadow-[0_20px_60px_rgba(0,0,0,0.5)] backdrop-blur md:inset-x-auto md:bottom-auto md:right-4 md:top-4 md:w-80">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.25em] text-sky-300">{isPlot ? "Plot" : "Unit"} details</p>
          <h2 className="mt-1 font-display text-xl font-semibold text-white">
            {isPlot ? "Plot" : "Unit"} {unit.unitNumber}
          </h2>
        </div>
        <button
          onClick={onClose}
          className="grid size-8 shrink-0 place-items-center rounded-full border border-white/15 text-muted-foreground transition hover:bg-white/10 hover:text-white"
        >
          <X size={13} />
        </button>
      </div>

      <div className="mt-3 flex items-center gap-2">
        {available ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-500/15 px-3 py-1 text-xs font-medium text-emerald-300">
            <CheckCircle2 size={12} /> Available
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-400/30 bg-rose-500/15 px-3 py-1 text-xs font-medium text-rose-300">
            <XCircle size={12} /> Booked
          </span>
        )}
        <span className="rounded-full border border-white/12 bg-white/5 px-3 py-1 text-xs text-white/80">{unit.type}</span>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] p-3">
          <dt className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            <Ruler size={11} /> Size
          </dt>
          <dd className="mt-1 font-semibold text-white">{unit.areaSqft.toLocaleString("en-IN")} sqft</dd>
          <dd className="text-[11px] text-muted-foreground">{plotDimensions(unit.areaSqft)}</dd>
        </div>
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] p-3">
          <dt className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            <Compass size={11} /> Facing
          </dt>
          <dd className="mt-1 font-semibold text-white">{facing}</dd>
          <dd className="text-[11px] text-muted-foreground">as per master plan</dd>
        </div>
        <div className="col-span-2 rounded-2xl border border-white/[0.08] bg-white/[0.04] p-3">
          <dt className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            <IndianRupee size={11} /> Price
          </dt>
          <dd className="mt-1 font-display text-lg font-semibold text-white">{formatINR(unit.price)}</dd>
        </div>
      </dl>

      {available ? (
        <a
          href={`https://wa.me/${WA_NUMBER}?text=${waMessage}`}
          target="_blank"
          rel="noreferrer"
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-emerald-400 to-emerald-300 py-3 text-sm font-semibold text-[#052e16] transition-all hover:shadow-[0_0_28px_rgba(52,211,153,0.35)]"
        >
          <MessageCircle size={15} /> Book this {isPlot ? "plot" : "unit"}
        </a>
      ) : (
        <p className="mt-4 rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-center text-xs text-rose-200">
          This {isPlot ? "plot" : "unit"} is already booked. Tap a green plot on the map to explore available options.
        </p>
      )}
    </aside>
  );
}

function CenterNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 grid place-items-center px-6 text-center">
      <div className="flex flex-col items-center gap-3">{children}</div>
    </div>
  );
}

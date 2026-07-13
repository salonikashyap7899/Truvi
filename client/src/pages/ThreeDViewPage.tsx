import { Suspense, lazy, useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "@/lib/api";
import { formatINR } from "@/lib/utils";
import {
  ArrowLeft, Box, Loader2, MapPin, Maximize2,
  Plane, Footprints, Orbit, RotateCw, Satellite, Moon, Sun, Gamepad2,
  X, Compass, Ruler, IndianRupee, CheckCircle2, XCircle, MessageCircle,
  ZoomIn, ZoomOut, Scan, Map as MapIcon,
} from "lucide-react";
import type { Project } from "@/types";
import type { PlotSelection, SceneUnit, ScenePreset } from "@/components/Property3DScene";
import type { PlotHoverInfo } from "@/components/PrimeEstateScene";

// The three.js scenes are their own chunks so the page shell paints instantly.
const Property3DScene = lazy(() => import("@/components/Property3DScene"));
const PrimeEstateScene = lazy(() => import("@/components/PrimeEstateScene"));

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
  // Dark "digital twin" mode is the default — it matches the site's brand;
  // the toggle switches to a realistic daylight render.
  const [night, setNight] = useState(true);
  const [walk, setWalk] = useState(false);
  const [selected, setSelected] = useState<PlotSelection | null>(null);
  const viewerRef = useRef<HTMLDivElement>(null);

  // Prime Estate gets its bespoke 3D recreation of the official master plan
  // with a cinematic guided tour; "2D Plan" toggles the exact brochure image.
  const [tourPlaying, setTourPlaying] = useState(true);
  const [tourNonce, setTourNonce] = useState(0);
  const [caption, setCaption] = useState<string | null>(null);
  const [hoverInfo, setHoverInfo] = useState<PlotHoverInfo | null>(null);
  const [view2D, setView2D] = useState(false);
  const isPrime = /prime estate/i.test(project?.name ?? "");

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
    // Count this visit (fire-and-forget).
    if (id) api.post(`/inventory/${id}/view`).catch(() => null);
  }, [load, id]);

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
          {isPrime && project?.masterPlanUrl && (
            <button
              onClick={() => setView2D((v) => !v)}
              className="inline-flex items-center gap-2 rounded-full border border-[#e8c877]/40 bg-[#e8c877]/10 px-4 py-2 text-xs font-medium text-[#e8c877] transition hover:bg-[#e8c877]/20"
            >
              <MapIcon size={13} />
              <span className="hidden sm:inline">{view2D ? "3D Tour" : "2D Plan"}</span>
            </button>
          )}
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
        ) : isPrime && !view2D ? (
          // Bespoke 3D recreation of the Prime Estate master plan + guided tour
          <>
            <Suspense
              fallback={
                <CenterNote>
                  <Loader2 size={28} className="animate-spin text-sky-300" />
                  <p className="text-sm text-muted-foreground">Building Prime Estate in 3D…</p>
                </CenterNote>
              }
            >
              <PrimeEstateScene
                playTour={tourPlaying}
                tourNonce={tourNonce}
                onCaption={setCaption}
                onTourEnd={() => setTourPlaying(false)}
                onHoverPlot={setHoverInfo}
              />
            </Suspense>

            {/* Tour caption */}
            <AnimatePresence mode="wait">
              {tourPlaying && caption && (
                <motion.div
                  key={caption}
                  initial={{ opacity: 0, y: 24 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                  className="pointer-events-none absolute inset-x-4 bottom-24 flex justify-center"
                >
                  <div
                    className="rounded-[22px] p-px"
                    style={{ background: "linear-gradient(160deg, rgba(232,200,119,0.6), rgba(255,255,255,0.08) 70%)" }}
                  >
                    <p className="rounded-[21px] bg-black/75 px-6 py-3 text-center font-display text-sm font-semibold text-white backdrop-blur sm:text-base">
                      {caption}
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Tour controls */}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-2 pb-4">
              <div className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-white/15 bg-black/60 p-1.5 backdrop-blur">
                {tourPlaying ? (
                  <button
                    onClick={() => { setTourPlaying(false); setCaption(null); }}
                    className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-4 py-2 text-xs font-medium text-white transition hover:bg-white/20"
                  >
                    Skip tour
                  </button>
                ) : (
                  <button
                    onClick={() => { setTourNonce((n) => n + 1); setTourPlaying(true); }}
                    className="inline-flex items-center gap-1.5 rounded-full bg-[#e8c877]/20 px-4 py-2 text-xs font-medium text-[#e8c877] transition hover:bg-[#e8c877]/30"
                  >
                    <RotateCw size={13} /> Replay tour
                  </button>
                )}
              </div>
              <p className="rounded-full bg-black/40 px-4 py-1.5 text-[11px] text-white/60 backdrop-blur">
                {tourPlaying
                  ? "Touring the township — every zone, one by one"
                  : "Drag to rotate · Scroll / pinch to zoom · Hover a plot for details"}
              </p>
            </div>

            {/* Hovered plot chip */}
            <AnimatePresence>
              {hoverInfo && !tourPlaying && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="pointer-events-none absolute right-4 top-4 rounded-2xl border border-white/15 bg-black/70 px-4 py-3 text-xs backdrop-blur"
                >
                  <p className="font-display text-base font-semibold text-white">{hoverInfo.label}</p>
                  <p className="mt-0.5 text-white/75">{hoverInfo.category}</p>
                  <p className="text-[11px] text-[#e8c877]">{hoverInfo.size}</p>
                </motion.div>
              )}
            </AnimatePresence>
          </>
        ) : project.masterPlanUrl ? (
          // Exact official master plan — pixel-perfect, deep zoom + pan
          <MasterPlanViewer url={project.masterPlanUrl} name={project.name} />
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
            <motion.div
              initial={{ opacity: 0, x: -24 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, delay: 0.5, ease: [0.22, 1, 0.36, 1] }}
              className="absolute left-4 top-4 rounded-[20px] p-px"
              style={{ background: "linear-gradient(160deg, rgba(232,200,119,0.5), rgba(255,255,255,0.08) 70%)" }}
            >
              <div className="space-y-2 rounded-[19px] bg-black/70 px-4 py-3 text-xs backdrop-blur">
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#e8c877]">Master plan</p>
                {project.masterPlanUrl ? (
                  <p className="max-w-[190px] text-[11px] leading-snug text-white/70">
                    Official layout of <span className="text-white">{project.name}</span>. Drag to rotate · scroll to zoom · right-drag to pan.
                  </p>
                ) : (
                  <>
                    <p className="flex items-center gap-2 text-white/85">
                      <span className="inline-block size-3 rounded-[4px] bg-gradient-to-b from-[#3ed37e] to-[#1d9e55] shadow-[0_0_8px_rgba(62,211,126,0.5)]" />
                      Available <span className="text-white/50">({availableCount})</span>
                    </p>
                    <p className="flex items-center gap-2 text-white/85">
                      <span className="inline-block size-3 rounded-[4px] bg-gradient-to-b from-[#ef6a5c] to-[#c23a33] shadow-[0_0_8px_rgba(239,106,92,0.4)]" />
                      Booked <span className="text-white/50">({units.length - availableCount})</span>
                    </p>
                    <p className="max-w-[170px] text-[11px] leading-snug text-white/50">
                      Tap a green plot to see details &amp; book
                    </p>
                  </>
                )}
              </div>
            </motion.div>

            {/* Camera controls overlay */}
            <motion.div
              initial={{ opacity: 0, y: 28 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.7, ease: [0.22, 1, 0.36, 1] }}
              className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-2 pb-4"
            >
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
            </motion.div>

            {/* Plot detail panel — side card on desktop, bottom sheet on mobile */}
            <AnimatePresence>
              {selected && project && (
                <PlotPanel selection={selected} project={project} onClose={() => setSelected(null)} />
              )}
            </AnimatePresence>
          </>
        )}
      </div>
    </main>
  );
}

/**
 * Pixel-perfect interactive viewer for the official master-plan image:
 * wheel / pinch zoom around the cursor, drag to pan, double-click to zoom,
 * plus on-screen zoom controls. No 3D — the exact brochure map, sharp.
 */
function MasterPlanViewer({ url, name }: { url: string; name: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [img, setImg] = useState<{ w: number; h: number } | null>(null);
  const [failed, setFailed] = useState(false);
  const view = useRef({ s: 0.2, tx: 0, ty: 0, min: 0.05 });
  const [, force] = useState(0);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchDist = useRef(0);

  const rerender = () => force((n) => n + 1);

  const fit = useCallback(() => {
    const el = wrapRef.current;
    if (!el || !img) return;
    const s = Math.min(el.clientWidth / img.w, el.clientHeight / img.h) * 0.97;
    view.current = {
      s,
      tx: (el.clientWidth - img.w * s) / 2,
      ty: (el.clientHeight - img.h * s) / 2,
      min: s * 0.6,
    };
    rerender();
  }, [img]);

  useEffect(() => {
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [fit]);

  const zoomAt = useCallback((cx: number, cy: number, factor: number) => {
    const v = view.current;
    const next = Math.min(Math.max(v.s * factor, v.min), v.min * 30);
    const k = next / v.s;
    v.tx = cx - (cx - v.tx) * k;
    v.ty = cy - (cy - v.ty) * k;
    v.s = next;
    rerender();
  }, []);

  // Native wheel listener — React's onWheel is passive, so preventDefault
  // (needed to stop page scroll) must be attached manually.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      zoomAt(e.clientX - rect.left, e.clientY - rect.top, e.deltaY < 0 ? 1.18 : 1 / 1.18);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  function onPointerDown(e: React.PointerEvent) {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinchDist.current = Math.hypot(a.x - b.x, a.y - b.y);
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    const cur = { x: e.clientX, y: e.clientY };
    pointers.current.set(e.pointerId, cur);

    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchDist.current > 0) {
        const el = wrapRef.current!;
        const rect = el.getBoundingClientRect();
        zoomAt((a.x + b.x) / 2 - rect.left, (a.y + b.y) / 2 - rect.top, d / pinchDist.current);
      }
      pinchDist.current = d;
    } else {
      view.current.tx += cur.x - prev.x;
      view.current.ty += cur.y - prev.y;
      rerender();
    }
  }

  function onPointerEnd(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinchDist.current = 0;
  }

  const v = view.current;
  const center = () => {
    const el = wrapRef.current;
    return el ? { x: el.clientWidth / 2, y: el.clientHeight / 2 } : { x: 0, y: 0 };
  };

  return (
    <div
      ref={wrapRef}
      className="absolute inset-0 overflow-hidden bg-[#0a0f18] select-none"
      style={{ touchAction: "none", overscrollBehavior: "contain" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onDoubleClick={(e) => {
        const rect = wrapRef.current!.getBoundingClientRect();
        zoomAt(e.clientX - rect.left, e.clientY - rect.top, 1.9);
      }}
    >
      {failed ? (
        <CenterNote>
          <p className="text-lg font-semibold">Master plan unavailable</p>
          <p className="text-sm text-muted-foreground">The layout image could not be loaded. Please try again later.</p>
        </CenterNote>
      ) : (
        <>
          {!img && (
            <CenterNote>
              <Loader2 size={28} className="animate-spin text-sky-300" />
              <p className="text-sm text-muted-foreground">Loading master plan…</p>
            </CenterNote>
          )}
          <img
            src={url}
            alt={`Master plan of ${name}`}
            draggable={false}
            onLoad={(e) => {
              const t = e.currentTarget;
              setImg({ w: t.naturalWidth, h: t.naturalHeight });
            }}
            onError={() => setFailed(true)}
            className="absolute left-0 top-0"
            style={{
              width: img ? img.w : undefined,
              height: img ? img.h : undefined,
              maxWidth: "none",
              transform: `translate(${v.tx}px, ${v.ty}px) scale(${v.s})`,
              transformOrigin: "0 0",
              opacity: img ? 1 : 0,
              willChange: "transform",
            }}
          />

          {/* Info chip */}
          <motion.div
            initial={{ opacity: 0, x: -24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="pointer-events-none absolute left-4 top-4 rounded-[20px] p-px"
            style={{ background: "linear-gradient(160deg, rgba(232,200,119,0.5), rgba(255,255,255,0.08) 70%)" }}
          >
            <div className="space-y-1.5 rounded-[19px] bg-black/70 px-4 py-3 text-xs backdrop-blur">
              <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.22em] text-[#e8c877]">
                <MapIcon size={11} /> Official master plan
              </p>
              <p className="max-w-[200px] text-[11px] leading-snug text-white/70">
                Exact layout of <span className="text-white">{name}</span> — zoom in to read every plot number.
              </p>
            </div>
          </motion.div>

          {/* Zoom controls */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="absolute bottom-6 right-4 flex flex-col gap-1.5 rounded-full border border-white/15 bg-black/60 p-1.5 backdrop-blur"
          >
            <button
              onClick={() => { const c = center(); zoomAt(c.x, c.y, 1.35); }}
              className="grid size-10 place-items-center rounded-full text-white/80 transition hover:bg-white/10 hover:text-white"
              aria-label="Zoom in"
            >
              <ZoomIn size={17} />
            </button>
            <button
              onClick={() => { const c = center(); zoomAt(c.x, c.y, 1 / 1.35); }}
              className="grid size-10 place-items-center rounded-full text-white/80 transition hover:bg-white/10 hover:text-white"
              aria-label="Zoom out"
            >
              <ZoomOut size={17} />
            </button>
            <button
              onClick={fit}
              className="grid size-10 place-items-center rounded-full text-white/80 transition hover:bg-white/10 hover:text-white"
              aria-label="Fit to screen"
            >
              <Scan size={17} />
            </button>
          </motion.div>

          <p className="pointer-events-none absolute bottom-6 left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-4 py-1.5 text-[11px] text-white/60 backdrop-blur">
            Scroll / pinch to zoom · Drag to pan · Double-tap to zoom in
          </p>
        </>
      )}
    </div>
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
  const kind = isPlot ? "Plot" : "Unit";

  const [view, setView] = useState<"details" | "form" | "done">("details");
  const [form, setForm] = useState({ name: "", phone: "", email: "", note: "" });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Reset the flow whenever a different plot is opened.
  useEffect(() => {
    setView("details");
    setFormError(null);
  }, [unit._id]);

  const waMessage = encodeURIComponent(
    `Hi Truvi Ventures, I'm interested in booking ${kind} ${unit.unitNumber} (${unit.type}, ${unit.areaSqft} sqft) at ${project.name}, ${project.location}, ${project.city}. Please share the next steps.`,
  );

  async function submitBooking(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (form.name.trim().length < 2) return setFormError("Please enter your name");
    if (!/^[6-9]\d{9}$/.test(form.phone.trim())) return setFormError("Enter a valid 10-digit mobile number");
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) return setFormError("Enter a valid email address");

    setSubmitting(true);
    try {
      await api.post("/enquiries", {
        name: form.name.trim(),
        email: form.email.trim(),
        purposeType: "BUYER",
        projectId: project._id,
        projectName: project.name,
        message:
          `BOOKING REQUEST — ${kind} ${unit.unitNumber} (${unit.type}, ${unit.areaSqft} sqft, ${formatINR(unit.price)}, facing ${facing}) ` +
          `at ${project.name}, ${project.location}, ${project.city}. Phone: ${form.phone.trim()}.` +
          (form.note.trim() ? ` Note: ${form.note.trim()}` : ""),
      });
      setView("done");
    } catch (err: any) {
      setFormError(err?.response?.data?.error || "Something went wrong — please try again");
    } finally {
      setSubmitting(false);
    }
  }

  const inputCls =
    "h-11 w-full rounded-xl border border-white/15 bg-white/[0.06] px-3.5 text-sm text-white placeholder:text-white/30 outline-none transition focus:border-[#e8c877]/60";

  return (
    <motion.aside
      initial={{ opacity: 0, y: 40, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 24, scale: 0.97 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="absolute inset-x-3 bottom-24 z-10 md:inset-x-auto md:bottom-auto md:right-4 md:top-4 md:w-[21rem]"
    >
      <div
        className="rounded-[26px] p-px shadow-[0_24px_70px_rgba(0,0,0,0.55)]"
        style={{ background: "linear-gradient(160deg, rgba(232,200,119,0.55), rgba(59,130,246,0.25) 45%, rgba(255,255,255,0.06) 85%)" }}
      >
        <div className="max-h-[70vh] overflow-y-auto rounded-[25px] bg-[#0a0f18]/97 p-5 backdrop-blur">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-[0.25em] text-[#e8c877]">
                {view === "form" ? "Book on website" : `${kind} details`}
              </p>
              <h2 className="mt-1 font-display text-xl font-semibold text-white">
                {kind} {unit.unitNumber}
              </h2>
            </div>
            <button
              onClick={onClose}
              className="grid size-8 shrink-0 place-items-center rounded-full border border-white/15 text-muted-foreground transition hover:bg-white/10 hover:text-white"
            >
              <X size={13} />
            </button>
          </div>

          {view === "done" ? (
            <div className="mt-5 flex flex-col items-center gap-3 py-4 text-center">
              <span className="grid size-14 place-items-center rounded-full border border-emerald-400/30 bg-emerald-500/15">
                <CheckCircle2 size={26} className="text-emerald-300" />
              </span>
              <p className="font-display text-lg font-semibold text-white">Booking request received!</p>
              <p className="max-w-[240px] text-sm text-muted-foreground">
                Our team will call you shortly to confirm {kind.toLowerCase()} {unit.unitNumber} and guide you through the next steps.
              </p>
              <button
                onClick={onClose}
                className="mt-1 rounded-full border border-white/15 px-6 py-2.5 text-sm text-white transition hover:bg-white/10"
              >
                Explore more plots
              </button>
            </div>
          ) : view === "form" ? (
            <form onSubmit={submitBooking} className="mt-4 space-y-3">
              <p className="rounded-2xl border border-white/[0.08] bg-white/[0.04] px-4 py-2.5 text-xs text-white/80">
                {unit.type} · {unit.areaSqft.toLocaleString("en-IN")} sqft ·{" "}
                <span className="font-semibold text-white">{formatINR(unit.price)}</span>
              </p>
              <input className={inputCls} placeholder="Full name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
              <input className={inputCls} placeholder="10-digit mobile number" inputMode="numeric" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
              <input className={inputCls} type="email" placeholder="Email address" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
              <textarea
                className="w-full rounded-xl border border-white/15 bg-white/[0.06] px-3.5 py-2.5 text-sm text-white placeholder:text-white/30 outline-none transition focus:border-[#e8c877]/60"
                rows={2}
                placeholder="Anything we should know? (optional)"
                value={form.note}
                onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
              />
              {formError && (
                <p className="rounded-xl border border-rose-500/25 bg-rose-950/40 px-3 py-2 text-xs text-rose-300">{formError}</p>
              )}
              <button
                type="submit"
                disabled={submitting}
                className="flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#e8c877] to-[#f5e3b3] py-3 text-sm font-semibold text-[#231a05] transition-all hover:shadow-[0_0_28px_rgba(232,200,119,0.35)] disabled:opacity-60"
              >
                {submitting ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
                {submitting ? "Submitting…" : "Confirm booking request"}
              </button>
              <button
                type="button"
                onClick={() => setView("details")}
                className="w-full py-1 text-center text-xs text-muted-foreground transition hover:text-white"
              >
                ← Back to details
              </button>
            </form>
          ) : (
            <>
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
                <div className="col-span-2 rounded-2xl border border-[#e8c877]/20 bg-gradient-to-r from-[#e8c877]/10 to-transparent p-3">
                  <dt className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.16em] text-[#e8c877]/90">
                    <IndianRupee size={11} /> Price
                  </dt>
                  <dd className="mt-1 font-display text-xl font-semibold text-white">{formatINR(unit.price)}</dd>
                </div>
              </dl>

              {available ? (
                <div className="mt-4 space-y-2">
                  <button
                    onClick={() => setView("form")}
                    className="flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#e8c877] to-[#f5e3b3] py-3 text-sm font-semibold text-[#231a05] transition-all hover:shadow-[0_0_28px_rgba(232,200,119,0.35)]"
                  >
                    <CheckCircle2 size={15} /> Book on website
                  </button>
                  <a
                    href={`https://wa.me/${WA_NUMBER}?text=${waMessage}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex w-full items-center justify-center gap-2 rounded-full border border-emerald-400/35 bg-emerald-500/10 py-3 text-sm font-medium text-emerald-300 transition-all hover:bg-emerald-500/20"
                  >
                    <MessageCircle size={15} /> Book via WhatsApp
                  </a>
                </div>
              ) : (
                <p className="mt-4 rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-center text-xs text-rose-200">
                  This {kind.toLowerCase()} is already booked. Tap a green plot on the map to explore available options.
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </motion.aside>
  );
}

function CenterNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 grid place-items-center px-6 text-center">
      <div className="flex flex-col items-center gap-3">{children}</div>
    </div>
  );
}

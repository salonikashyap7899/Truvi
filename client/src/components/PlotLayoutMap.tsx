import { useRef, useState } from "react";
import { ZoomIn, ZoomOut, Maximize2 } from "lucide-react";
import { cn } from "@/lib/utils";

/** Minimal shape needed to render/place a plot marker — satisfied by both the
 *  full `Unit` (developer editor) and `SceneUnit` (buyer 3D view). */
export interface PlotUnit {
  _id: string;
  unitNumber: string;
  status: string;
  price: number;
  mapX?: number | null;
  mapY?: number | null;
}

/**
 * Interactive plot overlay on a project's uploaded layout / master-plan image.
 *
 * Two modes:
 *  - editable: the developer drags each plot marker onto the layout (or clicks
 *    an unplaced plot then clicks the map to drop it). Positions are saved as
 *    fractions 0–1 of the image via `onMove`.
 *  - read-only (buyer): markers are tappable — green = available, red = booked —
 *    and call `onSelect`. Prices show on available plots.
 *
 * Markers are positioned as a percentage of the stage (which wraps the image),
 * so they stay pinned to the same spot on the layout at any zoom/scroll.
 */
export interface PlotLayoutMapProps {
  imageUrl: string;
  units: PlotUnit[];
  editable?: boolean;
  onMove?: (unitId: string, x: number, y: number) => void;
  onSelect?: (unit: PlotUnit) => void;
  formatPrice?: (n: number) => string;
  className?: string;
}

const isAvailable = (u: PlotUnit) => u.status === "AVAILABLE";
const shortPrice = (n: number) => {
  if (n >= 1e7) return `₹${(n / 1e7).toFixed(n % 1e7 === 0 ? 0 : 1)}Cr`;
  if (n >= 1e5) return `₹${(n / 1e5).toFixed(n % 1e5 === 0 ? 0 : 1)}L`;
  return `₹${n.toLocaleString("en-IN")}`;
};

export default function PlotLayoutMap({
  imageUrl, units, editable, onMove, onSelect, formatPrice, className,
}: PlotLayoutMapProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [placing, setPlacing] = useState<string | null>(null); // unitId being placed
  const dragging = useRef<{ id: string } | null>(null);
  // Local position overrides during a drag so it feels instant before saving.
  const [pos, setPos] = useState<Record<string, { x: number; y: number }>>({});

  const priceOf = formatPrice ?? shortPrice;
  const placed = units.filter((u) => (pos[u._id] ?? (u.mapX != null && u.mapY != null ? { x: u.mapX!, y: u.mapY! } : null)));
  const unplaced = units.filter((u) => u.mapX == null || u.mapY == null).filter((u) => !pos[u._id]);

  const xy = (u: PlotUnit) => pos[u._id] ?? { x: u.mapX ?? 0, y: u.mapY ?? 0 };

  const fracFromEvent = (clientX: number, clientY: number) => {
    const r = stageRef.current!.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (clientY - r.top) / r.height)),
    };
  };

  function onStageClick(e: React.PointerEvent) {
    if (!editable || !placing) return;
    const { x, y } = fracFromEvent(e.clientX, e.clientY);
    setPos((p) => ({ ...p, [placing]: { x, y } }));
    onMove?.(placing, x, y);
    setPlacing(null);
  }

  function startDrag(e: React.PointerEvent, id: string) {
    if (!editable) return;
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragging.current = { id };
  }
  function onDragMove(e: React.PointerEvent) {
    if (!editable || !dragging.current) return;
    const { x, y } = fracFromEvent(e.clientX, e.clientY);
    setPos((p) => ({ ...p, [dragging.current!.id]: { x, y } }));
  }
  function endDrag() {
    if (!dragging.current) return;
    const id = dragging.current.id;
    const p = pos[id];
    dragging.current = null;
    if (p) onMove?.(id, p.x, p.y);
  }

  return (
    <div className={cn("select-none", className)}>
      {editable && unplaced.length > 0 && (
        <div className="mb-2 rounded-lg border border-white/10 bg-white/5 p-2">
          <p className="mb-1.5 text-xs text-white/60">
            {placing ? "Now tap the layout to drop this plot." : "Tap a plot below, then tap its spot on the layout. Drag any placed marker to fine-tune."}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {unplaced.map((u) => (
              <button
                key={u._id}
                onClick={() => setPlacing((cur) => (cur === u._id ? null : u._id))}
                className={cn(
                  "rounded-md border px-2 py-1 text-xs font-medium",
                  placing === u._id ? "border-sky-400 bg-sky-500/20 text-white" : "border-white/15 bg-white/5 text-white/80 hover:bg-white/10",
                )}
              >
                {u.unitNumber}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="relative overflow-auto rounded-xl border border-white/10 bg-black/40" style={{ maxHeight: 560 }}>
        <div className="pointer-events-none absolute right-2 top-2 z-20 flex gap-1">
          <button onClick={() => setZoom((z) => Math.min(4, +(z + 0.25).toFixed(2)))} className="pointer-events-auto rounded-md bg-black/60 p-1.5 text-white hover:bg-black/80" aria-label="Zoom in"><ZoomIn size={16} /></button>
          <button onClick={() => setZoom((z) => Math.max(1, +(z - 0.25).toFixed(2)))} className="pointer-events-auto rounded-md bg-black/60 p-1.5 text-white hover:bg-black/80" aria-label="Zoom out"><ZoomOut size={16} /></button>
          <button onClick={() => setZoom(1)} className="pointer-events-auto rounded-md bg-black/60 p-1.5 text-white hover:bg-black/80" aria-label="Reset"><Maximize2 size={16} /></button>
        </div>

        <div
          ref={stageRef}
          className={cn("relative", editable && placing ? "cursor-crosshair" : "")}
          style={{ width: `${zoom * 100}%` }}
          onPointerDown={onStageClick}
          onPointerMove={onDragMove}
          onPointerUp={endDrag}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageUrl} alt="Project layout" className="block w-full" draggable={false} />

          {placed.map((u) => {
            const { x, y } = xy(u);
            const avail = isAvailable(u);
            return (
              <button
                key={u._id}
                onPointerDown={(e) => startDrag(e, u._id)}
                onClick={(e) => { e.stopPropagation(); if (!editable) onSelect?.(u); }}
                title={`${u.unitNumber} — ${avail ? priceOf(u.price) : u.status}`}
                className={cn(
                  "absolute z-10 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-0.5",
                  editable ? "cursor-move" : "cursor-pointer",
                )}
                style={{ left: `${x * 100}%`, top: `${y * 100}%` }}
              >
                <span
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-[11px] font-bold leading-none shadow-lg backdrop-blur-sm",
                    avail
                      ? "border-emerald-300/60 bg-emerald-500/85 text-white shadow-emerald-900/40"
                      : "border-red-300/60 bg-red-500/85 text-white shadow-red-900/40",
                  )}
                >
                  {u.unitNumber}
                </span>
                {avail && (
                  <span className="rounded bg-black/70 px-1 py-px text-[9px] font-semibold text-emerald-200">{priceOf(u.price)}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-white/60">
        <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Available</span>
        <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-red-500" /> Booked / Sold</span>
        {units.some((u) => u.mapX == null) && <span className="text-white/40">· {units.filter((u) => u.mapX == null).length} not placed</span>}
      </div>
    </div>
  );
}

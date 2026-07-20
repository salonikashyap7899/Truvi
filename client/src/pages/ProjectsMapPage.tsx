import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { SiteNav } from "@/components/SiteNav";
import { Map as MapIcon, IndianRupee, Eye, Boxes } from "lucide-react";
import type { Project } from "@/types";

/**
 * GIS Project Map — every approved project with a pin, colored as a heat
 * scale by the chosen metric (₹/sq ft, live units, or views). Data is the
 * same live /inventory feed as the listings page; free CARTO/OSM tiles.
 */
const DARK_TILES = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';
const DEFAULT_CENTER: [number, number] = [26.8467, 80.9462];

type Metric = "price" | "units" | "views";
const METRICS: { key: Metric; label: string; icon: React.ReactNode }[] = [
  { key: "price", label: "Price / sq ft", icon: <IndianRupee size={12} /> },
  { key: "units", label: "Live units", icon: <Boxes size={12} /> },
  { key: "views", label: "Buyer views", icon: <Eye size={12} /> },
];

/** Heat ramp: low → cool violet, high → hot amber/red. */
const RAMP = ["#7C5CFF", "#38BDF8", "#14C79A", "#F5B33F", "#F4574A"];
function heatColor(t: number): string {
  return RAMP[Math.min(RAMP.length - 1, Math.max(0, Math.floor(t * RAMP.length)))];
}

function metricValue(p: Project, m: Metric): number {
  if (m === "price") return p.minRate ?? 0;
  if (m === "units") return p.unitCount ?? 0;
  return p.viewCount ?? 0;
}

export default function ProjectsMapPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [metric, setMetric] = useState<Metric>("price");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    document.title = "TRUVI — Project Map";
    api
      .get("/inventory")
      .then((res) => setProjects(res.data.projects ?? []))
      .catch((err: any) => toast.error(err?.response?.data?.error || "Failed to load projects"))
      .finally(() => setLoading(false));
  }, []);

  const pinned = useMemo(
    () => projects.filter((p) => typeof (p as any).lat === "number" && typeof (p as any).lng === "number"),
    [projects],
  );

  // Init map once.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, { center: DEFAULT_CENTER, zoom: 11 });
    L.tileLayer(DARK_TILES, { attribution: TILE_ATTRIBUTION, maxZoom: 19 }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  // (Re)draw markers whenever data or metric changes.
  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    if (pinned.length === 0) return;

    const values = pinned.map((p) => metricValue(p, metric));
    const max = Math.max(...values, 1);

    const bounds: [number, number][] = [];
    for (const p of pinned) {
      const lat = (p as any).lat as number;
      const lng = (p as any).lng as number;
      const v = metricValue(p, metric);
      const t = v / max;
      bounds.push([lat, lng]);
      const marker = L.circleMarker([lat, lng], {
        radius: 10 + t * 14,
        color: heatColor(t),
        weight: 2,
        fillColor: heatColor(t),
        fillOpacity: 0.45,
      }).addTo(layer);
      marker.bindPopup(
        `<div style="min-width:190px;font-family:inherit">
           <b style="font-size:13px">${p.name}</b><br/>
           <span style="font-size:11px;opacity:.75">${p.location}, ${p.city}</span><br/>
           <span style="font-size:11px">
             ${p.minRate ? `₹${p.minRate.toLocaleString("en-IN")}/sq ft · ` : ""}
             ${p.unitCount ? `${p.unitCount} units · ` : ""}
             ${(p.viewCount ?? 0).toLocaleString("en-IN")} views
           </span><br/>
           <a href="/inventory/${p._id}/presentation" style="font-size:11px;color:#38BDF8">Open project →</a>
         </div>`,
      );
    }
    if (bounds.length > 0) map.fitBounds(bounds, { padding: [48, 48], maxZoom: 14 });
  }, [pinned, metric]);

  return (
    <div className="min-h-screen text-white">
      <SiteNav />
      <main className="mx-auto max-w-7xl px-4 pb-10 pt-24 md:px-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 font-display text-2xl font-semibold">
              <MapIcon size={22} className="text-emerald-300" /> Project Map
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Live map of verified inventory — marker size &amp; colour show the selected metric.
            </p>
          </div>
          <div className="flex gap-1 rounded-full border border-white/10 bg-white/5 p-0.5">
            {METRICS.map((m) => (
              <button
                key={m.key}
                onClick={() => setMetric(m.key)}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-medium transition ${metric === m.key ? "bg-violet-500 text-white" : "text-white/60 hover:text-white"}`}
              >
                {m.icon} {m.label}
              </button>
            ))}
          </div>
        </div>

        <div className="relative mt-4">
          <div ref={containerRef} className="h-[62vh] w-full overflow-hidden rounded-2xl border border-white/10" />
          {/* Legend */}
          <div className="absolute bottom-4 left-4 z-[1000] rounded-xl border border-white/10 bg-[#0a0d14]/90 px-3 py-2 backdrop-blur">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-white/60">
              {METRICS.find((m) => m.key === metric)?.label}
            </p>
            <div className="mt-1.5 flex items-center gap-1">
              <span className="text-[9px] text-white/40">low</span>
              {RAMP.map((c) => <span key={c} className="h-2 w-6 first:rounded-l-full last:rounded-r-full" style={{ background: c }} />)}
              <span className="text-[9px] text-white/40">high</span>
            </div>
          </div>
        </div>

        {loading ? (
          <p className="mt-4 text-sm text-muted-foreground">Loading projects…</p>
        ) : pinned.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-white/10 glass p-6 text-sm text-muted-foreground">
            No projects have a map pin yet. Developers and admins can drop a pin from the project's
            <b className="text-white/80"> Project Details</b> editor — pinned projects appear here instantly.
          </div>
        ) : (
          <p className="mt-3 text-xs text-muted-foreground">
            {pinned.length} of {projects.length} live project{projects.length === 1 ? "" : "s"} pinned ·{" "}
            <Link to="/inventory" className="text-sky-300 hover:underline">Browse as listings →</Link>
          </p>
        )}
      </main>
    </div>
  );
}

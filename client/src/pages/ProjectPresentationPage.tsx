import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "@/lib/api";
import { toast } from "sonner";
import {
  ArrowLeft, Building2, MapPin, ShieldCheck, FingerprintPattern, Video, Flame, Leaf, Box, Eye,
  Home, FileText, Download, X, ZoomIn, ZoomOut, ChevronLeft, ChevronRight, Camera,
} from "lucide-react";
import { LayoutGrid, CalendarClock } from "lucide-react";
import { ASSET_SECTIONS, categoryLabel, PROJECT_TYPE_LABELS } from "@/lib/assetCategories";
import { formatINR } from "@/lib/utils";
import PublicLegalDocs from "@/components/PublicLegalDocs";
import ShareProjectButton from "@/components/ShareProjectButton";
import NearbyAmenities from "@/components/NearbyAmenities";
import type { Project, ProjectAsset } from "@/types";

function fmtDate(v?: string | null): string | null {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d.toLocaleDateString("en-IN", { month: "short", year: "numeric" });
}

const IMAGE_MIMES = /^image\//;
const VIDEO_MIMES = /^video\//;

interface PresentationUnit {
  _id: string;
  unitNumber: string;
  type: string;
  areaSqft: number;
  price: number;
  status: "AVAILABLE" | "LOCKED" | "RESERVED" | "SOLD";
}
interface UnitSummary {
  total: number;
  available: number;
  byType: Record<string, number>;
}

const UNIT_STATUS_META: Record<PresentationUnit["status"], { label: string; cls: string }> = {
  AVAILABLE: { label: "Available", cls: "bg-green-900/40 text-green-300 border-green-700/60" },
  LOCKED: { label: "On hold", cls: "bg-amber-900/40 text-amber-300 border-amber-700/60" },
  RESERVED: { label: "Reserved", cls: "bg-sky-900/40 text-sky-300 border-sky-700/60" },
  SOLD: { label: "Sold", cls: "bg-white/10 text-muted-foreground border-white/15" },
};

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/* ── Zoomable lightbox for drawings/plans/images ─────────────────────────── */
function Lightbox({
  images, index, onClose, onNavigate,
}: {
  images: ProjectAsset[];
  index: number;
  onClose: () => void;
  onNavigate: (i: number) => void;
}) {
  const [zoom, setZoom] = useState(1);
  const asset = images[index];

  useEffect(() => setZoom(1), [index]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && index > 0) onNavigate(index - 1);
      if (e.key === "ArrowRight" && index < images.length - 1) onNavigate(index + 1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, images.length, onClose, onNavigate]);

  if (!asset) return null;

  return (
    <div className="fixed inset-0 z-[110] flex flex-col bg-black/90 backdrop-blur-sm">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 p-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-white truncate">{asset.title}</p>
          <p className="text-xs text-muted-foreground">{categoryLabel(asset.category)}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={() => setZoom((z) => Math.max(0.5, z - 0.5))} title="Zoom out" className="rounded-lg border border-white/20 p-2 text-white hover:bg-white/10">
            <ZoomOut size={15} />
          </button>
          <span className="text-xs text-muted-foreground w-10 text-center">{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom((z) => Math.min(4, z + 0.5))} title="Zoom in" className="rounded-lg border border-white/20 p-2 text-white hover:bg-white/10">
            <ZoomIn size={15} />
          </button>
          <a href={asset.fileUrl} download target="_blank" rel="noreferrer" title="Download" className="rounded-lg border border-white/20 p-2 text-white hover:bg-white/10">
            <Download size={15} />
          </a>
          <button onClick={onClose} title="Close" className="rounded-lg border border-white/20 p-2 text-white hover:bg-white/10">
            <X size={15} />
          </button>
        </div>
      </div>

      {/* Image viewport — scrollable when zoomed */}
      <div className="flex-1 overflow-auto flex items-center justify-center p-4" onClick={onClose}>
        <img
          src={asset.fileUrl}
          alt={asset.title}
          onClick={(e) => e.stopPropagation()}
          className="transition-transform duration-200 select-none max-h-full"
          style={{ transform: `scale(${zoom})`, transformOrigin: "center center", cursor: zoom > 1 ? "grab" : "zoom-in" }}
          onDoubleClick={() => setZoom((z) => (z >= 2 ? 1 : z + 1))}
        />
      </div>

      {/* Prev / next */}
      {index > 0 && (
        <button onClick={() => onNavigate(index - 1)} className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full border border-white/20 bg-black/50 p-2.5 text-white hover:bg-white/10">
          <ChevronLeft size={18} />
        </button>
      )}
      {index < images.length - 1 && (
        <button onClick={() => onNavigate(index + 1)} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full border border-white/20 bg-black/50 p-2.5 text-white hover:bg-white/10">
          <ChevronRight size={18} />
        </button>
      )}
    </div>
  );
}

/* ── Feature chip list (amenities, security, fire safety, …) ─────────────── */
function FeatureBlock({
  icon, title, items, note,
}: {
  icon: React.ReactNode;
  title: string;
  items?: string[];
  note?: string;
}) {
  if ((!items || items.length === 0) && !note) return null;
  return (
    <div className="rounded-2xl border border-white/10 glass p-5">
      <p className="flex items-center gap-2 text-sm font-semibold text-white">
        <span className="text-[var(--trust)]">{icon}</span>
        {title}
      </p>
      {items && items.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {items.map((item) => (
            <span key={item} className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-foreground/90">
              {item}
            </span>
          ))}
        </div>
      )}
      {note && <p className="mt-3 text-sm text-muted-foreground">{note}</p>}
    </div>
  );
}

/* ── Main page ────────────────────────────────────────────────────────────── */
export default function ProjectPresentationPage() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [assets, setAssets] = useState<ProjectAsset[]>([]);
  const [units, setUnits] = useState<PresentationUnit[]>([]);
  const [unitSummary, setUnitSummary] = useState<UnitSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [lightbox, setLightbox] = useState<{ images: ProjectAsset[]; index: number } | null>(null);

  useEffect(() => {
    api
      .get(`/presentation/${id}`)
      .then((res) => {
        setProject(res.data.project);
        setAssets(res.data.assets);
        setUnits(res.data.units ?? []);
        setUnitSummary(res.data.unitSummary ?? null);
      })
      .catch((err: any) => toast.error(err?.response?.data?.error || "Failed to load presentation"))
      .finally(() => setLoading(false));
    // Count this visit (fire-and-forget).
    api.post(`/inventory/${id}/view`).catch(() => null);
  }, [id]);

  const bySection = useMemo(() => {
    const map = new Map<string, ProjectAsset[]>();
    for (const section of ASSET_SECTIONS) {
      const catValues = section.categories.map((c) => c.value);
      const items = assets.filter((a) => catValues.includes(a.category));
      if (items.length > 0) map.set(section.key, items);
    }
    return map;
  }, [assets]);

  if (loading) return <div className="min-h-screen p-10 text-white">Loading presentation…</div>;
  if (!project) {
    return (
      <main className="min-h-screen p-10 text-white">
        <p className="text-muted-foreground">Presentation not found.</p>
        <Link to="/inventory" className="mt-3 inline-block text-sm text-blue-400 hover:underline">← Back to Inventory</Link>
      </main>
    );
  }

  const devName = typeof project.developerId === "object" ? (project.developerId as any).name : null;
  const info = project.presentationInfo;

  function openLightbox(images: ProjectAsset[], asset: ProjectAsset) {
    setLightbox({ images, index: images.indexOf(asset) });
  }

  function renderAsset(asset: ProjectAsset, sectionImages: ProjectAsset[]) {
    if (IMAGE_MIMES.test(asset.mimeType)) {
      return (
        <button
          key={asset._id}
          onClick={() => openLightbox(sectionImages, asset)}
          className="group relative overflow-hidden rounded-xl border border-white/10 text-left"
          title="Click to view & zoom"
        >
          <img src={asset.fileUrl} alt={asset.title} loading="lazy" className="aspect-[4/3] w-full object-cover transition-transform duration-300 group-hover:scale-105" />
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent p-3 pt-8">
            <p className="text-xs font-medium text-white truncate">{asset.title}</p>
            <p className="text-[10px] text-white/60">{categoryLabel(asset.category)}</p>
          </div>
          <span className="absolute right-2 top-2 rounded-full bg-black/50 p-1.5 text-white opacity-0 transition-opacity group-hover:opacity-100">
            <ZoomIn size={13} />
          </span>
        </button>
      );
    }
    if (VIDEO_MIMES.test(asset.mimeType)) {
      return (
        <div key={asset._id} className="overflow-hidden rounded-xl border border-white/10">
          <video controls preload="metadata" className="aspect-video w-full bg-black">
            <source src={asset.fileUrl} type={asset.mimeType} />
          </video>
          <div className="p-3">
            <p className="text-xs font-medium text-white truncate">{asset.title}</p>
            <p className="text-[10px] text-muted-foreground">{categoryLabel(asset.category)}</p>
          </div>
        </div>
      );
    }
    // Non-visual: downloadable card
    return (
      <a
        key={asset._id}
        href={asset.fileUrl}
        download={asset.fileName}
        target="_blank"
        rel="noreferrer"
        className="flex items-center gap-3 rounded-xl border border-white/10 glass p-4 hover:border-blue-500/50 transition-colors"
      >
        <FileText size={20} className="text-blue-400 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-white truncate">{asset.title}</p>
          <p className="text-[11px] text-muted-foreground truncate">
            {categoryLabel(asset.category)} · {asset.fileName} · {formatSize(asset.sizeBytes)}
          </p>
        </div>
        <Download size={15} className="text-muted-foreground shrink-0" />
      </a>
    );
  }

  return (
    <main className="min-h-screen p-6 text-white md:p-10 pb-28">
      {lightbox && (
        <Lightbox
          images={lightbox.images}
          index={lightbox.index}
          onClose={() => setLightbox(null)}
          onNavigate={(i) => setLightbox((lb) => (lb ? { ...lb, index: i } : lb))}
        />
      )}

      <Link to="/inventory" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-white transition-colors">
        <ArrowLeft size={14} /> Back to Inventory
      </Link>

      {/* Header */}
      <div className="mt-4 flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-display font-semibold tracking-tight">{project.name}</h1>
          {project.projectType && (
            <span className="rounded-full border border-[var(--trust)]/50 bg-[var(--trust)]/15 px-3 py-1 text-xs font-medium text-[var(--trust)]">
              {PROJECT_TYPE_LABELS[project.projectType] ?? project.projectType}
            </span>
          )}
          {project.isVerified && (
            <span className="inline-flex items-center gap-1 rounded-full bg-green-900/40 px-2.5 py-1 text-xs font-medium text-green-400 border border-green-800">
              <ShieldCheck size={12} /> Verified
            </span>
          )}
        </div>
        <p className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
          <MapPin size={13} /> {project.location}, {project.city}
          {devName && <span className="ml-2 inline-flex items-center gap-1.5"><Building2 size={13} /> by {devName}</span>}
          {project.possessionDate && (
            <span className="ml-2 inline-flex items-center gap-1.5 text-emerald-300">
              <CalendarClock size={13} /> Possession:{" "}
              {new Date(project.possessionDate).toLocaleDateString("en-IN", { month: "short", year: "numeric" })}
            </span>
          )}
          <span className="ml-2 inline-flex items-center gap-1.5">
            <Eye size={13} /> {(project.viewCount ?? 0).toLocaleString("en-IN")} views
          </span>
        </p>
        <p className="max-w-3xl text-sm text-foreground/90">{project.description}</p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <Link
            to={`/inventory/${project._id}/3d`}
            className="inline-flex w-fit items-center gap-2 rounded-full border border-violet-400/30 bg-violet-500/10 px-5 py-2.5 text-sm font-medium text-violet-200 transition-all hover:border-violet-400/60 hover:bg-violet-500/20 hover:shadow-[0_0_24px_rgba(139,92,246,0.2)]"
          >
            <Box size={15} /> View in 3D — explore the property interactively
          </Link>
          <ShareProjectButton
            project={project}
            className="inline-flex w-fit items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-5 py-2.5 text-sm font-medium text-emerald-200 transition-all hover:border-emerald-400/60 hover:bg-emerald-500/20 hover:shadow-[0_0_24px_rgba(16,185,129,0.2)]"
          />
        </div>
      </div>

      {/* Features & facilities */}
      {(info || project.projectType) && (
        <section className="mt-8">
          <h2 className="text-lg font-medium">Features, Security & Facilities</h2>
          <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <FeatureBlock icon={<Home size={15} />} title="Amenities & Facilities" items={info?.amenities} />
            <FeatureBlock icon={<FingerprintPattern size={15} />} title="Security Systems" items={info?.securityFeatures} />
            <FeatureBlock icon={<Camera size={15} />} title="Smart Home Features" items={info?.smartHomeFeatures} />
            <FeatureBlock icon={<Flame size={15} />} title="Fire Safety Systems" items={info?.fireSafetySystems} />
            <FeatureBlock icon={<Leaf size={15} />} title="Green Building Features" items={info?.greenBuildingFeatures} />
            <FeatureBlock icon={<MapPin size={15} />} title="Location & Connectivity" note={info?.connectivityNotes} />
          </div>
          {info?.constructionProgressNote && (
            <div className="mt-4 rounded-2xl border border-amber-500/30 bg-amber-900/10 p-5">
              <p className="flex items-center gap-2 text-sm font-semibold text-amber-300">
                <Video size={15} /> Latest Construction Progress
              </p>
              <p className="mt-2 text-sm text-foreground/90">{info.constructionProgressNote}</p>
            </div>
          )}
        </section>
      )}

      {/* Nearby amenities — only when the developer/admin has curated real ones */}
      {info?.nearbyAmenities && info.nearbyAmenities.length > 0 && (
        <section className="mt-8">
          <NearbyAmenities projectId={project._id} amenities={info.nearbyAmenities} />
        </section>
      )}

      {/* Possession · Payment plans · Offers · Sales contact (developer-entered) */}
      {(fmtDate(project.possessionDate) || info?.paymentPlans?.length || info?.offers || project.salesContact?.phone || project.salesContact?.name) && (
        <section className="mt-8 grid gap-4 sm:grid-cols-2">
          {fmtDate(project.possessionDate) && (
            <div className="rounded-2xl border border-white/10 glass p-4">
              <p className="text-xs uppercase tracking-widest text-muted-foreground">Possession</p>
              <p className="mt-1 text-lg font-semibold text-white">{fmtDate(project.possessionDate)}</p>
            </div>
          )}
          {!!info?.paymentPlans?.length && (
            <div className="rounded-2xl border border-white/10 glass p-4">
              <p className="text-xs uppercase tracking-widest text-muted-foreground">Payment Plans</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {info.paymentPlans.map((pl, i) => (
                  <span key={i} className="rounded-full border border-white/12 bg-white/5 px-3 py-1 text-xs text-white/85">{pl}</span>
                ))}
              </div>
            </div>
          )}
          {info?.offers && (
            <div className="rounded-2xl border border-emerald-500/25 bg-emerald-900/10 p-4">
              <p className="text-xs uppercase tracking-widest text-emerald-300">Current Offers</p>
              <p className="mt-1 text-sm text-foreground/90">{info.offers}</p>
            </div>
          )}
          {(project.salesContact?.name || project.salesContact?.phone || project.salesContact?.email) && (
            <div className="rounded-2xl border border-white/10 glass p-4">
              <p className="text-xs uppercase tracking-widest text-muted-foreground">Sales Contact</p>
              {project.salesContact?.name && <p className="mt-1 text-sm font-medium text-white">{project.salesContact.name}</p>}
              {project.salesContact?.phone && <a href={`tel:${project.salesContact.phone}`} className="block text-sm text-sky-300">{project.salesContact.phone}</a>}
              {project.salesContact?.email && <a href={`mailto:${project.salesContact.email}`} className="block text-sm text-sky-300">{project.salesContact.email}</a>}
            </div>
          )}
        </section>
      )}

      <PublicLegalDocs projectId={project._id} />

      {/* Plots & availability */}
      {units.length > 0 && (
        <section className="mt-10">
          <h2 className="flex items-center gap-2 text-lg font-medium">
            <LayoutGrid size={17} className="text-[var(--trust)]" />
            Plots & Availability <span className="text-xs text-muted-foreground">({units.length})</span>
          </h2>

          {unitSummary && (
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-foreground/90">
                Total: <span className="font-semibold text-white">{unitSummary.total}</span>
              </span>
              <span className="rounded-full border border-green-700/60 bg-green-900/30 px-3 py-1 text-xs text-green-300">
                Available: <span className="font-semibold">{unitSummary.available}</span>
              </span>
              {Object.entries(unitSummary.byType).map(([type, count]) => (
                <span key={type} className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-foreground/90">
                  {type}: <span className="font-semibold text-white">{count}</span>
                </span>
              ))}
            </div>
          )}

          <div className="mt-4 overflow-x-auto rounded-2xl border border-white/10 glass">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Plot</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">Area (sq.ft)</th>
                  <th className="px-4 py-3 font-medium">Price</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {units.map((u) => {
                  const meta = UNIT_STATUS_META[u.status];
                  return (
                    <tr key={u._id} className="border-b border-white/5 last:border-0">
                      <td className="px-4 py-3 font-medium text-white">{u.unitNumber}</td>
                      <td className="px-4 py-3 text-foreground/90">{u.type}</td>
                      <td className="px-4 py-3 text-foreground/90">{u.areaSqft.toLocaleString("en-IN")}</td>
                      <td className="px-4 py-3 text-foreground/90">{formatINR(u.price)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${meta.cls}`}>
                          {meta.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Asset sections */}
      {ASSET_SECTIONS.map((section) => {
        const items = bySection.get(section.key);
        if (!items) return null;
        const sectionImages = items.filter((a) => IMAGE_MIMES.test(a.mimeType));
        return (
          <section key={section.key} className="mt-10">
            <h2 className="text-lg font-medium">
              {section.title} <span className="text-xs text-muted-foreground">({items.length})</span>
            </h2>
            <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {items.map((asset) => renderAsset(asset, sectionImages))}
            </div>
          </section>
        );
      })}

      {assets.length === 0 && units.length === 0 && (
        <div className="mt-10 rounded-2xl border border-white/10 glass p-10 text-center">
          <p className="text-sm text-muted-foreground">
            No presentation materials have been published for this project yet.
          </p>
        </div>
      )}
    </main>
  );
}

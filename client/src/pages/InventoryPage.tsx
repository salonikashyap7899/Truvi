import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { api } from "@/lib/api";
import { toast } from "sonner";
import {
  Search, Star, ShieldCheck, MapPin, ArrowRight, Building2, Share2, Heart,
  MessageCircle, SlidersHorizontal, X, Eye,
} from "lucide-react";
import VisitorGateModal from "@/components/VisitorGateModal";
import { shareProject } from "@/components/ShareProjectButton";
import { SiteNav } from "@/components/SiteNav";
import { formatCompactINR } from "@/lib/utils";
import type { Project, ProjectType } from "@/types";
import { useAuth } from "@/hooks/useAuth";

const WA_NUMBER = "919196366358";

/* ── Category chips (mapped to the project's type) ─────────────────────────── */
type CategoryKey = "ALL" | "SAVED" | "APARTMENT" | "VILLA" | "PLOT" | "COMMERCIAL" | "LAND";

const CATEGORIES: { key: CategoryKey; label: string }[] = [
  { key: "ALL", label: "All" },
  { key: "SAVED", label: "Saved" },
  { key: "APARTMENT", label: "Apartments" },
  { key: "VILLA", label: "Villas" },
  { key: "PLOT", label: "Plots" },
  { key: "COMMERCIAL", label: "Commercial" },
  { key: "LAND", label: "Land" },
];

function matchesCategory(type: ProjectType | undefined, cat: CategoryKey): boolean {
  if (cat === "ALL" || cat === "SAVED") return true;
  const t = type ?? "";
  switch (cat) {
    case "APARTMENT": return t === "APARTMENT" || t === "RESIDENTIAL" || t === "MIXED";
    case "VILLA": return t === "VILLA";
    case "PLOT": return t === "PLOTTED";
    case "COMMERCIAL": return t === "COMMERCIAL" || t === "INDUSTRIAL";
    case "LAND": return t === "LAND";
    default: return true;
  }
}

const TYPE_LABEL: Record<string, string> = {
  APARTMENT: "Apartment", VILLA: "Villa", PLOTTED: "Plot", COMMERCIAL: "Commercial",
  INDUSTRIAL: "Industrial", LAND: "Land", MIXED: "Mixed-use", RESIDENTIAL: "Residential",
};

type SortKey = "RECOMMENDED" | "PRICE_LOW" | "PRICE_HIGH" | "TRUST";
const SORTS: { key: SortKey; label: string }[] = [
  { key: "RECOMMENDED", label: "Recommended" },
  { key: "PRICE_LOW", label: "Price: Low to High" },
  { key: "PRICE_HIGH", label: "Price: High to Low" },
  { key: "TRUST", label: "Trust Score" },
];

/* ── Shortlist (per-device, localStorage) ──────────────────────────────────── */
const SHORTLIST_KEY = "truvi-shortlist";
function loadShortlist(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(SHORTLIST_KEY) || "[]"));
  } catch {
    return new Set();
  }
}

const CATEGORY_KEYS = new Set<CategoryKey>(["ALL", "SAVED", "APARTMENT", "VILLA", "PLOT", "COMMERCIAL", "LAND"]);

export default function InventoryPage() {
  const [params] = useSearchParams();
  const initialCat = params.get("cat") as CategoryKey | null;
  const [projects, setProjects] = useState<Project[]>([]);
  const [search, setSearch] = useState(() => params.get("q") ?? "");
  const [category, setCategory] = useState<CategoryKey>(
    initialCat && CATEGORY_KEYS.has(initialCat) ? initialCat : "ALL",
  );
  const [sort, setSort] = useState<SortKey>("RECOMMENDED");
  const [loading, setLoading] = useState(true);
  const [showGate, setShowGate] = useState(false);
  const [saved, setSaved] = useState<Set<string>>(loadShortlist);
  const { user } = useAuth();

  useEffect(() => {
    document.title = "TRUVI — Inventory";
    api
      .get("/inventory")
      .then((res) => setProjects(res.data.projects))
      .catch((err: any) => toast.error(err?.response?.data?.error || "Failed to load inventory"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!user && localStorage.getItem("truvi-welcome-seen")) {
      const t = setTimeout(() => setShowGate(true), 800);
      return () => clearTimeout(t);
    }
  }, [user]);

  const toggleSaved = (id: string) => {
    setSaved((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try { localStorage.setItem(SHORTLIST_KEY, JSON.stringify([...next])); } catch { /* ignore */ }
      return next;
    });
  };

  const priceOf = (p: Project) => p.minPrice ?? (p.minRate ? p.minRate * 1000 : Number.POSITIVE_INFINITY);

  const results = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = projects.filter((p) => {
      if (q && !(p.name.toLowerCase().includes(q) || p.city.toLowerCase().includes(q) || p.location.toLowerCase().includes(q))) return false;
      if (category === "SAVED") return saved.has(p._id);
      return matchesCategory(p.projectType, category);
    });
    list = [...list].sort((a, b) => {
      if (sort === "PRICE_LOW") return priceOf(a) - priceOf(b);
      if (sort === "PRICE_HIGH") return priceOf(b) - priceOf(a);
      if (sort === "TRUST") return (b.trustScore ?? 0) - (a.trustScore ?? 0);
      // Recommended: Prime first, then trust score
      if (a.isPrimeListing && !b.isPrimeListing) return -1;
      if (!a.isPrimeListing && b.isPrimeListing) return 1;
      return (b.trustScore ?? 0) - (a.trustScore ?? 0);
    });
    return list;
  }, [projects, search, category, sort, saved]);

  return (
    <>
      {showGate && !user && <VisitorGateModal onClose={() => setShowGate(false)} />}

      <SiteNav />

      <main
        className="min-h-screen px-4 pb-28 text-white sm:px-6 md:px-10"
        style={{ paddingTop: "calc(7rem + env(safe-area-inset-top, 0px))" }}
      >
        {/* ── Header + search ── */}
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="font-display text-3xl font-medium tracking-tight md:text-4xl">
            Find your <span className="text-gradient-trust">property</span>
          </h1>
          <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
            Verified, RERA-checked and trust-scored listings — search, shortlist and connect.
          </p>

          <div className="relative mx-auto mt-6 max-w-xl">
            <Search size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search city, locality or project…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-12 w-full rounded-full border border-white/12 bg-white/[0.05] pl-11 pr-11 text-sm text-white placeholder:text-white/30 outline-none backdrop-blur transition focus:border-[var(--trust)]/60 focus:shadow-[0_0_24px_rgba(59,130,246,0.15)]"
            />
            {search && (
              <button onClick={() => setSearch("")} aria-label="Clear search" className="absolute right-3 top-1/2 -translate-y-1/2 grid size-7 place-items-center rounded-full text-white/50 hover:bg-white/10">
                <X size={15} />
              </button>
            )}
          </div>
        </div>

        {/* ── Category chips ── */}
        <div className="mx-auto mt-6 max-w-7xl">
          <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {CATEGORIES.map((c) => {
              const active = category === c.key;
              const count = c.key === "SAVED" ? saved.size : undefined;
              return (
                <button
                  key={c.key}
                  onClick={() => setCategory(c.key)}
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-4 py-2 text-xs font-semibold transition ${
                    active
                      ? "border-[var(--trust)]/60 bg-[var(--trust)]/15 text-sky-200"
                      : "border-white/12 bg-white/[0.04] text-white/70 hover:bg-white/[0.08]"
                  }`}
                >
                  {c.key === "SAVED" && <Heart size={12} className={active ? "fill-sky-300 text-sky-300" : ""} />}
                  {c.label}
                  {count !== undefined && count > 0 && <span className="text-white/50">({count})</span>}
                </button>
              );
            })}
          </div>

          {/* Result count + sort */}
          <div className="mt-4 flex items-center justify-between gap-3">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              <span className="font-semibold text-white">{results.length}</span> propert{results.length !== 1 ? "ies" : "y"}
            </p>
            <label className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.04] px-3 py-1.5 text-xs text-white/80">
              <SlidersHorizontal size={13} className="text-white/50" />
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                className="bg-transparent outline-none [&>option]:bg-[#0a0d14]"
              >
                {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </label>
          </div>
        </div>

        {/* ── Results ── */}
        {loading ? (
          <div className="mt-20 flex flex-col items-center gap-3 text-muted-foreground">
            <div className="size-8 animate-spin rounded-full border-2 border-white/20 border-t-[var(--trust)]" />
            <p className="text-sm">Loading properties…</p>
          </div>
        ) : results.length === 0 ? (
          <p className="mt-16 text-center text-sm text-muted-foreground">
            {category === "SAVED" ? "No saved properties yet — tap the heart on a listing to save it." : "No properties match your search."}
          </p>
        ) : (
          <div className="mx-auto mt-6 grid max-w-7xl gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {results.map((project) => (
              <ListingCard
                key={project._id}
                project={project}
                isPrime={!!project.isPrimeListing}
                saved={saved.has(project._id)}
                onToggleSaved={() => toggleSaved(project._id)}
              />
            ))}
          </div>
        )}
      </main>
    </>
  );
}

/* ── Marketplace listing card (99acres / MagicBricks style, Truvi dark) ─────── */

function priceBadge(project: Project): string {
  if (project.minPrice) return formatCompactINR(project.minPrice);
  if (project.minRate) return `₹${project.minRate.toLocaleString("en-IN")}/sq ft`;
  return "Price on request";
}

function ListingCard({
  project, isPrime, saved, onToggleSaved,
}: {
  project: Project;
  isPrime: boolean;
  saved: boolean;
  onToggleSaved: () => void;
}) {
  const devName = typeof project.developerId === "object" ? (project.developerId as any).name : null;
  const typeLabel = project.projectType ? TYPE_LABEL[project.projectType] : null;
  const possessionYear = project.possessionDate ? new Date(project.possessionDate).getFullYear() : null;

  const waText = encodeURIComponent(
    `Hi Truvi Ventures, I'm interested in ${project.name} at ${project.location}, ${project.city}. Please share the details.`,
  );

  const frame = isPrime
    ? "linear-gradient(160deg, rgba(251,191,36,0.65), rgba(251,191,36,0.12) 45%, rgba(255,255,255,0.06) 85%)"
    : "linear-gradient(160deg, rgba(255,255,255,0.18), rgba(59,130,246,0.18) 45%, rgba(255,255,255,0.04) 85%)";

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className="group relative rounded-[22px] p-px transition-transform duration-300 hover:-translate-y-1"
      style={{ background: frame }}
    >
      <div className="overflow-hidden rounded-[21px] bg-[#0a0d14]">
        {/* Image → details */}
        <Link to={`/inventory/${project._id}/presentation`} className="block">
          <div className="relative aspect-[16/11] w-full overflow-hidden">
            {project.coverImageUrl ? (
              <img
                src={project.coverImageUrl}
                alt={project.name}
                loading="lazy"
                className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
              />
            ) : (
              <div className="grid h-full w-full place-items-center bg-gradient-to-br from-[#0f1830] via-[#0a0d14] to-[#131a2e]">
                <Building2 size={40} className="text-white/15" />
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/25" />

            {/* Top badges */}
            <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
              {isPrime && (
                <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-amber-400 to-yellow-300 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-black shadow-[0_4px_20px_rgba(251,191,36,0.35)]">
                  <Star size={9} fill="currentColor" /> Prime
                </span>
              )}
              {project.reraNumber && (
                <span className="inline-flex items-center rounded-full border border-white/20 bg-black/55 px-2.5 py-1 text-[10px] font-semibold text-white backdrop-blur">
                  RERA
                </span>
              )}
            </div>

            {/* Shortlist heart */}
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggleSaved(); }}
              title={saved ? "Remove from shortlist" : "Add to shortlist"}
              aria-label={saved ? "Remove from shortlist" : "Add to shortlist"}
              className="absolute right-3 top-3 z-10 grid size-9 place-items-center rounded-full border border-white/20 bg-black/50 text-white backdrop-blur transition hover:bg-black/70"
            >
              <Heart size={16} className={saved ? "fill-rose-400 text-rose-400" : ""} />
            </button>

            {/* Price + verified on the image */}
            <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-3">
              <span className="inline-flex items-center rounded-full bg-white/95 px-3 py-1 font-display text-sm font-bold text-[#0a0d14] shadow-lg">
                {priceBadge(project)}
              </span>
              {project.isVerified && (
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/30 bg-black/55 px-2.5 py-1 text-[11px] font-medium text-emerald-300 backdrop-blur">
                  <ShieldCheck size={11} /> Verified
                </span>
              )}
            </div>
          </div>

          {/* Body */}
          <div className="p-4">
            <div className="flex items-start justify-between gap-2">
              <h3 className="truncate font-display text-base font-semibold text-white">{project.name}</h3>
              {typeof project.trustScore === "number" && (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-400/25 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                  <Star size={9} /> {project.trustScore}
                </span>
              )}
            </div>
            <p className="mt-1 flex items-center gap-1.5 truncate text-xs text-white/65">
              <MapPin size={12} className="shrink-0" />
              <span className="truncate">{project.location}, {project.city}{devName ? ` · ${devName}` : ""}</span>
            </p>

            {/* Meta chips */}
            <div className="mt-2.5 flex flex-wrap gap-1.5 text-[11px] text-white/70">
              {typeLabel && <span className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-0.5">{typeLabel}</span>}
              {possessionYear && <span className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-0.5">Possession {possessionYear}</span>}
              {typeof project.unitCount === "number" && project.unitCount > 0 && (
                <span className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-0.5">{project.unitCount} units</span>
              )}
              {typeof project.viewCount === "number" && project.viewCount > 0 && (
                <span className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/[0.04] px-2 py-0.5"><Eye size={10} /> {project.viewCount}</span>
              )}
            </div>
          </div>
        </Link>

        {/* Actions row */}
        <div className="flex items-center gap-2 border-t border-white/8 p-3">
          <a
            href={`https://wa.me/${WA_NUMBER}?text=${waText}`}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-[var(--trust)] to-[#2563eb] py-2.5 text-xs font-semibold text-white transition hover:shadow-[0_0_22px_rgba(59,130,246,0.35)]"
          >
            <MessageCircle size={14} /> Contact
          </a>
          <Link
            to={`/inventory/${project._id}/presentation`}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-white/15 bg-white/[0.04] py-2.5 text-xs font-semibold text-white transition hover:bg-white/[0.08]"
          >
            View <ArrowRight size={13} />
          </Link>
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); shareProject(project); }}
            title="Share this property"
            aria-label="Share this property"
            className="grid size-10 shrink-0 place-items-center rounded-xl border border-white/15 bg-white/[0.04] text-white transition hover:bg-white/[0.08]"
          >
            <Share2 size={15} />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

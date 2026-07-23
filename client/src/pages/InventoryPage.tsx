import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Search, Star, ShieldCheck, MapPin, ArrowRight, Building2, Share2 } from "lucide-react";
import VisitorGateModal from "@/components/VisitorGateModal";
import { shareProject } from "@/components/ShareProjectButton";
import { SiteNav } from "@/components/SiteNav";
import { formatCompactINR } from "@/lib/utils";
import type { Project } from "@/types";
import { useAuth } from "@/hooks/useAuth";

export default function InventoryPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [showGate, setShowGate] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    document.title = "TRUVI — Inventory";
    api
      .get("/inventory")
      .then((res) => setProjects(res.data.projects))
      .catch((err: any) => toast.error(err?.response?.data?.error || "Failed to load inventory"))
      .finally(() => setLoading(false));
  }, []);

  // Purpose gate for unauthenticated visitors (after a short delay).
  useEffect(() => {
    if (!user && localStorage.getItem("truvi-welcome-seen")) {
      const t = setTimeout(() => setShowGate(true), 800);
      return () => clearTimeout(t);
    }
  }, [user]);

  const filtered = projects.filter(
    (p) =>
      search === "" ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.city.toLowerCase().includes(search.toLowerCase()) ||
      p.location.toLowerCase().includes(search.toLowerCase())
  );

  // Prime listing always leads
  const sorted = [...filtered].sort((a, b) => {
    if (a.isPrimeListing && !b.isPrimeListing) return -1;
    if (!a.isPrimeListing && b.isPrimeListing) return 1;
    return 0;
  });

  return (
    <>
      {showGate && !user && <VisitorGateModal onClose={() => setShowGate(false)} />}

      <SiteNav />

      <main className="min-h-screen px-4 pb-28 pt-28 text-white sm:px-6 md:px-10">
        {/* ── Hero header ── */}
        <div className="mx-auto max-w-3xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-1.5 text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
            <span className="size-1.5 rounded-full bg-[var(--trust)] animate-pulse" />
            Know the Property Before You Buy It
          </div>
          <h1 className="mt-5 font-display text-4xl font-medium tracking-tight md:text-5xl">
            The Truvi <span className="text-gradient-trust">Inventory</span>
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-sm text-muted-foreground md:text-base">
            A curated collection of verified listings — tap any property to see its full profile,
            evidence and intelligence.
          </p>

          {/* Search */}
          <div className="relative mx-auto mt-8 max-w-md">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by name, city or area…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-12 w-full rounded-full border border-white/12 bg-white/[0.05] pl-11 pr-5 text-sm text-white placeholder:text-white/30 outline-none backdrop-blur transition focus:border-[var(--trust)]/60 focus:shadow-[0_0_24px_rgba(59,130,246,0.15)]"
            />
          </div>

          <p className="mt-4 text-xs uppercase tracking-[0.2em] text-muted-foreground">
            <span className="font-semibold text-white">{projects.length}</span> verified listing{projects.length !== 1 ? "s" : ""}
          </p>
        </div>

        {/* ── Grid ── */}
        {loading ? (
          <div className="mt-20 flex flex-col items-center gap-3 text-muted-foreground">
            <div className="size-8 animate-spin rounded-full border-2 border-white/20 border-t-[var(--trust)]" />
            <p className="text-sm">Curating inventory…</p>
          </div>
        ) : sorted.length === 0 ? (
          <p className="mt-16 text-center text-sm text-muted-foreground">No listings found.</p>
        ) : (
          <div className="mx-auto mt-12 grid max-w-7xl gap-6 sm:grid-cols-2 xl:grid-cols-3">
            {sorted.map((project, idx) => (
              <ListingCard key={project._id} project={project} isPrime={project.isPrimeListing || idx === 0} />
            ))}
          </div>
        )}
      </main>
    </>
  );
}

/* ── Media-first listing card ─────────────────────────────────────────────────
   Image-forward: a large AI/developer-selected cover, a small price badge and
   just the name + location. Everything else (description, amenities, floor plans,
   videos, gallery, developer, payment plans, intelligence) lives on the details
   page, opened by tapping the card. */

function priceBadge(project: Project): string {
  if (project.minPrice) return formatCompactINR(project.minPrice);
  if (project.minRate) return `₹${project.minRate.toLocaleString("en-IN")}/sq ft`;
  return "Price on request";
}

function ListingCard({ project, isPrime }: { project: Project; isPrime: boolean }) {
  const devName = typeof project.developerId === "object" ? (project.developerId as any).name : null;

  const frame = isPrime
    ? "linear-gradient(160deg, rgba(251,191,36,0.65), rgba(251,191,36,0.12) 45%, rgba(255,255,255,0.06) 85%)"
    : "linear-gradient(160deg, rgba(255,255,255,0.18), rgba(59,130,246,0.18) 45%, rgba(255,255,255,0.04) 85%)";

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="group relative rounded-[24px] p-px transition-transform duration-300 hover:-translate-y-1"
      style={{ background: frame }}
    >
      <Link
        to={`/inventory/${project._id}/presentation`}
        className="block overflow-hidden rounded-[23px] bg-[#0a0d14]"
      >
        <div className="relative aspect-[4/5] w-full overflow-hidden">
          {/* Featured image (falls back to a branded gradient when none) */}
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

          {/* Readability gradient */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-black/30" />

          {/* Prime ribbon */}
          {isPrime && (
            <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-gradient-to-r from-amber-400 to-yellow-300 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.15em] text-black shadow-[0_4px_20px_rgba(251,191,36,0.35)]">
              <Star size={9} fill="currentColor" /> Prime
            </div>
          )}

          {/* Verified badge */}
          {project.isVerified && (
            <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full border border-emerald-400/30 bg-black/50 px-2.5 py-1 text-[11px] font-medium text-emerald-300 backdrop-blur">
              <ShieldCheck size={11} /> Verified
            </span>
          )}

          {/* Share — floats over the image, doesn't open the card */}
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              shareProject(project);
            }}
            title="Share this property"
            className="absolute bottom-3 right-3 z-10 grid size-10 place-items-center rounded-full border border-white/20 bg-black/50 text-white backdrop-blur transition hover:bg-black/70"
          >
            <Share2 size={16} />
          </button>

          {/* Bottom overlay: price + identity + tap hint */}
          <div className="absolute inset-x-0 bottom-0 p-4">
            <span className="inline-flex items-center rounded-full bg-white/95 px-3 py-1 font-display text-sm font-bold text-[#0a0d14] shadow-lg">
              {priceBadge(project)}
            </span>
            <h3 className="mt-2 truncate font-display text-lg font-semibold text-white">{project.name}</h3>
            <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-white/75">
              <MapPin size={12} className="shrink-0" />
              <span className="truncate">{project.location}, {project.city}{devName ? ` · ${devName}` : ""}</span>
            </p>
            <p className="mt-2 flex items-center gap-1 text-[11px] font-medium text-sky-300/90">
              Tap to view details <ArrowRight size={12} className="transition-transform group-hover:translate-x-0.5" />
            </p>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

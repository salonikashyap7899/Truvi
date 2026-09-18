import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Search, Building2, MapPin, Star, ShieldCheck, ArrowRight,
  TreePine, Heart, Navigation, type LucideIcon,
} from "lucide-react";
import { api } from "@/lib/api";
import { formatCompactINR } from "@/lib/utils";
import type { Project } from "@/types";

/**
 * App-only search-first home section, shown at the very top of the landing
 * page inside the installed app (the website is unaffected). Gives the app a
 * property-marketplace feel — search, category tiles and listing carousels —
 * while the full landing content (headings, videos, everything) stays below.
 */

const CATEGORY_TILES: { label: string; Icon: LucideIcon; to: string }[] = [
  { label: "Explore", Icon: Building2, to: "/inventory?cat=ALL" },
  { label: "Near Me", Icon: Navigation, to: "/inventory?near=1" },
  { label: "Plots", Icon: TreePine, to: "/inventory?cat=PLOT" },
  { label: "Saved", Icon: Heart, to: "/inventory?cat=SAVED" },
];

export default function AppHomeTop() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    let cancelled = false;
    api
      .get("/inventory")
      .then((res) => { if (!cancelled) setProjects((res.data.projects ?? []) as Project[]); })
      .catch(() => { if (!cancelled) setProjects([]); });
    return () => { cancelled = true; };
  }, []);

  const featured = useMemo(() => (projects ?? []).filter((p) => p.isPrimeListing).slice(0, 8), [projects]);
  const recommended = useMemo(
    () => [...(projects ?? [])].sort((a, b) => (b.trustScore ?? 0) - (a.trustScore ?? 0)).slice(0, 8),
    [projects],
  );

  const submitSearch = () => {
    const term = q.trim();
    navigate(term ? `/inventory?q=${encodeURIComponent(term)}` : "/inventory");
  };

  return (
    <section className="relative z-10 px-4 pt-24 pb-2">
      {/* Search */}
      <div className="relative">
        <Search size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") submitSearch(); }}
          placeholder="Search city, locality or project…"
          className="h-12 w-full rounded-full border border-white/12 bg-white/[0.06] pl-11 pr-4 text-sm text-white placeholder:text-white/35 outline-none backdrop-blur transition focus:border-[var(--trust)]/60"
        />
      </div>

      {/* Category tiles */}
      <div className="mt-4 flex justify-between gap-3">
        {CATEGORY_TILES.map((c) => (
          <Link
            key={c.label}
            to={c.to}
            className="flex flex-1 flex-col items-center gap-1.5"
          >
            <span
              className="grid h-16 w-full place-items-center rounded-2xl border border-sky-400/25 text-sky-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
              style={{ background: "linear-gradient(160deg, rgba(59,130,246,0.28), rgba(59,130,246,0.10))" }}
            >
              <c.Icon size={24} />
            </span>
            <span className="text-[12px] font-semibold text-white/85">{c.label}</span>
          </Link>
        ))}
      </div>

      <Carousel title="Recommended" items={recommended} projects={projects} />
      {featured.length > 0 && <Carousel title="Featured" items={featured} projects={projects} badge />}
    </section>
  );
}

function Carousel({
  title, items, projects, badge,
}: {
  title: string;
  items: Project[];
  projects: Project[] | null;
  badge?: boolean;
}) {
  return (
    <div className="mt-6">
      <div className="mb-2.5 flex items-center justify-between">
        <h2 className="font-display text-base font-semibold text-white">{title}</h2>
        <Link to="/inventory" className="flex items-center gap-1 text-xs font-medium text-sky-300">
          See all <ArrowRight size={13} />
        </Link>
      </div>

      {projects === null ? (
        <div className="flex gap-3 overflow-hidden">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-44 w-40 shrink-0 animate-pulse rounded-2xl bg-white/[0.05]" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-6 text-center text-xs text-white/45">
          No listings yet.
        </p>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {items.map((p) => <MiniCard key={p._id} project={p} showPrime={badge} />)}
        </div>
      )}
    </div>
  );
}

function MiniCard({ project, showPrime }: { project: Project; showPrime?: boolean }) {
  const price = project.minPrice
    ? formatCompactINR(project.minPrice)
    : project.minRate ? `₹${project.minRate.toLocaleString("en-IN")}/sq ft` : "On request";

  return (
    <Link
      to={`/inventory/${project._id}/presentation`}
      className="w-40 shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-[#0a0d14] transition active:scale-[0.98]"
    >
      <div className="relative h-24 w-full overflow-hidden bg-white/5">
        {project.coverImageUrl ? (
          <img src={project.coverImageUrl} alt={project.name} loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <div className="grid h-full w-full place-items-center text-white/20"><Building2 size={22} /></div>
        )}
        {showPrime && project.isPrimeListing && (
          <span className="absolute left-1.5 top-1.5 rounded-full bg-gradient-to-r from-amber-400 to-yellow-300 px-1.5 py-0.5 text-[8px] font-bold text-black">
            <Star size={7} className="mr-0.5 inline" fill="currentColor" />PRIME
          </span>
        )}
        {project.isVerified && (
          <span className="absolute right-1.5 top-1.5 grid size-5 place-items-center rounded-full bg-black/55 text-emerald-300 backdrop-blur">
            <ShieldCheck size={11} />
          </span>
        )}
      </div>
      <div className="p-2.5">
        <p className="truncate text-[13px] font-semibold text-white">{project.name}</p>
        <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-white/55">
          <MapPin size={10} className="shrink-0" />{project.city}
        </p>
        <div className="mt-1.5 flex items-center justify-between">
          <span className="text-[12px] font-bold text-white">{price}</span>
          {typeof project.trustScore === "number" && (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-emerald-300">
              <Star size={8} />{project.trustScore}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

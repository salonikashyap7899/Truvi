import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Search, Building2, MapPin, Star, ShieldCheck, ArrowRight,
} from "lucide-react";
import { api } from "@/lib/api";
import { formatCompactINR } from "@/lib/utils";
import type { Project } from "@/types";

/**
 * App-only search-first home section, shown at the very top of the landing
 * page inside the installed app (the website is unaffected). Gives the app a
 * property-marketplace feel — a search bar, an auto-playing banner of recent
 * projects and listing carousels.
 */

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

  // The banner cycles the latest projects — the inventory API already returns
  // them newest-first, so we just take the first few.
  const recent = useMemo(() => (projects ?? []).slice(0, 8), [projects]);

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
        <Search size={18} strokeWidth={2.2} className="pointer-events-none absolute left-4 top-1/2 z-10 -translate-y-1/2 text-[var(--trust)]" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") submitSearch(); }}
          placeholder="Search city, locality or project…"
          className="relative z-0 h-12 w-full rounded-full border border-white/12 bg-white/[0.06] pl-11 pr-4 text-sm text-white placeholder:text-white/35 outline-none backdrop-blur transition focus:border-[var(--trust)]/60"
        />
      </div>

      {/* Auto-playing, infinitely-looping banner of recent projects */}
      <BannerCarousel items={recent} loading={projects === null} />

      <Carousel title="Recommended" items={recommended} projects={projects} />
      {featured.length > 0 && <Carousel title="Featured" items={featured} projects={projects} badge />}
    </section>
  );
}

/**
 * Full-width hero banner that cycles through the most recent projects on its
 * own, forever. Auto-advances every few seconds, loops back to the start
 * seamlessly, pauses while the finger is down, and is swipeable.
 */
function BannerCarousel({ items, loading }: { items: Project[]; loading: boolean }) {
  const [i, setI] = useState(0);
  const n = items.length;
  const touch = useRef<{ x: number; active: boolean }>({ x: 0, active: false });
  const paused = useRef(false);

  // Keep the index valid if the list size changes.
  useEffect(() => { if (i >= n && n > 0) setI(0); }, [n, i]);

  // Auto-advance — infinite loop via modulo.
  useEffect(() => {
    if (n <= 1) return;
    const id = setInterval(() => {
      if (!paused.current) setI((p) => (p + 1) % n);
    }, 3800);
    return () => clearInterval(id);
  }, [n]);

  if (loading) {
    return <div className="mt-4 h-40 w-full animate-pulse rounded-3xl bg-white/[0.05]" />;
  }
  if (n === 0) return null;

  const go = (next: number) => setI(((next % n) + n) % n);

  return (
    <div className="mt-4">
      <div
        className="relative h-40 w-full overflow-hidden rounded-3xl border border-white/10 bg-[#0a0d14]"
        onTouchStart={(e) => { touch.current = { x: e.touches[0].clientX, active: true }; paused.current = true; }}
        onTouchEnd={(e) => {
          if (touch.current.active) {
            const dx = e.changedTouches[0].clientX - touch.current.x;
            if (dx < -40) go(i + 1);
            else if (dx > 40) go(i - 1);
          }
          touch.current.active = false;
          paused.current = false;
        }}
      >
        <div
          className="flex h-full transition-transform duration-500 ease-out"
          style={{ transform: `translateX(-${i * 100}%)` }}
        >
          {items.map((p) => (
            <Link
              key={p._id}
              to={`/inventory/${p._id}/presentation`}
              className="relative block h-full w-full shrink-0"
            >
              {p.coverImageUrl ? (
                <img src={p.coverImageUrl} alt={p.name} className="h-full w-full object-cover" />
              ) : (
                <div className="grid h-full w-full place-items-center bg-white/5 text-white/20"><Building2 size={30} /></div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="truncate text-base font-semibold text-white">{p.name}</p>
                  <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-white/70">
                    <MapPin size={11} className="shrink-0" />{p.city}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-[var(--trust)] px-3 py-1 text-xs font-bold text-white">
                  {p.minPrice ? formatCompactINR(p.minPrice) : p.minRate ? `₹${p.minRate.toLocaleString("en-IN")}/sq ft` : "View"}
                </span>
              </div>
            </Link>
          ))}
        </div>

        {/* Dots */}
        {n > 1 && (
          <div className="absolute inset-x-0 bottom-1.5 flex items-center justify-center gap-1.5">
            {items.map((_, idx) => (
              <button
                key={idx}
                onClick={(e) => { e.preventDefault(); go(idx); }}
                aria-label={`Go to slide ${idx + 1}`}
                className={`h-1.5 rounded-full transition-all ${idx === i ? "w-5 bg-white" : "w-1.5 bg-white/40"}`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
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

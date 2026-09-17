import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Building2, Sparkles, ShieldCheck, TrendingUp, ArrowRight, MapPin, Loader2, Star,
} from "lucide-react";
import { api } from "@/lib/api";
import { formatINR } from "@/lib/utils";
import { useAuthStore } from "@/store/authStore";
import { dashboardPath } from "@/lib/rolePaths";
import type { Project } from "@/types";

/**
 * The installed app's home screen. Instead of the marketing landing page, the
 * app opens onto a native-style home: a greeting, quick actions, and a live
 * feed of listings — so the app feels like an app, not a website in a wrapper.
 * Only shown in the native build (the web keeps the marketing landing page).
 */
export default function MobileHome() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const [projects, setProjects] = useState<Project[] | null>(null);

  useEffect(() => {
    document.title = "Truvi";
    let cancelled = false;
    api
      .get("/inventory")
      .then((res) => {
        if (!cancelled) setProjects((res.data.projects ?? []) as Project[]);
      })
      .catch(() => {
        if (!cancelled) setProjects([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const firstName = user?.name?.trim().split(/\s+/)[0];

  const actions = [
    { key: "explore", label: "Explore", sub: "Live listings", Icon: Building2, onPress: () => navigate("/inventory") },
    { key: "ask", label: "Ask Truvi", sub: "AI assistant", Icon: Sparkles, onPress: () => window.dispatchEvent(new Event("open-ask-truvi")) },
    { key: "invest", label: "Invest", sub: "Deploy capital", Icon: TrendingUp, onPress: () => navigate("/invest") },
    user
      ? { key: "dash", label: "Dashboard", sub: "Your workspace", Icon: ShieldCheck, onPress: () => navigate(dashboardPath(user)) }
      : { key: "signin", label: "Sign in", sub: "Access account", Icon: ShieldCheck, onPress: () => navigate("/login") },
  ];

  const featured = (projects ?? []).slice(0, 5);

  return (
    <div className="min-h-full bg-[#06090f] text-white">
      {/* Greeting header */}
      <header className="px-5 pt-6 pb-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-sky-300">Truvi</p>
        <h1 className="mt-1 font-display text-2xl font-semibold leading-tight">
          {firstName ? `Hi ${firstName},` : "Welcome to Truvi"}
        </h1>
        <p className="mt-1 text-sm text-white/60">
          {firstName ? "Here's what's live today." : "The trust layer for Indian real estate."}
        </p>
      </header>

      {/* Quick actions */}
      <section className="grid grid-cols-2 gap-3 px-5">
        {actions.map((a) => (
          <button
            key={a.key}
            onClick={a.onPress}
            className="flex flex-col items-start gap-2 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-left transition active:scale-[0.98]"
          >
            <span className="grid size-10 place-items-center rounded-xl bg-sky-500/15 text-sky-300">
              <a.Icon size={19} />
            </span>
            <span>
              <span className="block text-sm font-semibold text-white">{a.label}</span>
              <span className="block text-[11px] text-white/50">{a.sub}</span>
            </span>
          </button>
        ))}
      </section>

      {/* Trust strip */}
      <div className="mx-5 mt-4 flex items-center gap-2 rounded-2xl border border-emerald-400/15 bg-emerald-500/[0.07] px-4 py-3">
        <ShieldCheck size={16} className="shrink-0 text-emerald-300" />
        <p className="text-[12px] leading-snug text-emerald-100/80">
          Every project is RERA-checked, legally screened and trust-scored.
        </p>
      </div>

      {/* Live listings */}
      <section className="mt-6 px-5 pb-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-base font-semibold">Live listings</h2>
          <Link to="/inventory" className="flex items-center gap-1 text-xs font-medium text-sky-300">
            See all <ArrowRight size={13} />
          </Link>
        </div>

        {projects === null ? (
          <div className="flex items-center gap-2 py-8 text-sm text-white/50">
            <Loader2 size={15} className="animate-spin" /> Loading listings…
          </div>
        ) : featured.length === 0 ? (
          <p className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-6 text-center text-sm text-white/50">
            No listings available yet — check back soon.
          </p>
        ) : (
          <div className="space-y-3">
            {featured.map((p) => (
              <Link
                key={p._id}
                to={`/inventory/${p._id}/3d`}
                className="flex gap-3 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] p-2.5 transition active:scale-[0.99]"
              >
                <div className="relative size-20 shrink-0 overflow-hidden rounded-xl bg-white/5">
                  {p.coverImageUrl ? (
                    <img src={p.coverImageUrl} alt={p.name} className="size-full object-cover" loading="lazy" />
                  ) : (
                    <div className="grid size-full place-items-center text-white/25">
                      <Building2 size={22} />
                    </div>
                  )}
                  {p.isPrimeListing && (
                    <span className="absolute left-1 top-1 rounded-full bg-[#e8c877] px-1.5 py-0.5 text-[8px] font-bold text-[#231a05]">
                      PRIME
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1 py-0.5">
                  <p className="truncate font-semibold text-white">{p.name}</p>
                  <p className="mt-0.5 flex items-center gap-1 truncate text-[12px] text-white/55">
                    <MapPin size={11} className="shrink-0" />
                    {[p.location, p.city].filter(Boolean).join(", ")}
                  </p>
                  <div className="mt-1.5 flex items-center gap-2">
                    {p.minRate ? (
                      <span className="text-[13px] font-semibold text-white">
                        {formatINR(p.minRate)}<span className="text-[11px] font-normal text-white/45">/sq ft</span>
                      </span>
                    ) : (
                      <span className="text-[12px] text-white/45">Price on request</span>
                    )}
                    {typeof p.trustScore === "number" && (
                      <span className="ml-auto inline-flex items-center gap-1 rounded-full border border-emerald-400/25 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                        <Star size={9} /> {p.trustScore}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

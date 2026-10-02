import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useCountUp } from "@/lib/motion";

type Tone = "violet" | "emerald" | "amber" | "sky" | "rose" | "slate";

const TONE: Record<Tone, { ring: string; icon: string; glow: string }> = {
  violet: { ring: "border-violet-500/25", icon: "bg-violet-500/15 text-violet-300", glow: "from-violet-500/10" },
  emerald: { ring: "border-emerald-500/25", icon: "bg-emerald-500/15 text-emerald-300", glow: "from-emerald-500/10" },
  amber: { ring: "border-amber-500/25", icon: "bg-amber-500/15 text-amber-300", glow: "from-amber-500/10" },
  sky: { ring: "border-sky-500/25", icon: "bg-sky-500/15 text-sky-300", glow: "from-sky-500/10" },
  rose: { ring: "border-rose-500/25", icon: "bg-rose-500/15 text-rose-300", glow: "from-rose-500/10" },
  slate: { ring: "border-white/10", icon: "bg-white/10 text-white/70", glow: "from-white/5" },
};

export function TrendPill({ value, suffix = "%", label }: { value: number; suffix?: string; label?: string }) {
  const up = value >= 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
        up ? "bg-emerald-500/15 text-emerald-300" : "bg-rose-500/15 text-rose-300"
      )}
      title={label}
    >
      {up ? "▲" : "▼"} {Math.abs(value)}
      {suffix}
    </span>
  );
}

/**
 * Premium KPI tile — animated value, optional icon, trend pill and footnote.
 * `value` may be a number (count-up animated) or a preformatted string.
 */
export function StatCard({
  label,
  value,
  format,
  icon,
  tone = "violet",
  foot,
  trend,
  delay = 0,
  onClick,
  className,
}: {
  label: string;
  value: number | string;
  format?: (n: number) => string;
  icon?: ReactNode;
  tone?: Tone;
  foot?: ReactNode;
  trend?: { value: number; suffix?: string; label?: string };
  delay?: number;
  onClick?: () => void;
  className?: string;
}) {
  const numeric = typeof value === "number";
  const animated = useCountUp(numeric ? value : 0);
  const display = numeric ? (format ? format(animated) : Math.round(animated).toLocaleString("en-IN")) : value;
  const t = TONE[tone];

  return (
    <div
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } } : undefined}
      style={{ animationDelay: `${delay}ms` }}
      className={cn(
        "tv-lift tv-fade-up relative overflow-hidden rounded-2xl border bg-white/[0.03] p-4",
        t.ring,
        onClick && "cursor-pointer",
        className
      )}
    >
      <div className={cn("pointer-events-none absolute -right-6 -top-8 h-24 w-24 rounded-full bg-gradient-to-b to-transparent blur-2xl", t.glow)} />
      <div className="relative flex items-start justify-between gap-2">
        <p className="text-[11px] font-medium uppercase tracking-wide text-white/50">{label}</p>
        {icon && <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-lg", t.icon)}>{icon}</span>}
      </div>
      <p className="relative mt-2 font-display text-2xl font-semibold tabular-nums text-white">{display}</p>
      <div className="relative mt-1.5 flex items-center gap-2">
        {trend && <TrendPill value={trend.value} suffix={trend.suffix} label={trend.label} />}
        {foot && <span className="text-[11px] text-white/45">{foot}</span>}
      </div>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("tv-skeleton h-4 w-full", className)} />;
}

export function StatSkeletonGrid({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="mt-3 h-7 w-28" />
          <Skeleton className="mt-3 h-3 w-16" />
        </div>
      ))}
    </div>
  );
}

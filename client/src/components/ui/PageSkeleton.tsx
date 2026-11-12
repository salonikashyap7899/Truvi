import type { ReactNode } from "react";

function Shimmer({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`tv-skeleton ${className}`.trim()} />;
}

function SkeletonMetric({ wide = false }: { wide?: boolean }) {
  return (
    <div className="truvi-skeleton-metric">
      <Shimmer className="h-3 w-24" />
      <Shimmer className={`mt-4 h-7 ${wide ? "w-32" : "w-20"}`} />
      <Shimmer className="mt-3 h-3 w-28" />
    </div>
  );
}

function SkeletonPanel({ rows = 3 }: { rows?: number }) {
  return (
    <section className="truvi-skeleton-panel" aria-hidden="true">
      <Shimmer className="h-4 w-40" />
      <Shimmer className="mt-2 h-3 w-56 max-w-full" />
      <div className="mt-5 space-y-4">
        {Array.from({ length: rows }, (_, index) => (
          <div className="flex items-center gap-3" key={index}>
            <Shimmer className="h-9 w-9 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1">
              <Shimmer className="h-3 w-2/3" />
              <Shimmer className="mt-2 h-3 w-1/3" />
            </div>
            <Shimmer className="h-3 w-16" />
          </div>
        ))}
      </div>
    </section>
  );
}

export function RouteSkeleton() {
  return (
    <div className="truvi-page-skeleton" role="status" aria-label="Loading page" aria-busy="true">
      <div className="truvi-page-skeleton__top">
        <Shimmer className="h-7 w-28" />
        <div className="flex items-center gap-2">
          <Shimmer className="h-9 w-9 rounded-full" />
          <Shimmer className="h-9 w-9 rounded-full" />
        </div>
      </div>
      <main className="truvi-page-skeleton__body">
        <Shimmer className="h-8 w-64 max-w-[70%]" />
        <Shimmer className="mt-3 h-3 w-96 max-w-[90%]" />
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <SkeletonMetric /><SkeletonMetric /><SkeletonMetric /><SkeletonMetric />
        </div>
        <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-[1.4fr_1fr]">
          <SkeletonPanel rows={4} />
          <SkeletonPanel rows={4} />
        </div>
        <div className="mt-5"><SkeletonPanel rows={5} /></div>
      </main>
    </div>
  );
}

export function DashboardSkeleton({ variant = "content" }: { variant?: "content" | "admin" | "founder" | "employee" }) {
  const fullShell = variant !== "content";
  const isEmployee = variant === "employee";
  const brandLabel = isEmployee ? "TRUVI VENTURES" : "Truvi";
  const navRows = isEmployee ? 7 : 9;

  const content: ReactNode = (
    <div className="truvi-dashboard-skeleton__content" aria-hidden="true">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 flex-1">
          <Shimmer className="h-8 w-64 max-w-[80%]" />
          <Shimmer className="mt-3 h-3 w-80 max-w-[90%]" />
        </div>
        <Shimmer className="h-10 w-40 rounded-full" />
      </div>
      <div className="mt-7 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SkeletonMetric /><SkeletonMetric /><SkeletonMetric /><SkeletonMetric />
      </div>
      <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-[1.4fr_1fr]">
        <SkeletonPanel rows={4} />
        <SkeletonPanel rows={4} />
      </div>
      <div className="mt-5"><SkeletonPanel rows={5} /></div>
    </div>
  );

  if (!fullShell) {
    return <div className="truvi-dashboard-skeleton truvi-dashboard-skeleton--content" role="status" aria-label="Loading dashboard" aria-busy="true">{content}</div>;
  }

  return (
    <div className={`truvi-dashboard-skeleton truvi-dashboard-skeleton--${variant}`} role="status" aria-label={`Loading ${brandLabel} workspace`} aria-busy="true">
      <aside className="truvi-dashboard-skeleton__sidebar" aria-hidden="true">
        <div className="flex items-center gap-3">
          <Shimmer className="h-10 w-10 rounded-xl" />
          <div className="min-w-0 flex-1">
            <Shimmer className="h-4 w-28" />
            <Shimmer className="mt-2 h-2.5 w-20" />
          </div>
        </div>
        <div className="mt-10 space-y-5">
          {Array.from({ length: navRows }, (_, index) => (
            <div key={index} className="flex items-center gap-3">
              <Shimmer className="h-4 w-4 rounded" />
              <Shimmer className={`h-3 ${index % 3 === 0 ? "w-28" : "w-36"}`} />
            </div>
          ))}
        </div>
      </aside>
      <div className="truvi-dashboard-skeleton__main">
        <header className="truvi-dashboard-skeleton__toolbar" aria-hidden="true">
          <Shimmer className="h-9 w-9 rounded-lg" />
          <Shimmer className="h-10 min-w-0 max-w-xl flex-1 rounded-xl" />
          <Shimmer className="h-9 w-9 rounded-full" />
          <Shimmer className="h-9 w-9 rounded-full" />
        </header>
        {content}
      </div>
    </div>
  );
}

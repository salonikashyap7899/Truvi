/**
 * PriceFairnessMeter
 *
 * Real market price-fairness analysis isn't wired to a data source yet, so
 * instead of showing a fabricated over/under-priced verdict this renders an
 * honest "awaiting analysis" state. When a real locality price index is
 * connected (or an admin publishes an assessment), this component will show
 * the actual reading.
 */

interface PriceFairnessMeterProps {
  projectId: string;
  compact?: boolean;
}

export default function PriceFairnessMeter({ compact = false }: PriceFairnessMeterProps) {
  if (compact) {
    return (
      <div className="rounded-xl border border-white/10 glass px-3 py-2.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">Price Fairness</span>
          <span className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-xs font-semibold text-muted-foreground">
            Awaiting analysis
          </span>
        </div>
        <div className="mt-2 h-1.5 w-full rounded-full bg-white/5" />
      </div>
    );
  }

  return (
    <div className="w-full rounded-2xl border border-white/10 glass p-5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          Price Fairness Meter
        </p>
        <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-semibold text-muted-foreground">
          Awaiting analysis
        </span>
      </div>
      <div className="mt-4 h-3 w-full rounded-full bg-white/5" />
      <p className="mt-3 border-t border-white/10 pt-3 text-xs leading-relaxed text-muted-foreground">
        A price-fairness reading will appear once verified market and circle-rate data is available for this locality.
      </p>
    </div>
  );
}

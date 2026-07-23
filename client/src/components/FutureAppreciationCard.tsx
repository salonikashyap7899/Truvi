/**
 * FutureAppreciationCard
 *
 * A real appreciation forecast needs verified locality growth and historical
 * price data, which isn't wired to a data source yet. Rather than showing a
 * fabricated projection, this renders an honest "awaiting analysis" state.
 * When a real growth model (or an admin-published assessment) is connected,
 * this component will show the actual reading.
 */
import { TrendingUp } from "lucide-react";

interface FutureAppreciationCardProps {
  projectId: string;
}

export default function FutureAppreciationCard(_props: FutureAppreciationCardProps) {
  return (
    <div className="rounded-2xl border border-white/10 glass p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Future Appreciation
          </p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-muted-foreground">—</span>
            <span className="text-sm text-muted-foreground">over 5 yrs</span>
          </div>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-semibold text-muted-foreground">
          <TrendingUp size={12} />
          Awaiting analysis
        </span>
      </div>

      <p className="mt-4 border-t border-white/10 pt-3 text-xs leading-relaxed text-muted-foreground">
        A projected appreciation reading will appear once verified locality growth and historical price data is available for this property.
      </p>
    </div>
  );
}

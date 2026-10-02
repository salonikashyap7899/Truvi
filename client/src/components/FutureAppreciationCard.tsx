/**
 * FutureAppreciationCard
 *
 * Shows a Truvi-published appreciation forecast when an admin has set one on
 * the project. Until then it renders an honest "awaiting analysis" state
 * rather than a fabricated projection.
 */
import { TrendingUp } from "lucide-react";
import type { AppreciationForecast } from "@/types";

interface FutureAppreciationCardProps {
  projectId: string;
  forecast?: AppreciationForecast | null;
}

const OUTLOOK_COLOR: Record<NonNullable<AppreciationForecast["outlook"]>, string> = {
  Strong: "#22c55e",
  Moderate: "#3b82f6",
  Stable: "#9ca3af",
};

export default function FutureAppreciationCard({ forecast }: FutureAppreciationCardProps) {
  if (!forecast) {
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
          A projected appreciation reading will appear once Truvi publishes an assessment for this property.
        </p>
      </div>
    );
  }

  const { fiveYearPct, outlook, note } = forecast;
  const color = outlook ? OUTLOOK_COLOR[outlook] : "#3b82f6";
  const cagr = (((1 + fiveYearPct / 100) ** (1 / 5) - 1) * 100).toFixed(1);
  const sign = fiveYearPct >= 0 ? "+" : "";

  return (
    <div className="rounded-2xl border border-white/10 glass p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Future Appreciation
          </p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-3xl font-bold" style={{ color }}>
              {sign}{fiveYearPct}%
            </span>
            <span className="text-sm text-muted-foreground">over 5 yrs</span>
          </div>
          <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
            <span>
              CAGR <span className="font-semibold text-foreground/90">{cagr}%</span>
            </span>
            {outlook && (
              <>
                <span className="text-foreground/80">·</span>
                <span className="flex items-center gap-1">
                  <TrendingUp size={11} style={{ color }} />
                  <span style={{ color }}>{outlook} outlook</span>
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      <p className="mt-3 border-t border-white/10 pt-3 text-xs leading-relaxed text-muted-foreground">
        {note || "Truvi-published projection based on verified locality and market data."}
      </p>
    </div>
  );
}

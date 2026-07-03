import { TrendingUp } from "lucide-react";
import { AreaChart, Area, ResponsiveContainer, Tooltip } from "recharts";

interface FutureAppreciationCardProps {
  projectId: string;
}

interface AppreciationData {
  /** Total projected appreciation over 5 years, e.g. 38 = 38% */
  totalPct: number;
  /** Annualised CAGR */
  cagr: number;
  /** Horizon label */
  horizon: string;
  /** Year-by-year data for sparkline */
  points: { year: string; value: number }[];
  /** Qualitative outlook */
  outlook: "Strong" | "Moderate" | "Stable";
  outlookColor: string;
}

/** Derives consistent mock appreciation data from a project ID. */
function mockAppreciation(id: string): AppreciationData {
  const a = parseInt(id.slice(-6, -4) || "72", 16);
  const b = parseInt(id.slice(-4, -2) || "3f", 16);

  // totalPct: 18–52% over 5 years
  const totalPct = 18 + (a % 35);
  const cagr = parseFloat((((1 + totalPct / 100) ** (1 / 5) - 1) * 100).toFixed(1));

  // Build year-by-year compounding with slight variation
  const baseValue = 100;
  const variance = (b % 5) - 2; // -2 to +2
  const points = Array.from({ length: 6 }, (_, i) => {
    const annualRate = cagr / 100 + (i % 2 === 0 ? variance * 0.003 : -variance * 0.002);
    const value = parseFloat((baseValue * (1 + annualRate) ** i).toFixed(2));
    return { year: i === 0 ? "Now" : `Y${i}`, value };
  });

  const outlook: "Strong" | "Moderate" | "Stable" =
    cagr >= 8 ? "Strong" : cagr >= 5 ? "Moderate" : "Stable";
  const outlookColor =
    outlook === "Strong" ? "#22c55e" : outlook === "Moderate" ? "#3b82f6" : "#9ca3af";

  return { totalPct, cagr, horizon: "5-year", points, outlook, outlookColor };
}

export default function FutureAppreciationCard({ projectId }: FutureAppreciationCardProps) {
  const data = mockAppreciation(projectId);

  return (
    <div className="rounded-2xl border border-neutral-800 bg-[#121A2B] p-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-neutral-500">
            Future Appreciation
          </p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-3xl font-bold" style={{ color: data.outlookColor }}>
              +{data.totalPct}%
            </span>
            <span className="text-sm text-neutral-400">over 5 yrs</span>
          </div>
          <div className="mt-1 flex items-center gap-3 text-xs text-neutral-500">
            <span>
              CAGR{" "}
              <span className="font-semibold text-neutral-300">{data.cagr}%</span>
            </span>
            <span className="text-neutral-700">·</span>
            <span className="flex items-center gap-1">
              <TrendingUp size={11} style={{ color: data.outlookColor }} />
              <span style={{ color: data.outlookColor }}>{data.outlook} outlook</span>
            </span>
          </div>
        </div>

        {/* Sparkline */}
        <div className="w-28 h-14 shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data.points} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
              <defs>
                <linearGradient id={`grad-${projectId}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={data.outlookColor} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={data.outlookColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="value"
                stroke={data.outlookColor}
                strokeWidth={2}
                fill={`url(#grad-${projectId})`}
                dot={false}
                isAnimationActive={false}
              />
              <Tooltip
                contentStyle={{
                  background: "#1e2a3b",
                  border: "1px solid #334155",
                  borderRadius: 6,
                  fontSize: 11,
                }}
                formatter={(v: number) => [`${(v - 100).toFixed(1)}%`, "Gain"]}
                labelStyle={{ color: "#94a3b8" }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Year labels */}
      <div className="mt-2 flex justify-between text-[10px] text-neutral-600 px-0.5">
        {data.points.map((p) => (
          <span key={p.year}>{p.year}</span>
        ))}
      </div>

      <p className="mt-3 text-xs text-neutral-500 border-t border-neutral-800 pt-3">
        Projected using locality growth trends and historical data.{" "}
        <span className="text-neutral-700">Placeholder — not financial advice.</span>
      </p>
    </div>
  );
}

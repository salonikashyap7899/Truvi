interface TrustScoreWidgetProps {
  score: number;
  compact?: boolean;
}

interface TierConfig {
  label: string;
  color: string;
  trackColor: string;
  explanation: string;
}

function getTier(score: number): TierConfig {
  if (score >= 80) {
    return {
      label: "Excellent",
      color: "#22c55e",
      trackColor: "#166534",
      explanation: "Strong RERA compliance, verified developer credentials, and high buyer satisfaction.",
    };
  }
  if (score >= 60) {
    return {
      label: "Good",
      color: "#3b82f6",
      trackColor: "#1e3a8a",
      explanation: "Meets key verification criteria with a reliable developer track record.",
    };
  }
  if (score >= 40) {
    return {
      label: "Fair",
      color: "#f59e0b",
      trackColor: "#78350f",
      explanation: "Some verification criteria are pending — review all documents before committing.",
    };
  }
  return {
    label: "Poor",
    color: "#ef4444",
    trackColor: "#7f1d1d",
    explanation: "Limited verified information available. Proceed with caution and due diligence.",
  };
}

/**
 * Derives a deterministic mock score (60–95) from a project ID string so
 * existing projects without a stored trustScore still display varied values.
 */
export function mockScoreFromId(id: string): number {
  if (!id) return 72;
  const hex = id.slice(-4);
  const n = parseInt(hex, 16);
  return 60 + (n % 36);
}

export default function TrustScoreWidget({ score, compact = false }: TrustScoreWidgetProps) {
  const tier = getTier(score);

  const size = compact ? 72 : 120;
  const strokeWidth = compact ? 7 : 10;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  // Use a 270° arc (¾ circle), starting from ~135° (bottom-left)
  // Achieved via a full circle rotated -225deg, with dashoffset controlling fill
  const arcFraction = 0.75;
  const arcLength = circumference * arcFraction;
  const filledLength = (score / 100) * arcLength;
  const gap = circumference - arcLength;

  return (
    <div
      className={`flex ${compact ? "flex-row items-center gap-3" : "flex-col items-center gap-3"} rounded-2xl border border-white/10 glass ${compact ? "p-3" : "p-5"}`}
    >
      {/* Circular gauge */}
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          style={{ transform: "rotate(-225deg)" }}
          className="block"
        >
          {/* Background arc */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={tier.trackColor}
            strokeWidth={strokeWidth}
            strokeDasharray={`${arcLength} ${gap}`}
            strokeLinecap="round"
          />
          {/* Filled arc */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={tier.color}
            strokeWidth={strokeWidth}
            strokeDasharray={`${filledLength} ${circumference - filledLength}`}
            strokeLinecap="round"
            style={{ transition: "stroke-dasharray 0.6s ease" }}
          />
        </svg>

        {/* Centre text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className={`font-bold leading-none ${compact ? "text-base" : "text-2xl"}`}
            style={{ color: tier.color }}
          >
            {score}
          </span>
          {!compact && (
            <span className="mt-0.5 text-[10px] text-muted-foreground uppercase tracking-widest">
              / 100
            </span>
          )}
        </div>
      </div>

      {/* Label + explanation */}
      <div className={compact ? "" : "text-center"}>
        <div className="flex items-center gap-1.5">
          {compact && (
            <span className="text-xs font-medium text-muted-foreground">Trust Score</span>
          )}
          {!compact && (
            <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              Truvi Trust Score
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 mt-0.5">
          <span
            className={`font-semibold ${compact ? "text-sm" : "text-base"}`}
            style={{ color: tier.color }}
          >
            {tier.label}
          </span>
          {compact && (
            <span className="text-muted-foreground text-xs font-normal">
              {score}/100
            </span>
          )}
        </div>

        {!compact && (
          <p className="mt-1.5 text-xs text-muted-foreground max-w-[220px] leading-relaxed">
            {tier.explanation}
          </p>
        )}
      </div>
    </div>
  );
}

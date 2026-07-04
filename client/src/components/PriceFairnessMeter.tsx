/**
 * PriceFairnessMeter
 *
 * Shows where a listed price falls relative to an estimated fair-value range
 * for the locality. All values are mock/placeholder until real market data
 * is wired in — they are derived deterministically from the project ID so
 * each property shows a consistent, varied reading.
 */

interface PriceFairnessMeterProps {
  projectId: string;
  compact?: boolean;
}

type FairnessZone = "underpriced" | "fair" | "overpriced";

interface MockPriceData {
  listedPerSqft: number;
  fairMin: number;
  fairMax: number;
  /** 0–100: position on the meter */
  position: number;
  zone: FairnessZone;
  zoneLabel: string;
  zoneSub: string;
}

const ZONE_META: Record<FairnessZone, { label: string; sub: string; color: string; light: string }> = {
  underpriced: {
    label: "Underpriced",
    sub: "Listed below the estimated locality average — strong value for buyers.",
    color: "#3b82f6",
    light: "#1e3a8a",
  },
  fair: {
    label: "Fair Value",
    sub: "Listed within the estimated fair-value range for this locality.",
    color: "#22c55e",
    light: "#14532d",
  },
  overpriced: {
    label: "Overpriced",
    sub: "Listed above the estimated locality average — negotiate or compare nearby projects.",
    color: "#f59e0b",
    light: "#78350f",
  },
};

function formatINR(n: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
}

/** Derives consistent mock price data from a project ID. */
function mockPriceData(id: string): MockPriceData {
  if (!id) id = "000000";
  // Use different nibbles of the ID for independent variation
  const a = parseInt(id.slice(-6, -4) || "ab", 16); // fair centre offset
  const b = parseInt(id.slice(-4, -2) || "cd", 16); // spread
  const c = parseInt(id.slice(-2) || "ef", 16);     // listed vs fair position

  const fairCentre = 8_000 + (a % 8_000);           // 8k–16k/sqft
  const spread = 500 + (b % 1_500);                  // ±500–2000/sqft
  const fairMin = fairCentre - spread;
  const fairMax = fairCentre + spread;

  // c drives how far listed deviates from centre: -30% to +30%
  const deviation = ((c / 255) - 0.5) * 0.6;        // -0.3 to +0.3
  const listedPerSqft = Math.round(fairCentre * (1 + deviation) / 100) * 100;

  // Position on the 0–100 meter:
  //   0   = 30% below fair min
  //   50  = fair centre
  //   100 = 30% above fair max
  const lowerBound = fairMin * 0.7;
  const upperBound = fairMax * 1.3;
  const position = Math.min(100, Math.max(0,
    ((listedPerSqft - lowerBound) / (upperBound - lowerBound)) * 100
  ));

  let zone: FairnessZone;
  if (listedPerSqft < fairMin) zone = "underpriced";
  else if (listedPerSqft > fairMax) zone = "overpriced";
  else zone = "fair";

  return {
    listedPerSqft,
    fairMin,
    fairMax,
    position,
    zone,
    zoneLabel: ZONE_META[zone].label,
    zoneSub: ZONE_META[zone].sub,
  };
}

export default function PriceFairnessMeter({ projectId, compact = false }: PriceFairnessMeterProps) {
  const data = mockPriceData(projectId);
  const meta = ZONE_META[data.zone];
  const pos = data.position; // 0–100

  if (compact) {
    return (
      <div className="rounded-xl border border-white/10 glass px-3 py-2.5">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs text-muted-foreground font-medium">Price Fairness</span>
          <span
            className="text-xs font-semibold rounded-full px-2 py-0.5"
            style={{ color: meta.color, background: meta.light + "40" }}
          >
            {data.zoneLabel}
          </span>
        </div>
        <MeterBar position={pos} zone={data.zone} height={6} />
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/10 glass p-5 w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Price Fairness Meter
          </p>
          <p className="mt-0.5 text-sm font-semibold" style={{ color: meta.color }}>
            {data.zoneLabel}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Est. Fair Range</p>
          <p className="text-xs font-medium text-foreground/90">
            {formatINR(data.fairMin)} – {formatINR(data.fairMax)}/sqft
          </p>
        </div>
      </div>

      {/* Meter */}
      <MeterBar position={pos} zone={data.zone} height={12} showLabels />

      {/* Price row */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div>
          <span className="text-muted-foreground">Listed price </span>
          <span className="font-semibold text-white">
            {formatINR(data.listedPerSqft)}/sqft
          </span>
        </div>
        <div className="text-right">
          <span className="text-muted-foreground">Locality avg </span>
          <span className="font-semibold text-foreground/90">
            {formatINR(Math.round((data.fairMin + data.fairMax) / 2))}/sqft
          </span>
        </div>
      </div>

      {/* Explanation */}
      <p className="mt-3 text-xs text-muted-foreground leading-relaxed border-t border-white/10 pt-3">
        {data.zoneSub}
        <span className="ml-1 text-muted-foreground">(Placeholder comparison data)</span>
      </p>
    </div>
  );
}

// ─── MeterBar ────────────────────────────────────────────────────────────────

function MeterBar({
  position,
  zone,
  height,
  showLabels = false,
}: {
  position: number;
  zone: FairnessZone;
  height: number;
  showLabels?: boolean;
}) {
  const needleColor = ZONE_META[zone].color;

  return (
    <div>
      {/* Track */}
      <div
        className="relative w-full overflow-hidden rounded-full"
        style={{ height }}
      >
        {/* Gradient: blue → green → amber */}
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background:
              "linear-gradient(to right, #3b82f6 0%, #22c55e 40%, #22c55e 60%, #f59e0b 100%)",
            opacity: 0.25,
          }}
        />
        {/* Zone fills */}
        <div className="absolute inset-0 flex rounded-full overflow-hidden">
          <div className="h-full flex-none" style={{ width: "33.3%", background: "#1e3a8a" }} />
          <div className="h-full flex-1" style={{ background: "#14532d" }} />
          <div className="h-full flex-none" style={{ width: "33.3%", background: "#78350f" }} />
        </div>
        {/* Bright zone dividers */}
        <div
          className="absolute top-0 bottom-0 w-px bg-white/15"
          style={{ left: "33.3%" }}
        />
        <div
          className="absolute top-0 bottom-0 w-px bg-white/15"
          style={{ left: "66.6%" }}
        />
        {/* Needle */}
        <div
          className="absolute top-0 bottom-0 w-1 rounded-full shadow-md transition-all duration-500"
          style={{
            left: `calc(${position}% - 2px)`,
            background: needleColor,
            boxShadow: `0 0 6px 2px ${needleColor}80`,
          }}
        />
      </div>

      {/* Zone labels */}
      {showLabels && (
        <div className="mt-1.5 flex text-[10px] text-muted-foreground">
          <span className="w-1/3 text-left">Underpriced</span>
          <span className="w-1/3 text-center">Fair Value</span>
          <span className="w-1/3 text-right">Overpriced</span>
        </div>
      )}
    </div>
  );
}

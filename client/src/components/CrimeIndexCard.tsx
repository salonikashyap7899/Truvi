import { ShieldCheck, Shield, ShieldAlert } from "lucide-react";

type RiskLevel = "LOW" | "MEDIUM" | "HIGH";

interface CrimeIndexCardProps {
  level: RiskLevel;
}

interface LevelConfig {
  label: string;
  safetyLabel: string;
  note: string;
  badgeClass: string;
  iconClass: string;
  borderClass: string;
  Icon: React.ComponentType<{ size?: number; className?: string }>;
}

const LEVEL_CONFIG: Record<RiskLevel, LevelConfig> = {
  LOW: {
    label: "Low Crime",
    safetyLabel: "Safe Locality",
    note: "Below-average crime rate. Well-patrolled streets and low incident reports for this area.",
    badgeClass: "bg-green-500/15 text-green-400 border border-green-500/30",
    iconClass: "text-green-400",
    borderClass: "border-neutral-800",
    Icon: ShieldCheck,
  },
  MEDIUM: {
    label: "Moderate Crime",
    safetyLabel: "Average Safety",
    note: "Crime rate is in line with the city average. Standard precautions recommended.",
    badgeClass: "bg-amber-500/15 text-amber-400 border border-amber-500/30",
    iconClass: "text-amber-400",
    borderClass: "border-amber-500/20",
    Icon: Shield,
  },
  HIGH: {
    label: "High Crime",
    safetyLabel: "Caution Advised",
    note: "Above-average incidents reported in this locality. Verify with local police records.",
    badgeClass: "bg-red-500/15 text-red-400 border border-red-500/30",
    iconClass: "text-red-400",
    borderClass: "border-red-500/20",
    Icon: ShieldAlert,
  },
};

/** Deterministic placeholder crime level derived from project ID. */
export function mockCrimeFromId(id: string): RiskLevel {
  if (!id) return "LOW";
  const n = parseInt(id.slice(-5, -3) || "00", 16);
  if (n % 9 === 0) return "HIGH";
  if (n % 4 === 0) return "MEDIUM";
  return "LOW";
}

export default function CrimeIndexCard({ level }: CrimeIndexCardProps) {
  const cfg = LEVEL_CONFIG[level];
  const { Icon } = cfg;

  return (
    <div className={`rounded-2xl border bg-[#121A2B] p-5 ${cfg.borderClass}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Icon size={18} className={cfg.iconClass} />
          <span className="text-sm font-medium text-neutral-300">Crime Index</span>
        </div>
        <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${cfg.badgeClass}`}>
          {cfg.safetyLabel}
        </span>
      </div>
      <p className="mt-3 text-xs text-neutral-400 leading-relaxed">{cfg.note}</p>
    </div>
  );
}

import { ShieldCheck, Shield, ShieldAlert, ShieldQuestion } from "lucide-react";

type RiskLevel = "LOW" | "MEDIUM" | "HIGH";

interface CrimeIndexCardProps {
  level: RiskLevel | null | undefined;
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
    borderClass: "border-white/10",
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

export default function CrimeIndexCard({ level }: CrimeIndexCardProps) {
  // No crime-index assessment on record yet → honest "not assessed" state
  // instead of a fabricated reading.
  if (level == null) {
    return (
      <div className="rounded-2xl border border-white/10 glass p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ShieldQuestion size={18} className="text-muted-foreground" />
            <span className="text-sm font-medium text-foreground/90">Crime Index</span>
          </div>
          <span className="inline-flex items-center rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-semibold text-muted-foreground">
            Not assessed
          </span>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          A safety reading will appear once verified local crime data is available for this locality.
        </p>
      </div>
    );
  }

  const cfg = LEVEL_CONFIG[level];
  const { Icon } = cfg;

  return (
    <div className={`rounded-2xl border glass p-5 ${cfg.borderClass}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Icon size={18} className={cfg.iconClass} />
          <span className="text-sm font-medium text-foreground/90">Crime Index</span>
        </div>
        <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${cfg.badgeClass}`}>
          {cfg.safetyLabel}
        </span>
      </div>
      <p className="mt-3 text-xs text-muted-foreground leading-relaxed">{cfg.note}</p>
    </div>
  );
}

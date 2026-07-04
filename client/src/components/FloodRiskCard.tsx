import { Droplets, CloudRain, AlertTriangle } from "lucide-react";

type RiskLevel = "LOW" | "MEDIUM" | "HIGH";

interface FloodRiskCardProps {
  level: RiskLevel;
}

interface LevelConfig {
  label: string;
  note: string;
  badgeClass: string;
  iconClass: string;
  borderClass: string;
  Icon: React.ComponentType<{ size?: number; className?: string }>;
}

const LEVEL_CONFIG: Record<RiskLevel, LevelConfig> = {
  LOW: {
    label: "Low Risk",
    note: "No recorded flooding in the past decade. Elevation and drainage infrastructure are adequate.",
    badgeClass: "bg-green-500/15 text-green-400 border border-green-500/30",
    iconClass: "text-green-400",
    borderClass: "border-white/10",
    Icon: Droplets,
  },
  MEDIUM: {
    label: "Medium Risk",
    note: "Occasional waterlogging during heavy monsoons. Verify stormwater drainage before purchase.",
    badgeClass: "bg-amber-500/15 text-amber-400 border border-amber-500/30",
    iconClass: "text-amber-400",
    borderClass: "border-amber-500/20",
    Icon: CloudRain,
  },
  HIGH: {
    label: "High Risk",
    note: "Locality has a history of flooding during monsoon season. Confirm developer mitigation measures.",
    badgeClass: "bg-red-500/15 text-red-400 border border-red-500/30",
    iconClass: "text-red-400",
    borderClass: "border-red-500/20",
    Icon: AlertTriangle,
  },
};

/** Derives a deterministic placeholder flood risk level from a project ID. */
export function mockFloodRiskFromId(id: string): RiskLevel {
  if (!id) return "LOW";
  const n = parseInt(id.slice(-3, -1) || "00", 16);
  if (n % 7 === 0) return "HIGH";
  if (n % 3 === 0) return "MEDIUM";
  return "LOW";
}

export default function FloodRiskCard({ level }: FloodRiskCardProps) {
  const cfg = LEVEL_CONFIG[level];
  const { Icon } = cfg;

  return (
    <div className={`rounded-2xl border glass p-5 ${cfg.borderClass}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Icon size={18} className={cfg.iconClass} />
          <span className="text-sm font-medium text-foreground/90">Flood Risk</span>
        </div>
        <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${cfg.badgeClass}`}>
          {cfg.label}
        </span>
      </div>
      <p className="mt-3 text-xs text-muted-foreground leading-relaxed">{cfg.note}</p>
    </div>
  );
}

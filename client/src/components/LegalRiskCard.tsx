import { ShieldCheck, ShieldAlert, ShieldOff, ShieldQuestion } from "lucide-react";

type RiskLevel = "LOW" | "MEDIUM" | "HIGH";

interface LegalRiskCardProps {
  level: RiskLevel | null | undefined;
  compact?: boolean;
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
    note: "Clear title, no pending litigation, RERA compliant.",
    badgeClass: "bg-green-500/15 text-green-400 border border-green-500/30",
    iconClass: "text-green-400",
    borderClass: "border-green-500/20",
    Icon: ShieldCheck,
  },
  MEDIUM: {
    label: "Medium Risk",
    note: "Minor documentation gaps — verify title deeds before committing.",
    badgeClass: "bg-amber-500/15 text-amber-400 border border-amber-500/30",
    iconClass: "text-amber-400",
    borderClass: "border-amber-500/20",
    Icon: ShieldAlert,
  },
  HIGH: {
    label: "High Risk",
    note: "Active litigation or title disputes reported. Consult a legal advisor.",
    badgeClass: "bg-red-500/15 text-red-400 border border-red-500/30",
    iconClass: "text-red-400",
    borderClass: "border-red-500/20",
    Icon: ShieldOff,
  },
};

export default function LegalRiskCard({ level, compact = false }: LegalRiskCardProps) {
  // No admin legal assessment yet → honest "not assessed" state.
  if (level == null) {
    if (compact) {
      return (
        <div className="flex items-center gap-2 rounded-xl border border-white/10 glass px-3 py-2">
          <ShieldQuestion size={14} className="text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">Legal Risk</span>
          <span className="ml-auto inline-flex items-center rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-xs font-semibold text-muted-foreground">
            Not assessed
          </span>
        </div>
      );
    }
    return (
      <div className="rounded-2xl border border-white/10 glass p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ShieldQuestion size={18} className="text-muted-foreground" />
            <span className="text-sm font-medium text-foreground/90">Legal Risk</span>
          </div>
          <span className="inline-flex items-center rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-semibold text-muted-foreground">
            Not assessed
          </span>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          Legal risk will appear once Truvi completes the verification review.
        </p>
      </div>
    );
  }

  const cfg = LEVEL_CONFIG[level];
  const { Icon } = cfg;

  if (compact) {
    return (
      <div className={`flex items-center gap-2 rounded-xl border border-white/10 glass px-3 py-2`}>
        <Icon size={14} className={cfg.iconClass} />
        <span className="text-xs text-muted-foreground font-medium">Legal Risk</span>
        <span className={`ml-auto inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${cfg.badgeClass}`}>
          {cfg.label}
        </span>
      </div>
    );
  }

  return (
    <div className={`rounded-2xl border glass p-5 ${cfg.borderClass}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Icon size={18} className={cfg.iconClass} />
          <span className="text-sm font-medium text-foreground/90">Legal Risk</span>
        </div>
        <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${cfg.badgeClass}`}>
          {cfg.label}
        </span>
      </div>
      <p className="mt-3 text-xs text-muted-foreground leading-relaxed">{cfg.note}</p>
    </div>
  );
}

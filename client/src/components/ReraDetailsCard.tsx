import { BadgeCheck, Clock, XCircle } from "lucide-react";

type ReraStatus = "REGISTERED" | "PENDING" | "NOT_REGISTERED";

export interface ReraInfo {
  reraNumber: string;
  reraStatus: ReraStatus;
  reraValidityDate: string | null;
}

interface ReraDetailsCardProps {
  info: ReraInfo;
}

interface StatusConfig {
  label: string;
  badgeClass: string;
  borderClass: string;
  Icon: React.ComponentType<{ size?: number; className?: string }>;
}

const STATUS_CONFIG: Record<ReraStatus, StatusConfig> = {
  REGISTERED: {
    label: "Registered",
    badgeClass: "bg-green-500/15 text-green-400 border border-green-500/30",
    borderClass: "border-white/10",
    Icon: BadgeCheck,
  },
  PENDING: {
    label: "Pending",
    badgeClass: "bg-amber-500/15 text-amber-400 border border-amber-500/30",
    borderClass: "border-amber-500/20",
    Icon: Clock,
  },
  NOT_REGISTERED: {
    label: "Not Registered",
    badgeClass: "bg-red-500/15 text-red-400 border border-red-500/30",
    borderClass: "border-red-500/20",
    Icon: XCircle,
  },
};

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export default function ReraDetailsCard({ info }: ReraDetailsCardProps) {
  const cfg = STATUS_CONFIG[info.reraStatus];
  const { Icon } = cfg;

  return (
    <div className={`rounded-2xl border glass p-5 ${cfg.borderClass}`}>
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Icon size={16} className={cfg.badgeClass.includes("green") ? "text-green-400" : cfg.badgeClass.includes("amber") ? "text-amber-400" : "text-red-400"} />
          <span className="text-sm font-medium text-foreground/90">RERA Details</span>
        </div>
        <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${cfg.badgeClass}`}>
          {cfg.label}
        </span>
      </div>

      {/* Fields */}
      <dl className="mt-4 space-y-2">
        <div className="flex items-center justify-between text-xs">
          <dt className="text-muted-foreground">Registration No.</dt>
          <dd className="font-mono font-semibold text-foreground tracking-wide">
            {info.reraNumber}
          </dd>
        </div>
        {info.reraValidityDate && (
          <div className="flex items-center justify-between text-xs">
            <dt className="text-muted-foreground">Valid Until</dt>
            <dd className="text-foreground/90">{formatDate(info.reraValidityDate)}</dd>
          </div>
        )}
        {!info.reraValidityDate && (
          <div className="flex items-center justify-between text-xs">
            <dt className="text-muted-foreground">Valid Until</dt>
            <dd className="text-muted-foreground italic">—</dd>
          </div>
        )}
      </dl>
    </div>
  );
}

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
    borderClass: "border-neutral-800",
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

const STATES = ["MH", "DL", "KA", "TN", "GJ", "RJ", "TS", "UP"];

/** Deterministic mock RERA info derived from project ID. */
export function mockReraFromId(id: string): ReraInfo {
  if (!id) {
    return {
      reraNumber: "MH/RERA/2021/0001",
      reraStatus: "REGISTERED",
      reraValidityDate: "2026-12-31",
    };
  }

  const a = parseInt(id.slice(-10, -8) || "4d", 16);
  const b = parseInt(id.slice(-8, -6) || "9a", 16);
  const c = parseInt(id.slice(-4, -2) || "2f", 16);

  const stateCode = STATES[a % STATES.length];
  const year = 2019 + (b % 5);
  const serial = String(1000 + (c % 8999)).padStart(4, "0");
  const reraNumber = `${stateCode}/RERA/${year}/${serial}`;

  const statusIdx = (a + b) % 10;
  const reraStatus: ReraStatus =
    statusIdx <= 6 ? "REGISTERED" : statusIdx <= 8 ? "PENDING" : "NOT_REGISTERED";

  // Validity: 3–6 years after registration year for REGISTERED, null otherwise
  let reraValidityDate: string | null = null;
  if (reraStatus === "REGISTERED") {
    const validYear = year + 3 + (c % 4);
    reraValidityDate = `${validYear}-03-31`;
  }

  return { reraNumber, reraStatus, reraValidityDate };
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export default function ReraDetailsCard({ info }: ReraDetailsCardProps) {
  const cfg = STATUS_CONFIG[info.reraStatus];
  const { Icon } = cfg;

  return (
    <div className={`rounded-2xl border bg-[#121A2B] p-5 ${cfg.borderClass}`}>
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Icon size={16} className={cfg.badgeClass.includes("green") ? "text-green-400" : cfg.badgeClass.includes("amber") ? "text-amber-400" : "text-red-400"} />
          <span className="text-sm font-medium text-neutral-300">RERA Details</span>
        </div>
        <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${cfg.badgeClass}`}>
          {cfg.label}
        </span>
      </div>

      {/* Fields */}
      <dl className="mt-4 space-y-2">
        <div className="flex items-center justify-between text-xs">
          <dt className="text-neutral-500">Registration No.</dt>
          <dd className="font-mono font-semibold text-neutral-200 tracking-wide">
            {info.reraNumber}
          </dd>
        </div>
        {info.reraValidityDate && (
          <div className="flex items-center justify-between text-xs">
            <dt className="text-neutral-500">Valid Until</dt>
            <dd className="text-neutral-300">{formatDate(info.reraValidityDate)}</dd>
          </div>
        )}
        {!info.reraValidityDate && (
          <div className="flex items-center justify-between text-xs">
            <dt className="text-neutral-500">Valid Until</dt>
            <dd className="text-neutral-500 italic">—</dd>
          </div>
        )}
      </dl>
    </div>
  );
}

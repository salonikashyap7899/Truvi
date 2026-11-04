import { BadgeCheck, Clock, XCircle } from "lucide-react";

type ReraStatus = "REGISTERED" | "PENDING" | "NOT_REGISTERED";

export interface ReraInfo {
  reraNumber: string;
  reraStatus: ReraStatus;
  reraValidityDate: string | null;
  approvalAuthority?: "RERA" | "DISTRICT_PANCHAYAT" | "DTCP" | null;
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
    label: "Marked as registered",
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
    label: "No RERA number recorded",
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
  const authority = info.approvalAuthority ?? null;
  const isReraRecord = authority === "RERA";
  const cfg = isReraRecord ? STATUS_CONFIG[info.reraStatus] : null;
  const Icon = cfg?.Icon ?? BadgeCheck;
  const authorityLabel =
    authority === "DISTRICT_PANCHAYAT"
      ? "District Panchayat"
      : authority === "DTCP"
        ? "Development Authority (DTCP)"
        : authority === "RERA"
          ? "RERA"
          : "Not specified";

  return (
    <div className="rounded-2xl border glass p-5 border-white/10">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Icon size={16} className={cfg ? (cfg.badgeClass.includes("green") ? "text-green-400" : cfg.badgeClass.includes("amber") ? "text-amber-400" : "text-muted-foreground") : "text-sky-300"} />
          <span className="text-sm font-medium text-foreground/90">
            {isReraRecord ? "RERA Details" : "Project approval details"}
          </span>
        </div>
        <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${cfg ? cfg.badgeClass : "border-sky-400/25 bg-sky-400/10 text-sky-200"}`}>
          {cfg ? cfg.label : "Other authority"}
        </span>
      </div>

      <dl className="mt-4 space-y-2">
        <div className="flex items-center justify-between gap-3 text-xs">
          <dt className="text-muted-foreground">{isReraRecord ? "RERA registration no." : "Approval authority"}</dt>
          <dd className="max-w-[65%] break-words text-right font-mono font-semibold text-foreground">
            {isReraRecord ? (info.reraNumber || "Not provided") : authorityLabel}
          </dd>
        </div>
        {isReraRecord && (
          <div className="flex items-center justify-between gap-3 text-xs">
            <dt className="text-muted-foreground">Valid until</dt>
            <dd className="text-foreground/90">
              {info.reraValidityDate ? formatDate(info.reraValidityDate) : "Not provided"}
            </dd>
          </div>
        )}
      </dl>

      <div className="mt-4 rounded-xl border border-amber-400/20 bg-amber-400/5 p-3">
        <p className="text-[11px] leading-relaxed text-amber-100/80">
          This is a project record, not a certificate or live confirmation from RERA or the named approval authority.
          Registration status and supporting documents must be checked with the competent state authority before
          booking or payment. A missing RERA number alone does not establish that a project is unlawful; confirm
          whether registration is required or a statutory exemption applies.
        </p>
      </div>
    </div>
  );
}

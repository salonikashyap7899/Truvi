import { BadgeCheck, Clock, XCircle } from "lucide-react";

type ReraStatus = "REGISTERED" | "PENDING" | "NOT_REGISTERED";
type ApprovalAuthority = "RERA" | "DISTRICT_PANCHAYAT" | "DTCP";

export interface ReraInfo {
  approvalAuthority: ApprovalAuthority;
  reraNumber: string;
  reraStatus: ReraStatus;
  reraValidityDate: string | null;
  reraExemptionVerified: boolean;
  reraExemptionBasis?: string;
  verificationSource?: string;
  lastVerifiedAt?: string | null;
  verified: boolean;
}

interface ReraDetailsCardProps {
  info: ReraInfo;
}

const AUTHORITY_LABEL: Record<ApprovalAuthority, string> = {
  RERA: "RERA",
  DISTRICT_PANCHAYAT: "District Panchayat",
  DTCP: "Development Authority (DTCP)",
};

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export default function ReraDetailsCard({ info }: ReraDetailsCardProps) {
  const isRera = info.approvalAuthority === "RERA";
  const authorityLabel = AUTHORITY_LABEL[info.approvalAuthority];
  const StatusIcon = info.verified ? BadgeCheck : info.reraStatus === "NOT_REGISTERED" ? XCircle : Clock;
  const heading = isRera ? "RERA Details" : "Planning / Layout Approval";
  const statusLabel = info.verified
    ? isRera && info.reraStatus === "NOT_REGISTERED" && info.reraExemptionVerified
      ? "RERA applicability / exemption reviewed"
      : isRera ? "RERA registration checked by Truvi" : "Planning approval & RERA assessment reviewed"
    : "Developer-declared · not checked";

  return (
    <div className="rounded-2xl border border-white/10 glass p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <StatusIcon size={16} className={info.verified ? "shrink-0 text-green-400" : "shrink-0 text-amber-400"} />
          <span className="text-sm font-medium text-foreground/90">{heading}</span>
        </div>
        <span className={`inline-flex max-w-[60%] items-center rounded-full border px-3 py-1 text-right text-xs font-semibold ${info.verified ? "border-green-500/30 bg-green-500/15 text-green-300" : "border-amber-500/30 bg-amber-500/15 text-amber-300"}`}>
          {statusLabel}
        </span>
      </div>

      {!info.verified && (
        <p className="mt-3 text-xs leading-relaxed text-amber-200/80">
          {isRera
            ? "The RERA number and status were supplied by the developer. Truvi has not independently checked them against the official State RERA register."
            : `The ${authorityLabel} reference was supplied by the developer. It is not a RERA registration and does not by itself prove that RERA registration is not required.`}
        </p>
      )}

      <dl className="mt-4 space-y-2">
        <div className="flex items-center justify-between gap-3 text-xs">
          <dt className="text-muted-foreground">{isRera ? "RERA registration no." : "Approval reference no."}</dt>
          <dd className="break-all text-right font-mono font-semibold tracking-wide text-foreground">
            {info.reraNumber || "Not provided"}
          </dd>
        </div>
        {isRera && (
          <div className="flex items-center justify-between gap-3 text-xs">
            <dt className="text-muted-foreground">Developer-declared status</dt>
            <dd className="text-right text-foreground/90">{info.reraStatus.replace(/_/g, " ")}</dd>
          </div>
        )}
        {info.reraValidityDate && (
          <div className="flex items-center justify-between gap-3 text-xs">
            <dt className="text-muted-foreground">Valid until (as supplied)</dt>
            <dd className="text-right text-foreground/90">{formatDate(info.reraValidityDate)}</dd>
          </div>
        )}
      </dl>
      {info.verified && info.verificationSource && (
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          Checked against: <span className="text-foreground/80">{info.verificationSource}</span>
          {info.lastVerifiedAt ? <> · Last checked {formatDate(info.lastVerifiedAt)}</> : null}
        </p>
      )}
      {info.verified && info.reraExemptionVerified && info.reraExemptionBasis && (
        <p className="mt-3 rounded-lg border border-white/10 bg-white/[0.03] p-3 text-xs leading-relaxed text-muted-foreground">
          RERA applicability / exemption basis reviewed: {info.reraExemptionBasis}
        </p>
      )}
    </div>
  );
}

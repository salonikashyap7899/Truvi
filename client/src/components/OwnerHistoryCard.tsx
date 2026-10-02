import { History } from "lucide-react";

export interface OwnerEntry {
  ownerLabel: string;
  startYear: number;
  endYear: number | null;
}

interface OwnerHistoryCardProps {
  owners: OwnerEntry[];
}

export default function OwnerHistoryCard({ owners }: OwnerHistoryCardProps) {
  // No verified ownership records yet → honest empty state instead of a
  // fabricated timeline.
  if (!owners.length) {
    return (
      <div className="rounded-2xl border border-white/10 glass p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History size={16} className="text-muted-foreground" />
            <span className="text-sm font-medium text-foreground/90">Owner History</span>
          </div>
          <span className="inline-flex items-center rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-semibold text-muted-foreground">
            Not available
          </span>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          Ownership history will appear once verified registry records are available for this property.
        </p>
      </div>
    );
  }

  const totalOwners = owners.length;
  const current = owners[owners.length - 1];
  const heldYears = current ? new Date().getFullYear() - current.startYear : 0;

  return (
    <div className="rounded-2xl border border-white/10 glass p-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <History size={16} className="text-indigo-400" />
          <span className="text-sm font-medium text-foreground/90">Owner History</span>
        </div>
        <span className="text-xs text-muted-foreground">
          {totalOwners} owner{totalOwners !== 1 ? "s" : ""}
        </span>
      </div>

      <p className="mt-1 text-xs text-muted-foreground">
        Current owner holding for{" "}
        <span className="font-semibold text-foreground/90">
          {heldYears} yr{heldYears !== 1 ? "s" : ""}
        </span>
      </p>

      {/* Timeline */}
      <ol className="mt-4 space-y-0">
        {owners.map((entry, idx) => {
          const isCurrent = entry.endYear === null;
          const isLast = idx === owners.length - 1;
          return (
            <li key={idx} className="flex gap-3">
              {/* Spine */}
              <div className="flex flex-col items-center">
                <div
                  className={`mt-1 h-3 w-3 rounded-full border-2 shrink-0 ${
                    isCurrent
                      ? "border-indigo-400 bg-indigo-400/20"
                      : "border-white/20 bg-white/10"
                  }`}
                />
                {!isLast && (
                  <div className="w-px flex-1 bg-white/10 my-0.5" style={{ minHeight: 16 }} />
                )}
              </div>
              {/* Label */}
              <div className="pb-4">
                <p
                  className={`text-xs font-semibold ${
                    isCurrent ? "text-indigo-300" : "text-foreground/90"
                  }`}
                >
                  {entry.ownerLabel}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {entry.startYear} – {entry.endYear ?? "Present"}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

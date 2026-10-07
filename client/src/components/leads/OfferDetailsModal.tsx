import { createPortal } from "react-dom";
import { CalendarRange, Gift, Plus, X } from "lucide-react";
import { useBodyScrollLock } from "@/lib/useBodyScrollLock";
import { formatDate, type PublicOffer } from "./inventoryLeadShared";

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

const REWARD_LABEL: Record<PublicOffer["rewardType"], string> = {
  INCENTIVE: "Cash incentive",
  BONUS_COMMISSION: "Bonus commission",
  GIFT: "Gift",
  DISCOUNT: "Buyer discount",
};

/** How the reward is worked out, in plain words. */
function offerRule(o: PublicOffer): string {
  switch (o.calcBasis) {
    case "PER_AREA_BLOCK":
      return `For every ${(o.basisQuantity ?? 0).toLocaleString("en-IN")} sq ft sold, earn ${inr(o.amount)}${o.prorate ? " (part blocks paid pro-rata)" : ""}.`;
    case "PER_UNIT":
      return `${inr(o.amount)} for every unit sold.`;
    case "PERCENT_OF_VALUE":
      return `${o.amount}% of the booking value.`;
    default:
      return `${inr(o.amount)} on a successful sale.`;
  }
}

/** Compact, tappable "Special Offer" pill for a listing card. */
export function OfferBadge({ offer, onOpen }: { offer: PublicOffer; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onOpen(); }}
      title="Special offer — tap for details"
      className="mt-2.5 flex w-full min-w-0 items-center gap-1.5 rounded-lg border border-amber-400/30 bg-gradient-to-r from-amber-500/15 to-amber-400/5 px-2.5 py-1.5 text-left text-[11px] text-amber-100 transition hover:from-amber-500/25"
    >
      <Gift size={12} className="shrink-0 text-amber-300" />
      <span className="shrink-0 font-semibold text-amber-200">Special Offer</span>
      <span className="text-amber-200/50">–</span>
      <span className="min-w-0 truncate">{offer.badge}</span>
    </button>
  );
}

export default function OfferDetailsModal({
  offer, projectName, onClose, onAddLead,
}: {
  offer: PublicOffer;
  projectName: string;
  onClose: () => void;
  onAddLead?: () => void;
}) {
  useBodyScrollLock(true);
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Offer details">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex max-h-[88dvh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl border border-amber-400/20 bg-[#0a0d14]/97 text-white shadow-2xl backdrop-blur-xl sm:rounded-2xl">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-white/10 px-5 py-3.5">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-300"><Gift size={12} /> Special Offer</p>
            <p className="truncate font-display text-sm font-semibold">{offer.name}</p>
            <p className="truncate text-[11px] text-white/55">{projectName}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="grid size-8 shrink-0 place-items-center rounded-full border border-white/15 text-white/80 hover:bg-white/10">
            <X size={16} />
          </button>
        </div>
        <div className="space-y-4 overflow-y-auto px-5 py-4 text-sm">
          <div className="rounded-xl border border-amber-400/25 bg-amber-500/10 p-3">
            <p className="font-display text-base font-semibold text-amber-100">{offer.badge}</p>
            <p className="mt-1 text-xs text-amber-100/80">{offerRule(offer)}</p>
            <p className="mt-1 text-[11px] text-amber-200/60">{REWARD_LABEL[offer.rewardType]}</p>
          </div>
          {offer.description && <p className="whitespace-pre-line text-white/80">{offer.description}</p>}
          {offer.examples.length > 0 && (
            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/50">How much you earn</p>
              <div className="divide-y divide-white/8 rounded-xl border border-white/10">
                {offer.examples.map((e) => (
                  <div key={e.label} className="flex items-center justify-between px-3 py-2 text-xs">
                    <span className="text-white/70">{e.label}</span>
                    <span className="font-semibold text-emerald-300">{inr(e.reward)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {(offer.startDate || offer.endDate) && (
            <p className="flex items-center gap-1.5 text-xs text-white/60">
              <CalendarRange size={13} />
              {offer.startDate ? formatDate(offer.startDate, { day: "numeric", month: "short", year: "numeric" }) : "Now"} –{" "}
              {offer.endDate ? formatDate(offer.endDate, { day: "numeric", month: "short", year: "numeric" }) : "until further notice"}
            </p>
          )}
          {offer.terms && <p className="whitespace-pre-line text-[11px] text-white/45">{offer.terms}</p>}
        </div>
        {onAddLead && (
          <div className="shrink-0 border-t border-white/10 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <button onClick={onAddLead} className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-[var(--trust)] to-[#2563eb] py-2.5 text-sm font-semibold">
              <Plus size={15} /> Add a lead for this project
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

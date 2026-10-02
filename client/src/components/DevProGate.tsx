import { useState, type ReactNode } from "react";
import { Lock, Zap } from "lucide-react";
import { DevUpsellModal, type DevUpsellPlan } from "@/components/DevUpsellModal";
import { cn } from "@/lib/utils";

interface DevProGateProps {
  /** Whether the developer is entitled to this feature. */
  unlocked: boolean;
  /** Feature name shown in the lock badge + upsell modal. */
  feature: string;
  /** Which plan to pitch when locked. */
  plan?: DevUpsellPlan;
  /** Badge label, e.g. "AI" or "CRM". */
  badge?: string;
  /** Short hook shown on hover, e.g. "Predict sales before they happen". */
  hook?: string;
  children: ReactNode;
  className?: string;
}

/**
 * Locked developer features stay VISIBLE but blurred with an upgrade badge — the
 * whole point is that free developers see what they're missing. Clicking
 * anywhere opens the outcome-focused upsell.
 */
export function DevProGate({ unlocked, feature, plan = "crm", badge = "Pro", hook, children, className }: DevProGateProps) {
  const [upsellOpen, setUpsellOpen] = useState(false);

  if (unlocked) return <>{children}</>;

  return (
    <div className={cn("relative", className)}>
      <div className="pointer-events-none select-none blur-[6px] saturate-50" aria-hidden="true">
        {children}
      </div>
      <button
        type="button"
        onClick={() => setUpsellOpen(true)}
        className="group absolute inset-0 z-10 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl bg-black/30 transition-colors hover:bg-black/40"
        aria-label={`Unlock ${feature}`}
      >
        <span className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-amber-400 to-orange-500 px-3 py-1 text-xs font-semibold text-white shadow-lg shadow-orange-900/40">
          <Lock size={11} /> {badge}
        </span>
        <span className="text-sm font-medium text-white drop-shadow">{feature}</span>
        <span className="inline-flex items-center gap-1 text-xs text-amber-300 opacity-0 transition-opacity group-hover:opacity-100">
          <Zap size={11} /> {hook ?? "Tap to unlock"}
        </span>
      </button>
      <DevUpsellModal open={upsellOpen} onClose={() => setUpsellOpen(false)} plan={plan} feature={feature} />
    </div>
  );
}

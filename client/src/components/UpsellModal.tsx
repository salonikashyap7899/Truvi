import { useNavigate } from "react-router-dom";
import { X, Zap, Bell, TrendingUp, MessageCircle, KanbanSquare, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

interface UpsellModalProps {
  open: boolean;
  onClose: () => void;
  /** What the user tried to open, e.g. "Lead Pipeline" — personalises the pitch. */
  feature?: string;
}

const BENEFITS = [
  { icon: Bell, text: "Never miss a follow-up" },
  { icon: TrendingUp, text: "Increase your closing rate" },
  { icon: Sparkles, text: "AI reminders that work for you" },
  { icon: MessageCircle, text: "WhatsApp automation" },
  { icon: KanbanSquare, text: "Full lead pipeline (8 stages)" },
];

/**
 * The conversion engine: shown whenever a free CP taps a locked CRM feature.
 * Sells the outcome (closing rate, commission) — not the tool.
 */
export function UpsellModal({ open, onClose, feature }: UpsellModalProps) {
  const navigate = useNavigate();
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-amber-500/30 bg-[#0d1117] shadow-2xl shadow-amber-900/20">
        <div className="bg-gradient-to-r from-amber-500/15 via-orange-500/10 to-transparent px-6 pb-4 pt-6">
          <button
            onClick={onClose}
            aria-label="Close"
            className="absolute right-4 top-4 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-white/10 hover:text-white"
          >
            <X size={16} />
          </button>
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 shadow-lg shadow-orange-900/40">
            <Zap size={20} className="text-white" />
          </div>
          <h2 className="mt-3 text-xl font-semibold text-white">Unlock Truvi CRM</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {feature ? `"${feature}" is a Truvi CRM feature. ` : ""}
            CPs on Truvi CRM close <span className="font-semibold text-amber-300">2–3x more deals</span> on average.
          </p>
        </div>

        <div className="px-6 py-4">
          <ul className="space-y-2.5">
            {BENEFITS.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-sm text-foreground/90">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/15">
                  <Icon size={12} className="text-emerald-400" />
                </span>
                {text}
              </li>
            ))}
          </ul>

          <div className="mt-5 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-center">
            <p className="text-xs text-muted-foreground line-through">₹999/month</p>
            <p className="font-display text-3xl font-bold text-white">
              ₹99<span className="text-sm font-normal text-muted-foreground">/month</span>
            </p>
            <p className="mt-1 text-xs text-emerald-400">Launch offer · cancel anytime</p>
          </div>

          <Button className="mt-4 w-full" size="lg" onClick={() => navigate("/pricing")}>
            <Zap size={15} /> Unlock CRM now
          </Button>
          <button onClick={onClose} className="mt-2 w-full py-2 text-center text-xs text-muted-foreground transition-colors hover:text-white">
            Maybe later
          </button>
        </div>
      </div>
    </div>
  );
}

import { useNavigate } from "react-router-dom";
import {
  X, Zap, TrendingUp, Target, BrainCircuit, ShieldCheck, Megaphone,
  BarChart3, Users, Sparkles, Crown, type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export type DevUpsellPlan = "crm" | "ai" | "verified" | "campaign" | "pro";

interface DevUpsellModalProps {
  open: boolean;
  onClose: () => void;
  /** Which paid plan to pitch — decides the price, benefits and headline. */
  plan?: DevUpsellPlan;
  /** The specific locked feature the developer tapped, for a personalised line. */
  feature?: string;
}

interface PlanPitch {
  icon: LucideIcon;
  title: string;
  outcome: string; // the money line — sell the outcome, not the tool
  price: string;
  strike?: string;
  unit?: string;
  benefits: { icon: LucideIcon; text: string }[];
}

const PITCHES: Record<DevUpsellPlan, PlanPitch> = {
  crm: {
    icon: Target,
    title: "Unlock Developer CRM",
    outcome: "Close more sales — CRM developers lift booking conversion by up to 30%.",
    price: "₹49",
    strike: "₹449",
    unit: "/month",
    benefits: [
      { icon: TrendingUp, text: "Full 9-stage booking pipeline with deal value" },
      { icon: Users, text: "Assign leads & track every sales manager" },
      { icon: Zap, text: "Follow-ups, notes, tasks & WhatsApp in one click" },
      { icon: BarChart3, text: "Finance dashboard — collected, outstanding, GST" },
    ],
  },
  ai: {
    icon: BrainCircuit,
    title: "Unlock AI Analytics",
    outcome: "Predict sales before they happen — price smarter and sell inventory faster.",
    price: "₹999",
    strike: "₹4,999",
    benefits: [
      { icon: Sparkles, text: "Demand & revenue forecasting" },
      { icon: BarChart3, text: "Pricing recommendations & competitor tracking" },
      { icon: Target, text: "Buyer behaviour heatmap & lead quality scoring" },
      { icon: TrendingUp, text: "Unsold inventory risk & closing probability" },
    ],
  },
  verified: {
    icon: ShieldCheck,
    title: "Get the Verified Developer Badge",
    outcome: "3x more visibility — verified developers win buyer trust and rank higher.",
    price: "₹999",
    strike: "₹4,999",
    benefits: [
      { icon: ShieldCheck, text: "Verified trust badge on every listing" },
      { icon: TrendingUp, text: "Prime placement & higher search ranking" },
      { icon: Users, text: "Featured developer profile" },
      { icon: Sparkles, text: "Higher buyer confidence → more enquiries" },
    ],
  },
  campaign: {
    icon: Megaphone,
    title: "Launch a Marketing Campaign",
    outcome: "Generate better leads — a fully-managed campaign that fills your pipeline.",
    price: "₹1,00,000",
    benefits: [
      { icon: Megaphone, text: "Meta & Google Ads, fully managed" },
      { icon: Sparkles, text: "Custom landing pages & call tracking" },
      { icon: BarChart3, text: "Live lead dashboard + weekly reports" },
      { icon: Target, text: "Qualified leads delivered to your CRM" },
    ],
  },
  pro: {
    icon: Crown,
    title: "Upgrade to Developer Pro",
    outcome: "Grow your business — every tool unlimited, plus priority placement.",
    price: "₹9,999",
    unit: "/month",
    benefits: [
      { icon: Crown, text: "Unlimited projects, inventory & team members" },
      { icon: BrainCircuit, text: "CRM + AI Analytics + Dynamic Pricing included" },
      { icon: TrendingUp, text: "Priority placement & dedicated account manager" },
      { icon: Sparkles, text: "AI sales forecast & buyer chatbot" },
    ],
  },
};

/**
 * The developer conversion engine — shown whenever a free developer taps a
 * locked tool. Sells the outcome (more sales, better leads, higher trust), not
 * the feature. Mirrors the CP UpsellModal but with developer economics.
 */
export function DevUpsellModal({ open, onClose, plan = "crm", feature }: DevUpsellModalProps) {
  const navigate = useNavigate();
  if (!open) return null;
  const pitch = PITCHES[plan];
  const Icon = pitch.icon;

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
            <Icon size={20} className="text-white" />
          </div>
          <h2 className="mt-3 text-xl font-semibold text-white">{pitch.title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {feature ? <span className="text-amber-300">{feature}</span> : null}
            {feature ? " — " : ""}
            {pitch.outcome}
          </p>
        </div>

        <div className="px-6 py-4">
          <ul className="space-y-2.5">
            {pitch.benefits.map(({ icon: BIcon, text }) => (
              <li key={text} className="flex items-center gap-3 text-sm text-foreground/90">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/15">
                  <BIcon size={12} className="text-emerald-400" />
                </span>
                {text}
              </li>
            ))}
          </ul>

          <div className="mt-5 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-center">
            {pitch.strike && <p className="text-xs text-muted-foreground line-through">{pitch.strike}</p>}
            <p className="font-display text-3xl font-bold text-white">
              {pitch.price}
              {pitch.unit && <span className="text-sm font-normal text-muted-foreground">{pitch.unit}</span>}
            </p>
            <p className="mt-1 text-xs text-emerald-400">It's an investment in your sales, not an expense.</p>
          </div>

          <Button className="mt-4 w-full" size="lg" onClick={() => navigate("/pricing")}>
            <Zap size={15} /> Upgrade now
          </Button>
          <button onClick={onClose} className="mt-2 w-full py-2 text-center text-xs text-muted-foreground transition-colors hover:text-white">
            Maybe later
          </button>
        </div>
      </div>
    </div>
  );
}

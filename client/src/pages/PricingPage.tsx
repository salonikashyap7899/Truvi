import { useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Check, ArrowRight, Sparkles } from "lucide-react";
import { SiteNav } from "@/components/SiteNav";
import { Button } from "@/components/ui/button";
import CheckoutModal, { type CheckoutConfig } from "@/components/CheckoutModal";
import { PaymentMethodsRow, RazorpayBadge } from "@/components/PaymentTrust";
import { PRICING_TABS, type PriceItem, type PriceTab } from "@/lib/pricing";
import { useAuth } from "@/hooks/useAuth";

/** Each paying role sees only its own pricing. Guests/admins see all tabs. */
const ROLE_TAB: Record<string, PriceTab["key"]> = {
  BUYER: "buyer",
  CP: "cp",
  DEVELOPER: "developer",
};

export default function PricingPage() {
  const { user } = useAuth();
  const roleKey = user ? ROLE_TAB[user.role] : undefined;
  const visibleTabs = roleKey ? PRICING_TABS.filter((t) => t.key === roleKey) : PRICING_TABS;

  const [tab, setTab] = useState(0);
  const [checkout, setCheckout] = useState<CheckoutConfig | null>(null);
  const active = visibleTabs[tab] ?? visibleTabs[0];

  function startCheckout(item: PriceItem) {
    if (!item.planId) return;
    setCheckout({
      kind: item.cta === "subscribe" ? "subscription" : "order",
      title: item.title,
      planId: item.planId,
      priceLabel: item.price,
      yearlyPlanId: item.yearlyPlanId,
      yearlyPrice: item.yearlyPrice,
    });
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteNav />

      <main className="mx-auto max-w-6xl px-4 pt-28 pb-20 sm:px-6">
        {/* Header */}
        <div className="text-center">
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, letterSpacing: "0.3em" }}
            className="text-xs uppercase tracking-[0.3em] text-[var(--trust)]"
          >
            Pricing
          </motion.p>
          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="mt-3 font-display text-4xl font-semibold sm:text-5xl"
          >
            Simple, transparent pricing
          </motion.h1>
          <p className="mx-auto mt-3 max-w-xl text-sm text-muted-foreground sm:text-base">
            Launch offers live now. Pay only for what you use — most essentials are free.
          </p>
          <p className="mt-2 text-xs text-muted-foreground">Prices exclusive of 18% GST.</p>
        </div>

        {/* Tabs — hidden when the signed-in role only has one pricing group */}
        {visibleTabs.length > 1 && (
          <div className="mt-8 flex justify-center">
            <div className="inline-flex flex-wrap justify-center gap-1 rounded-full border border-white/10 glass p-1">
              {visibleTabs.map((t, i) => (
                <button
                  key={t.key}
                  onClick={() => setTab(i)}
                  className={`rounded-full px-4 py-2 text-sm font-medium transition-colors sm:px-5 ${
                    i === tab ? "bg-[var(--trust)] text-white shadow-[0_0_24px_-6px_var(--trust)]" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <p className="mt-4 text-center text-sm text-muted-foreground">{active.tagline}</p>

        {/* Cards */}
        <motion.div
          key={active.key}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          {active.items.map((item) => (
            <PricingCard key={item.title} item={item} onBuy={() => startCheckout(item)} />
          ))}
        </motion.div>

        {/* Trust row */}
        <div className="mt-12 flex flex-col items-center gap-3">
          <PaymentMethodsRow />
          <RazorpayBadge />
        </div>

        {/* Legal footer (required for Razorpay onboarding) */}
        <footer className="mt-12 border-t border-white/10 pt-6 text-center text-xs text-muted-foreground">
          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
            <Link to="/terms" className="hover:text-foreground">Terms of Service</Link>
            <Link to="/refund-policy" className="hover:text-foreground">Refund &amp; Cancellation</Link>
            <Link to="/privacy" className="hover:text-foreground">Privacy Policy</Link>
          </div>
          <p className="mt-4">Truvi Ventures · Truston Developers Pvt. Ltd., Lucknow, India</p>
        </footer>
      </main>

      {checkout && <CheckoutModal config={checkout} onClose={() => setCheckout(null)} />}
    </div>
  );
}

function PricingCard({ item, onBuy }: { item: PriceItem; onBuy: () => void }) {
  const isFree = item.cta === "free";
  return (
    <div className="flex flex-col rounded-3xl border border-white/10 glass p-5 transition hover:border-[var(--trust)]/40">
      <div className="flex-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-display text-lg font-semibold text-white">{item.title}</h3>
          {item.offer && (
            <span className="shrink-0 rounded-full border border-[var(--trust)]/30 bg-[var(--trust)]/10 px-2 py-0.5 text-[10px] font-medium text-[var(--trust)]">
              {item.offer}
            </span>
          )}
        </div>
        {item.desc && <p className="mt-1.5 text-sm text-muted-foreground">{item.desc}</p>}

        <div className="mt-4 flex items-baseline gap-2">
          <span className="font-display text-3xl font-semibold text-white">{item.price}</span>
          {item.unit && <span className="text-sm text-muted-foreground">{item.unit}</span>}
          {item.strike && <span className="text-sm text-muted-foreground line-through">{item.strike}</span>}
        </div>
      </div>

      <div className="mt-5">
        {item.cta === "buy" && (
          <Button onClick={onBuy} className="w-full">
            Buy Now <ArrowRight size={15} className="ml-1" />
          </Button>
        )}
        {item.cta === "subscribe" && (
          <Button onClick={onBuy} variant="secondary" className="w-full">
            <Sparkles size={15} className="mr-1" /> Subscribe
          </Button>
        )}
        {isFree && (
          <Link to="/join">
            <Button variant="outline" className="w-full">
              <Check size={15} className="mr-1" /> Get Started
            </Button>
          </Link>
        )}
      </div>
    </div>
  );
}

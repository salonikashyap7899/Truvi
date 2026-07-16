import { useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Check, ArrowRight, Sparkles, Search, FileText, ShieldCheck, Phone, Banknote,
  CalendarCheck, Gem, Star, UserPlus, BadgeCheck, Users, LayoutGrid, Building2,
  Box, LineChart, Megaphone, type LucideIcon,
} from "lucide-react";
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

/** A fitting icon per item (matched on the title). */
function iconFor(title: string): LucideIcon {
  const t = title.toLowerCase();
  if (t.includes("search")) return Search;
  if (t.includes("report")) return FileText;
  if (t.includes("verification") || t.includes("verified") || t.includes("badge")) return ShieldCheck;
  if (t.includes("call") || t.includes("consultant")) return Phone;
  if (t.includes("loan")) return Banknote;
  if (t.includes("visit")) return CalendarCheck;
  if (t.includes("concierge")) return Gem;
  if (t.includes("lead")) return Users;
  if (t.includes("crm")) return LayoutGrid;
  if (t.includes("registration") || t.includes("membership")) return t.includes("cp") ? UserPlus : Building2;
  if (t.includes("3d") || t.includes("mapping")) return Box;
  if (t.includes("analytics")) return LineChart;
  if (t.includes("marketing") || t.includes("campaign")) return Megaphone;
  if (t.includes("premium")) return BadgeCheck;
  if (t.includes("pro")) return Star;
  return Sparkles;
}

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
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      {/* Ambient brand glows */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-[-10%] h-[420px] w-[820px] -translate-x-1/2 rounded-full bg-[var(--trust)]/10 blur-[120px]" />
        <div className="absolute right-[-10%] top-[40%] h-[360px] w-[360px] rounded-full bg-[var(--trust)]/8 blur-[120px]" />
      </div>

      <SiteNav />

      <main className="mx-auto max-w-6xl px-4 pt-28 pb-24 sm:px-6">
        {/* Header */}
        <div className="text-center">
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="inline-flex items-center gap-2 rounded-full border border-[var(--trust)]/25 bg-[var(--trust)]/10 px-4 py-1.5 text-[11px] font-medium uppercase tracking-[0.25em] text-[var(--trust)]"
          >
            <Sparkles size={13} /> Pricing
          </motion.p>
          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="mx-auto mt-5 max-w-3xl font-display text-4xl font-semibold leading-[1.1] tracking-tight sm:text-6xl"
          >
            Pricing built for how you{" "}
            <span className="bg-gradient-to-r from-[var(--trust)] to-sky-300 bg-clip-text text-transparent">grow</span>
          </motion.h1>
          <p className="mx-auto mt-4 max-w-xl text-sm text-muted-foreground sm:text-base">
            Launch offers live now. Pay only for what you use — most essentials are free.
          </p>
        </div>

        {/* Tabs — hidden when the signed-in role has a single pricing group */}
        {visibleTabs.length > 1 && (
          <div className="mt-9 flex justify-center">
            <div className="inline-flex flex-wrap justify-center gap-1 rounded-full border border-white/10 bg-white/[0.03] p-1 backdrop-blur">
              {visibleTabs.map((t, i) => (
                <button
                  key={t.key}
                  onClick={() => setTab(i)}
                  className={`rounded-full px-5 py-2 text-sm font-medium transition-all ${
                    i === tab
                      ? "bg-[var(--trust)] text-white shadow-[0_0_30px_-8px_var(--trust)]"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <p className="mt-5 text-center text-sm text-muted-foreground">
          {active.tagline} <span className="text-foreground/50">· Prices exclusive of 18% GST</span>
        </p>

        {/* Cards */}
        <motion.div
          key={active.key}
          initial="hidden"
          animate="show"
          variants={{ hidden: {}, show: { transition: { staggerChildren: 0.05 } } }}
          className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3"
        >
          {active.items.map((item) => (
            <PricingCard key={item.title} item={item} onBuy={() => startCheckout(item)} />
          ))}
        </motion.div>

        {/* Trust row */}
        <div className="mt-14 flex flex-col items-center gap-3">
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
  const isFeatured = item.cta === "subscribe"; // Pro plans get the spotlight treatment
  const Icon = iconFor(item.title);

  return (
    <motion.div
      variants={{ hidden: { opacity: 0, y: 18 }, show: { opacity: 1, y: 0 } }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className={`group relative flex flex-col overflow-hidden rounded-3xl p-[1px] transition-transform duration-300 hover:-translate-y-1 ${
        isFeatured
          ? "bg-gradient-to-b from-[var(--trust)]/60 via-[var(--trust)]/20 to-transparent"
          : "bg-white/10"
      }`}
    >
      {/* Inner surface */}
      <div className="relative flex h-full flex-col rounded-[calc(1.5rem-1px)] bg-[#0a0e17]/90 p-6 backdrop-blur">
        {/* Hover glow */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-[calc(1.5rem-1px)] opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          style={{ boxShadow: "inset 0 1px 40px -12px rgba(59,130,246,0.35)" }}
        />

        {isFeatured && (
          <span className="absolute right-5 top-5 inline-flex items-center gap-1 rounded-full bg-[var(--trust)] px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white shadow-[0_0_20px_-4px_var(--trust)]">
            <Star size={10} fill="currentColor" /> Popular
          </span>
        )}

        {/* Top content — grows so the price/CTA block below always aligns across a row */}
        <div className="flex-1">
          {/* Icon */}
          <div className="grid size-12 place-items-center rounded-2xl bg-[var(--trust)]/12 text-[var(--trust)] ring-1 ring-inset ring-[var(--trust)]/25">
            <Icon size={22} />
          </div>

          <h3 className="mt-4 font-display text-lg font-semibold text-white">{item.title}</h3>
          {item.desc && <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{item.desc}</p>}

          {/* Offer chip */}
          {item.offer && (
            <span className="mt-3 inline-block rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2.5 py-0.5 text-[11px] font-medium text-emerald-300">
              {item.offer}
            </span>
          )}
        </div>

        {/* Price — pinned below the flexible content so it lines up across cards */}
        <div className="mt-5 flex items-end gap-2">
          <span className="font-display text-4xl font-semibold tracking-tight text-white">{item.price}</span>
          {item.unit && <span className="pb-1 text-sm text-muted-foreground">{item.unit}</span>}
          {item.strike && <span className="pb-1.5 text-sm text-muted-foreground/70 line-through">{item.strike}</span>}
        </div>
        {/* GST line kept in the layout for every card (invisible when free) so prices share a baseline */}
        <p className={`mt-1 text-[11px] text-muted-foreground/70 ${isFree ? "invisible" : ""}`}>+ 18% GST at checkout</p>

        {/* CTA */}
        <div className="mt-5">
          {item.cta === "buy" && (
            <Button onClick={onBuy} className="w-full">
              Buy Now <ArrowRight size={15} className="ml-1 transition-transform group-hover:translate-x-0.5" />
            </Button>
          )}
          {item.cta === "subscribe" && (
            <Button
              onClick={onBuy}
              className="w-full bg-gradient-to-r from-[var(--trust)] to-sky-400 text-white shadow-[0_0_30px_-8px_var(--trust)] hover:opacity-95"
            >
              <Sparkles size={15} className="mr-1.5" /> Subscribe
            </Button>
          )}
          {isFree && (
            <Link to="/join" className="block">
              <Button variant="outline" className="w-full">
                <Check size={15} className="mr-1.5" /> Get Started
              </Button>
            </Link>
          )}
        </div>
      </div>
    </motion.div>
  );
}

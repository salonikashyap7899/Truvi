/**
 * Pricing PAGE display data. Amounts here are for display only — when a user
 * checks out, the server (server/src/config/pricing.ts) is the source of truth
 * for what is actually charged. `planId` must match a server plan id.
 */

export type CtaKind = "buy" | "subscribe" | "free";

export interface PriceItem {
  planId?: string; // present for paid items; matches the server catalog
  title: string;
  desc?: string;
  price: string; // e.g. "₹28" or "Free"
  unit?: string; // e.g. "/report", "/month"
  strike?: string; // strike-through original, e.g. "₹299"
  offer?: string; // small highlight, e.g. "90% launch offer", "1st report free"
  cta: CtaKind;
  // Subscription-only: the yearly option shown alongside the monthly `planId`.
  yearlyPlanId?: string;
  yearlyPrice?: string;
}

export interface PriceTab {
  key: "buyer" | "cp" | "developer";
  label: string;
  tagline: string;
  items: PriceItem[];
}

export const PRICING_TABS: PriceTab[] = [
  {
    key: "buyer",
    label: "For Buyers",
    tagline: "Verified intelligence for your property decisions.",
    items: [
      { title: "Property Search", desc: "Browse verified listings and inventory.", price: "Free", cta: "free" },
      { planId: "buyer_ai_report", title: "AI Property Report", desc: "Full AI-generated intelligence report on any property.", price: "₹28", unit: "/report", strike: "₹299", offer: "90% launch offer · 1st report free", cta: "buy" },
      { planId: "buyer_premium_verification", title: "Premium + Document Verification", desc: "Deep verification with document checks.", price: "₹99", unit: "/report", strike: "₹999", offer: "1st & 2nd free", cta: "buy" },
      { planId: "buyer_consultant_call", title: "Property Consultant Call", desc: "1:1 call with a Truvi property expert.", price: "₹49", unit: "/call", strike: "₹449", offer: "1st call free", cta: "buy" },
      { title: "Home Loan Assistance", desc: "Get matched with the right home loan.", price: "Free", cta: "free" },
      { title: "Property Visit Booking", desc: "Schedule a verified site visit.", price: "Free", cta: "free" },
      { planId: "buyer_concierge", title: "Concierge Buying Service", desc: "End-to-end managed buying, done for you.", price: "₹5,999", strike: "₹39,999", cta: "buy" },
      { planId: "buyer_pro_monthly", title: "Buyer Pro", desc: "Unlimited reports, priority support & more.", price: "₹299", unit: "/month", offer: "or ₹1,999/year", cta: "subscribe", yearlyPlanId: "buyer_pro_yearly", yearlyPrice: "₹1,999" },
    ],
  },
  {
    key: "cp",
    label: "For Channel Partners",
    tagline: "Tools and leads to close more deals.",
    items: [
      { title: "CP Registration", desc: "Join the Truvi channel partner network.", price: "Free", cta: "free" },
      { planId: "cp_premium_membership", title: "Premium CP Membership", desc: "Premium access for 6 months.", price: "₹99", unit: "/6 months", strike: "₹999", cta: "buy" },
      { planId: "cp_verified_badge", title: "Verified CP Badge", desc: "Official email + 24/7 support + template book.", price: "₹999", unit: "/6 months", strike: "₹2,999", offer: "1st & 2nd month free", cta: "buy" },
      { planId: "cp_lead_purchase", title: "Lead Purchase", desc: "Verified buyer contact data.", price: "₹99", unit: "/lead", strike: "₹999", cta: "buy" },
      { planId: "cp_crm", title: "CRM Access", desc: "Manage your leads and pipeline.", price: "₹99", unit: "/month", cta: "buy" },
      { planId: "cp_pro_monthly", title: "CP Pro", desc: "Everything, unlimited, with priority leads.", price: "₹999", unit: "/month", offer: "or ₹9,999/year", cta: "subscribe", yearlyPlanId: "cp_pro_yearly", yearlyPrice: "₹9,999" },
    ],
  },
  {
    key: "developer",
    label: "For Developers",
    tagline: "List, verify and market your projects.",
    items: [
      { title: "Registration & Inventory Listing", desc: "List your projects and inventory.", price: "Free", offer: "Launch offer", cta: "free" },
      { planId: "dev_verified_badge", title: "Verified Developer Badge", desc: "Prime listing with the verified badge.", price: "₹999", strike: "₹4,999", cta: "buy" },
      { planId: "dev_3d_mapping", title: "3D Mapping", desc: "Interactive 3D master plan for your project.", price: "₹99", strike: "₹999", cta: "buy" },
      { planId: "dev_crm", title: "Developer CRM", desc: "Manage leads and sales.", price: "₹49", unit: "/month", strike: "₹449", cta: "buy" },
      { planId: "dev_ai_analytics", title: "AI Analytics Dashboard", desc: "AI-powered project analytics.", price: "₹999", strike: "₹4,999", cta: "buy" },
      { planId: "dev_marketing_campaign", title: "Marketing Campaign", desc: "Full managed marketing campaign.", price: "₹1,00,000", strike: "₹2,00,000", cta: "buy" },
      { planId: "dev_pro_monthly", title: "Developer Pro", desc: "All tools, unlimited, top placement.", price: "₹9,999", unit: "/month", offer: "or ₹99,999/year", cta: "subscribe", yearlyPlanId: "dev_pro_yearly", yearlyPrice: "₹99,999" },
    ],
  },
];

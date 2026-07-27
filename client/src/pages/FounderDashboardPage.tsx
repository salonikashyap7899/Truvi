import DashboardOS, { type DashboardOSConfig, type Overview } from "@/pages/dashboard/DashboardOS";

/**
 * Founder Dashboard — the full CEO Operating System.
 * Founder has 100% access: every operational module PLUS the Founder-only
 * sections (Team, Marketing, Land Bank, Investor) and the AI Copilot.
 */
const config: DashboardOSConfig = {
  brandSub: "CEO OS",
  roleLabel: "Founder",
  fallbackName: "Founder",
  overviewTitle: "Founder Command Center",
  overviewSub: "Real-time snapshot across revenue, growth, trust & operations · Live data",
  showCopilot: true,
  buildNav: (d: Overview) => [
    { group: "Command", items: [{ key: "overview", label: "Command Center", icon: "grid" }] },
    { group: "Business", items: [
      { key: "sales", label: "Sales CRM", icon: "chart" },
      { key: "leads", label: "Lead Management", icon: "spark" },
      { key: "referrals", label: "Referral Leads", icon: "users" },
      { key: "partners", label: "Channel Partners", icon: "users" },
      { key: "developers", label: "Developers", icon: "building" },
      { key: "projects", label: "Projects", icon: "building" },
      { key: "inventory", label: "Inventory", icon: "grid" },
      { key: "bookings", label: "Bookings", icon: "target" },
      { key: "crm", label: "Customers", icon: "users", count: d.crm.followUpsDue || undefined },
      { key: "finance", label: "Finance", icon: "wallet" },
    ] },
    { group: "Trust & Operations", items: [
      { key: "verification", label: "Verification", icon: "shield", count: d.executive.pendingActions || undefined },
      { key: "legal", label: "Legal", icon: "book" },
      { key: "support", label: "Support", icon: "bell", count: d.crm.enquiries || undefined },
      { key: "cx", label: "Customer Experience", icon: "spark" },
      { key: "operations", label: "Operations", icon: "grid" },
    ] },
    { group: "Intelligence", items: [
      { key: "kpi", label: "KPIs", icon: "target" },
      { key: "analytics", label: "Analytics", icon: "chart" },
      { key: "insights", label: "AI Insights", icon: "spark" },
      { key: "reports", label: "Reports", icon: "book" },
    ] },
    { group: "Founder-only", items: [
      { key: "team", label: "Team", icon: "team" },
      { key: "marketing", label: "Marketing", icon: "mega" },
      { key: "land", label: "Land Bank", icon: "land" },
      { key: "investor", label: "Investor", icon: "trophy" },
    ] },
  ],
};

export default function FounderDashboardPage() {
  return <DashboardOS config={config} />;
}

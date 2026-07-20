import DashboardOS, { type DashboardOSConfig, type Overview } from "@/pages/dashboard/DashboardOS";

/**
 * Admin Dashboard — same CEO-OS interface as the Founder Dashboard, scoped to
 * the operational modules per the RBAC rule. Admin mirrors every common
 * operational section (operations, sales/CRM, projects, customers, finance,
 * verification, KPIs, AI insights) but NOT the Founder-only sections
 * (Team, Marketing, Land Bank, Investor / Cap Table / ESOP) and NOT the full
 * AI Copilot. Adding modules here removes nothing from the Founder view.
 */
const config: DashboardOSConfig = {
  brandSub: "Admin OS",
  roleLabel: "Admin",
  fallbackName: "Admin",
  overviewTitle: "Admin Command Center",
  overviewSub: "Platform-wide operations across revenue, growth, trust & verification · Live data",
  showCopilot: false,
  buildNav: (d: Overview) => [
    { group: "Command", items: [{ key: "overview", label: "Command Center", icon: "grid" }] },
    { group: "Operations", items: [
      { key: "sales", label: "Sales CRM", icon: "chart" },
      { key: "projects", label: "Projects", icon: "building" },
      { key: "crm", label: "Customers", icon: "users", count: d.crm.followUpsDue || undefined },
      { key: "finance", label: "Finance", icon: "wallet" },
    ] },
    { group: "Trust & Growth", items: [
      { key: "verification", label: "Verification", icon: "shield", count: d.executive.pendingActions || undefined },
      { key: "kpi", label: "KPIs", icon: "target" },
      { key: "insights", label: "AI Insights", icon: "spark" },
    ] },
  ],
};

export default function AdminOsDashboardPage() {
  return <DashboardOS config={config} />;
}

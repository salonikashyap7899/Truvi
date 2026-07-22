import { Link, useLocation } from "react-router-dom";
import { BarChart3, Bot, Building2, CalendarCheck2, FolderLock, GraduationCap, KanbanSquare, LayoutDashboard, Trophy, Users } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The 6-hub information architecture for the CP workspace:
 * Sales · AI · Business · Learning · Community · Growth (+ Overview home).
 */
const HUBS: { to: string; label: string; icon: typeof LayoutDashboard; pro?: boolean; tooltip?: string }[] = [
  { to: "/cp/dashboard", label: "Overview", icon: LayoutDashboard },
  { to: "/cp/sales", label: "Sales Hub", icon: KanbanSquare, pro: true },
  { to: "/crm/pipeline", label: "Pipeline", icon: KanbanSquare },
  { to: "/bookings", label: "Bookings", icon: CalendarCheck2 },
  { to: "/vault", label: "Vault", icon: FolderLock },
  { to: "/cp/ai", label: "AI Hub", icon: Bot },
  { to: "/cp/business", label: "Business Hub", icon: BarChart3 },
  { to: "/cp/academy", label: "Learning Hub", icon: GraduationCap },
  { to: "/cp/connect", label: "Community Hub", icon: Users },
  { to: "/cp/growth", label: "Growth Hub", icon: Trophy },
  { to: "/cp/onboard-developers", label: "Developer Enrollment", icon: Building2, tooltip: "Enroll a Developer — Earn 2% on Every Transaction by Your Referred Developer." },
];

export function CpHubNav() {
  const { pathname } = useLocation();
  return (
    <nav className="mt-5 flex gap-2 overflow-x-auto pb-1" aria-label="CP hubs">
      {HUBS.map(({ to, label, icon: Icon, pro, tooltip }) => {
        const active = pathname === to;
        return (
          <Link
            key={to}
            to={to}
            title={tooltip}
            className={cn(
              "flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm transition-colors",
              active
                ? "border-[var(--trust)]/60 bg-[var(--trust)]/15 text-white"
                : "border-white/10 bg-white/[0.03] text-muted-foreground hover:bg-white/[0.08] hover:text-white"
            )}
          >
            <Icon size={14} />
            {label}
            {pro && (
              <span className="rounded-full bg-gradient-to-r from-amber-400 to-orange-500 px-1.5 py-px text-[9px] font-bold uppercase text-white">
                CRM
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

import { Link, useLocation } from "react-router-dom";
import { LayoutDashboard, Boxes, CalendarCheck2, FolderLock, KanbanSquare, BrainCircuit, Megaphone } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The developer workspace information architecture — one home + four hubs that
 * map to the Developer OS spec: Inventory (free core), Sales CRM (paid), AI
 * Analytics (paid) and Marketing (paid). Locked hubs still show so free
 * developers can see what they're missing.
 */
const HUBS = [
  { to: "/developer/dashboard", label: "Overview", icon: LayoutDashboard },
  { to: "/developer/inventory", label: "Inventory", icon: Boxes },
  { to: "/developer/crm", label: "Sales CRM", icon: KanbanSquare, badge: "CRM" },
  { to: "/crm/pipeline", label: "Pipeline", icon: KanbanSquare },
  { to: "/bookings", label: "Bookings", icon: CalendarCheck2 },
  { to: "/vault", label: "Vault", icon: FolderLock },
  { to: "/developer/analytics", label: "AI Analytics", icon: BrainCircuit, badge: "AI" },
  { to: "/developer/campaigns", label: "Marketing", icon: Megaphone, badge: "Pro" },
];

export function DevHubNav() {
  const { pathname } = useLocation();
  return (
    <nav className="mt-5 flex gap-2 overflow-x-auto pb-1" aria-label="Developer hubs">
      {HUBS.map(({ to, label, icon: Icon, badge }) => {
        const active = pathname === to;
        return (
          <Link
            key={to}
            to={to}
            className={cn(
              "flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm transition-colors",
              active
                ? "border-[var(--trust)]/60 bg-[var(--trust)]/15 text-white"
                : "border-white/10 bg-white/[0.03] text-muted-foreground hover:bg-white/[0.08] hover:text-white",
            )}
          >
            <Icon size={14} />
            {label}
            {badge && (
              <span className="rounded-full bg-gradient-to-r from-amber-400 to-orange-500 px-1.5 py-px text-[9px] font-bold uppercase text-white">
                {badge}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

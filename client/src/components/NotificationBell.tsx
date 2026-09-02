import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bell, CheckCheck, Building2, Home, Wallet, Users, CalendarClock,
  TrendingUp, Megaphone, ShieldAlert, ListChecks, type LucideIcon,
} from "lucide-react";
import { api } from "@/lib/api";
import { useSocketEvent } from "@/lib/socket";
import type { Notification } from "@/types";
import { formatDate } from "@/lib/utils";
import { toast } from "sonner";

/** Per-session guard so a notification is toasted at most once (survives the
 *  real-time emit AND the on-load catch-up without double-popping). */
const TOASTED_KEY = "truvi_toasted_notifs";
function wasToasted(id: string): boolean {
  try {
    return (JSON.parse(sessionStorage.getItem(TOASTED_KEY) || "[]") as string[]).includes(id);
  } catch {
    return false;
  }
}
function markToasted(id: string): void {
  try {
    const arr = JSON.parse(sessionStorage.getItem(TOASTED_KEY) || "[]") as string[];
    if (!arr.includes(id)) {
      arr.push(id);
      sessionStorage.setItem(TOASTED_KEY, JSON.stringify(arr.slice(-100)));
    }
  } catch {
    /* ignore */
  }
}

/** Pick an icon + accent for a notification from its `type`. */
function iconFor(type?: string): { Icon: LucideIcon; cls: string } {
  const t = type ?? "general";
  if (t.startsWith("project")) return { Icon: Building2, cls: "text-sky-400" };
  if (t.startsWith("property") || t === "new_property") return { Icon: Home, cls: "text-emerald-400" };
  if (t === "commission_earned") return { Icon: Wallet, cls: "text-amber-400" };
  if (t.includes("referr")) return { Icon: Users, cls: "text-violet-400" };
  if (t.startsWith("lead")) return { Icon: Users, cls: "text-blue-400" };
  if (t.includes("task")) return { Icon: ListChecks, cls: "text-teal-400" };
  if (t.startsWith("meeting")) return { Icon: CalendarClock, cls: "text-indigo-400" };
  if (t.includes("investment") || t === "investment_opportunity") return { Icon: TrendingUp, cls: "text-emerald-400" };
  if (t === "system_announcement") return { Icon: Megaphone, cls: "text-pink-400" };
  if (t === "security_alert") return { Icon: ShieldAlert, cls: "text-red-400" };
  return { Icon: Bell, cls: "text-muted-foreground" };
}

/** Where a notification navigates when tapped, if it carries a deep link. */
function hrefFor(n: Notification): string | null {
  const href = n.data?.href;
  return typeof href === "string" && href.startsWith("/") ? href : null;
}

export function NotificationBell() {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    api
      .get("/notifications")
      .then((res) => {
        const list: Notification[] = res.data.notifications ?? [];
        setNotifications(list);
        // Pop up notifications that arrived while we were offline — e.g. the
        // welcome + onboarding notifications created at signup, BEFORE this
        // user's socket connected (so the real-time emit was missed). Only
        // fresh (<10 min), unread, and shown once per browser session.
        try {
          const cutoff = Date.now() - 10 * 60 * 1000;
          const fresh = list
            .filter((n) => !n.isRead && new Date(n.createdAt).getTime() > cutoff && !wasToasted(n._id))
            .slice(0, 3)
            .reverse();
          for (const n of fresh) {
            toast.info(n.title || n.message);
            markToasted(n._id);
          }
        } catch {
          /* ignore */
        }
      })
      .catch(() => {});
    api.get("/notifications/unread-count").then((res) => setUnread(res.data.count ?? 0)).catch(() => {});
  }, []);

  // Real-time: new notifications appear instantly and bump the badge.
  useSocketEvent<Notification>("notification:new", (n) => {
    setNotifications((prev) => (prev.some((p) => p._id === n._id) ? prev : [n, ...prev]));
    setUnread((c) => c + 1);
    if (!wasToasted(n._id)) {
      toast.info(n.title || n.message);
      markToasted(n._id);
    }
  });

  async function markRead(n: Notification) {
    if (n.isRead) return;
    setNotifications((prev) => prev.map((p) => (p._id === n._id ? { ...p, isRead: true } : p)));
    setUnread((c) => Math.max(0, c - 1));
    await api.patch(`/notifications/${n._id}/read`).catch(() => {});
  }

  async function markAllRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setUnread(0);
    await api.patch("/notifications/read-all").catch(() => {});
  }

  function onTap(n: Notification) {
    void markRead(n);
    const href = hrefFor(n);
    if (href) {
      setOpen(false);
      navigate(href);
    }
  }

  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className="relative rounded-full p-2 hover:bg-white/10" aria-label="Notifications">
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 max-w-[calc(100vw-3rem)] rounded-2xl border border-white/10 bg-[#0a0d14]/95 p-2 shadow-2xl shadow-black/50 backdrop-blur-xl">
          <div className="flex items-center justify-between px-2 py-1">
            <p className="text-xs font-medium text-muted-foreground">Notifications</p>
            {unread > 0 && (
              <button onClick={markAllRead} className="inline-flex items-center gap-1 text-[11px] font-medium text-sky-300 hover:text-sky-200">
                <CheckCheck size={12} /> Mark all read
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 && <p className="p-3 text-sm text-muted-foreground">No notifications yet.</p>}
            {notifications.map((n) => {
              const { Icon, cls } = iconFor(n.type);
              const clickable = !!hrefFor(n);
              return (
                <button
                  key={n._id}
                  onClick={() => onTap(n)}
                  className={`flex w-full items-start gap-2.5 rounded-md p-2 text-left text-sm transition hover:bg-white/5 ${clickable ? "cursor-pointer" : "cursor-default"}`}
                >
                  <span className={`mt-0.5 shrink-0 ${cls}`}><Icon size={16} /></span>
                  <span className="min-w-0 flex-1">
                    {n.title && <span className="block font-semibold text-white">{n.title}</span>}
                    <span className={`block ${n.title ? "text-muted-foreground" : "text-white"}`}>{n.message}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">{formatDate(n.createdAt)}</span>
                  </span>
                  {!n.isRead && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-sky-400" aria-label="Unread" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

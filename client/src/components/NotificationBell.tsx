import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { api } from "@/lib/api";
import { useSocketEvent } from "@/lib/socket";
import type { Notification } from "@/types";
import { formatDate } from "@/lib/utils";
import { toast } from "sonner";

export function NotificationBell() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    api.get("/notifications").then((res) => setNotifications(res.data.notifications));
  }, []);

  // Real-time push: new notifications appear instantly without polling.
  useSocketEvent<Notification>("notification:new", (notification) => {
    setNotifications((prev) => [notification, ...prev]);
    toast.info(notification.message);
  });

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  async function markAllRead() {
    await api.patch("/notifications/read-all");
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
  }

  return (
    <div className="relative">
      <button
        onClick={() => {
          setOpen(!open);
          if (!open && unreadCount > 0) markAllRead();
        }}
        className="relative rounded-full p-2 hover:bg-white/10"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
            {unreadCount}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-2 w-80 rounded-lg border border-white/10 glass p-2 shadow-xl">
          <p className="px-2 py-1 text-xs font-medium text-muted-foreground">Notifications</p>
          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 && <p className="p-3 text-sm text-muted-foreground">No notifications yet.</p>}
            {notifications.map((n) => (
              <div key={n._id} className="rounded-md p-2 text-sm hover:bg-white/5">
                <p className="text-white">{n.message}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{formatDate(n.createdAt)}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

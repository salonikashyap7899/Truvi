import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";

/**
 * Registers the installed app for phone push notifications (FCM) and makes
 * every push appear in the tray. Renders nothing.
 *
 * - Background/closed app → the OS shows the FCM push in the tray automatically.
 * - Foreground app → the OS hands the push to `pushNotificationReceived`
 *   instead of showing it, so we re-post it as a LOCAL notification (which DOES
 *   show in the tray). This is what makes a new user's welcome/onboarding push
 *   — delivered the moment they log in, app open — appear in the tray too.
 *
 * IMPORTANT: the native listeners are installed exactly ONCE per app run
 * (module-level `nativeReady`), not once per React render. Re-adding them on
 * every auth change / route change stacked multiple handlers, so a single push
 * was re-posted several times — that was the "spam / duplicate notifications".
 * A short content de-dupe (`recent`) is a second guard against the same push
 * being delivered twice in quick succession.
 */
let nativeReady = false;
const recent = new Map<string, number>();

export default function PushRegistration() {
  const navigate = useNavigate();
  const accessToken = useAuthStore((s) => s.accessToken);

  useEffect(() => {
    if (!Capacitor.isNativePlatform() || !accessToken) return;

    const go = (href: unknown) => {
      if (typeof href === "string" && href.startsWith("/")) navigate(href);
    };

    (async () => {
      try {
        const { PushNotifications } = await import("@capacitor/push-notifications");
        let LocalNotifications:
          | typeof import("@capacitor/local-notifications").LocalNotifications
          | null = null;
        try {
          ({ LocalNotifications } = await import("@capacitor/local-notifications"));
        } catch {
          /* plugin not in this build — foreground pushes stay in-app */
        }

        // Install listeners + channels once for the whole app lifetime, so a
        // push is never handled by more than one listener.
        if (!nativeReady) {
          nativeReady = true;

          try {
            await PushNotifications.createChannel({
              id: "truvi_default", name: "Truvi", description: "Truvi updates",
              importance: 5, visibility: 1, vibration: true,
            });
          } catch { /* iOS / unsupported */ }
          try {
            await LocalNotifications?.createChannel({
              id: "truvi_default", name: "Truvi", description: "Truvi updates",
              importance: 5, visibility: 1, vibration: true,
            });
          } catch { /* ignore */ }

          await PushNotifications.addListener("registration", (token) => {
            api.post("/notifications/push-token", { token: token.value, platform: "android" }).catch(() => {});
          });

          await PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
            go(action.notification?.data?.href);
          });

          // Foreground push → re-post as a tray (local) notification, de-duped.
          await PushNotifications.addListener("pushNotificationReceived", (notif) => {
            if (!LocalNotifications) return;
            const data = (notif.data ?? {}) as Record<string, unknown>;
            const title = notif.title || (typeof data.title === "string" ? data.title : "Truvi");
            const body = notif.body || (typeof data.body === "string" ? data.body : "");
            const key = `${title}|${body}`;
            const now = Date.now();
            for (const [k, t] of recent) if (now - t > 15000) recent.delete(k);
            if (recent.has(key) && now - (recent.get(key) ?? 0) < 8000) return; // duplicate within 8s
            recent.set(key, now);
            LocalNotifications.schedule({
              notifications: [{
                id: now % 2_000_000_000,
                title, body,
                channelId: "truvi_default",
                // Truvi monochrome notification icon (add via Android Studio →
                // Image Asset → Notification Icons, named `ic_stat_truvi`).
                smallIcon: "ic_stat_truvi",
                extra: data,
              }],
            }).catch(() => {});
          });

          if (LocalNotifications) {
            await LocalNotifications.addListener("localNotificationActionPerformed", (a) => {
              go((a.notification.extra as Record<string, unknown> | undefined)?.href);
            });
          }
        }

        // On each auth change: ensure permission, then (re)register so the token
        // is tied to the current user. Cheap and idempotent.
        let perm = await PushNotifications.checkPermissions();
        if (perm.receive === "prompt" || perm.receive === "prompt-with-rationale") {
          perm = await PushNotifications.requestPermissions();
        }
        try { await LocalNotifications?.requestPermissions(); } catch { /* ignore */ }
        if (perm.receive === "granted") await PushNotifications.register();
      } catch {
        /* plugin unavailable (older build) — ignore */
      }
    })();
    // Listeners persist for the app lifetime by design — no teardown here.
  }, [accessToken, navigate]);

  return null;
}

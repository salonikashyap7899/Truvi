import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";

/**
 * Registers the installed app for phone push notifications (FCM) and forwards
 * the device token to the server, so a signed-in user gets tray notifications.
 * Renders nothing.
 *
 * Two delivery cases, both end up in the phone's notification tray:
 *  - App in BACKGROUND / closed → Android shows the FCM push in the tray
 *    automatically (this is what admins already see).
 *  - App in FOREGROUND → Android does NOT auto-show FCM pushes; it hands them
 *    to `pushNotificationReceived` instead. That is exactly the case for a
 *    brand-new user, whose welcome/onboarding push is delivered the moment they
 *    log in (app open). So here we re-post it as a LOCAL notification, which
 *    DOES appear in the tray — making it look identical to the admin's push.
 *
 * No double-notification: `pushNotificationReceived` fires only in the
 * foreground; in the background the OS shows the tray push and this handler
 * never runs.
 *
 * Plugins are imported dynamically so the web bundle never loads them; on the
 * web this whole component is a no-op.
 */
export default function PushRegistration() {
  const navigate = useNavigate();
  const accessToken = useAuthStore((s) => s.accessToken);

  useEffect(() => {
    if (!Capacitor.isNativePlatform() || !accessToken) return;
    let cleanup: (() => void) | undefined;

    const go = (href: unknown) => {
      if (typeof href === "string" && href.startsWith("/")) navigate(href);
    };

    (async () => {
      try {
        const { PushNotifications } = await import("@capacitor/push-notifications");
        // Local notifications let us surface a FOREGROUND push in the tray.
        // Guarded: if the plugin isn't in this build, foreground pushes simply
        // stay in-app (older behaviour) instead of throwing.
        let LocalNotifications:
          | typeof import("@capacitor/local-notifications").LocalNotifications
          | null = null;
        try {
          ({ LocalNotifications } = await import("@capacitor/local-notifications"));
        } catch {
          /* plugin not in this APK — degrade gracefully */
        }

        // Channels (Android 8+). Same id for push + local so they look identical.
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

        // Forward the device token to the server on (re)registration.
        const regHandle = await PushNotifications.addListener("registration", (token) => {
          api.post("/notifications/push-token", { token: token.value, platform: "android" }).catch(() => {});
        });

        // Tap on a background/tray FCM push → deep-link.
        const tapHandle = await PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
          go(action.notification?.data?.href);
        });

        // FOREGROUND FCM push → re-post as a local (tray) notification so the
        // user sees it in the tray, not only inside the app.
        const fgHandle = await PushNotifications.addListener("pushNotificationReceived", (notif) => {
          if (!LocalNotifications) return;
          const data = (notif.data ?? {}) as Record<string, unknown>;
          LocalNotifications.schedule({
            notifications: [{
              id: Math.floor(Math.random() * 2_000_000_000),
              title: notif.title || (typeof data.title === "string" ? data.title : "Truvi"),
              body: notif.body || (typeof data.body === "string" ? data.body : ""),
              channelId: "truvi_default",
              extra: data,
            }],
          }).catch(() => {});
        });

        // Tap on a local (foreground-reposted) notification → deep-link.
        let localTapHandle: { remove: () => void } | undefined;
        if (LocalNotifications) {
          localTapHandle = await LocalNotifications.addListener("localNotificationActionPerformed", (a) => {
            go((a.notification.extra as Record<string, unknown> | undefined)?.href);
          });
        }

        cleanup = () => {
          void regHandle.remove();
          void tapHandle.remove();
          void fgHandle.remove();
          void localTapHandle?.remove();
        };

        // Ask permission (Android 13+ requires it) for both push + local, then register.
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

    return () => cleanup?.();
  }, [accessToken, navigate]);

  return null;
}

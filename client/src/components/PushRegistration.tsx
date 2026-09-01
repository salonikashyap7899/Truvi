import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";

/**
 * Registers the installed app for phone push notifications (FCM) and forwards
 * the device token to the server, so a signed-in user gets tray notifications
 * even when the app is closed. Renders nothing.
 *
 * - No-op on the web (only runs on the native platform).
 * - Runs once the user is authenticated, so the token is tied to their account.
 * - Tapping a push deep-links into the app via the notification's `data.href`.
 *
 * The plugin is imported dynamically so the web bundle never loads it.
 */
export default function PushRegistration() {
  const navigate = useNavigate();
  const accessToken = useAuthStore((s) => s.accessToken);

  useEffect(() => {
    if (!Capacitor.isNativePlatform() || !accessToken) return;
    let cleanup: (() => void) | undefined;

    (async () => {
      try {
        const { PushNotifications } = await import("@capacitor/push-notifications");

        // Listeners first, so we never miss the token event fired by register().
        const regHandle = await PushNotifications.addListener("registration", (token) => {
          api.post("/notifications/push-token", { token: token.value, platform: "android" }).catch(() => {});
        });
        const tapHandle = await PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
          const href = action.notification?.data?.href;
          if (typeof href === "string" && href.startsWith("/")) navigate(href);
        });
        cleanup = () => { void regHandle.remove(); void tapHandle.remove(); };

        // Ask permission (Android 13+ requires it), then register with FCM.
        let perm = await PushNotifications.checkPermissions();
        if (perm.receive === "prompt" || perm.receive === "prompt-with-rationale") {
          perm = await PushNotifications.requestPermissions();
        }
        if (perm.receive === "granted") await PushNotifications.register();
      } catch {
        /* plugin unavailable (older build) — ignore */
      }
    })();

    return () => cleanup?.();
  }, [accessToken, navigate]);

  return null;
}

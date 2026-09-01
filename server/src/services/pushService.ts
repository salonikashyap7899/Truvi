/**
 * Phone push notifications via Firebase Cloud Messaging (FCM).
 *
 * Runs ALONGSIDE the in-app bell and WhatsApp — never replaces them. Delivers a
 * tray notification to a user's device(s) even when the app is closed.
 *
 * Fully DORMANT until credentials are configured: with no FCM service account
 * set, every function is a safe no-op, so nothing breaks before setup.
 *
 * Setup (one-time):
 *   1. Create a Firebase project and add an Android app with package
 *      `com.truviventures.app`. Download `google-services.json` into the
 *      Android project (client/android/app/) and rebuild the APK.
 *   2. Firebase Console → Project settings → Service accounts → Generate new
 *      private key. This gives a service-account JSON.
 *   3. Base64-encode that JSON and put it in server/.env as one line:
 *        FCM_SERVICE_ACCOUNT_BASE64=<base64 of the service-account json>
 *      (base64 avoids newline issues with the private key). Restart the server.
 *
 * Never throws into the caller — a push failure must not affect the app.
 */
import type { App } from "firebase-admin/app";

let appPromise: Promise<App | null> | null = null;

function loadServiceAccount(): Record<string, unknown> | null {
  const b64 = process.env.FCM_SERVICE_ACCOUNT_BASE64;
  const raw = process.env.FCM_SERVICE_ACCOUNT;
  try {
    if (b64) return JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
    if (raw) return JSON.parse(raw);
  } catch (err) {
    console.warn("[push] invalid FCM service account:", err instanceof Error ? err.message : err);
  }
  return null;
}

/** True only when an FCM service account is configured. */
export function isPushEnabled(): boolean {
  return Boolean(process.env.FCM_SERVICE_ACCOUNT_BASE64 || process.env.FCM_SERVICE_ACCOUNT);
}

/** Lazily initialise the firebase-admin app once. Returns null if not configured. */
async function getApp(): Promise<App | null> {
  if (!isPushEnabled()) return null;
  if (!appPromise) {
    appPromise = (async () => {
      try {
        const { initializeApp, cert, getApps } = await import("firebase-admin/app");
        if (getApps().length) return getApps()[0]!;
        const sa = loadServiceAccount();
        if (!sa) return null;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return initializeApp({ credential: cert(sa as any) });
      } catch (err) {
        console.warn("[push] init failed:", err instanceof Error ? err.message : err);
        return null;
      }
    })();
  }
  return appPromise;
}

export interface PushPayload {
  title: string;
  body: string;
  /** Deep-link + metadata; values are coerced to strings for FCM. */
  data?: Record<string, unknown>;
}

/**
 * Send a push to every device token owned by the given users. Fetches tokens,
 * sends via FCM, and prunes tokens FCM reports as permanently invalid. Entirely
 * fire-and-forget safe — never throws.
 */
export async function sendPushToUsers(userIds: string[], payload: PushPayload): Promise<void> {
  if (!isPushEnabled()) return;
  const ids = Array.from(new Set(userIds.filter(Boolean)));
  if (ids.length === 0) return;

  try {
    const app = await getApp();
    if (!app) return;

    // Imported here (not at top) so the DB layer isn't pulled in when push is off.
    const { getDb } = await import("../config/db");
    const { userPushTokens } = await import("../db/schema");
    const { inArray } = await import("drizzle-orm");
    const { getMessaging } = await import("firebase-admin/messaging");

    const db = getDb();
    const rows = await db
      .select({ token: userPushTokens.token })
      .from(userPushTokens)
      .where(inArray(userPushTokens.userId, ids));
    const tokens = rows.map((r) => r.token).filter(Boolean);
    if (tokens.length === 0) return;

    const data: Record<string, string> = {};
    for (const [k, v] of Object.entries(payload.data ?? {})) data[k] = String(v);

    const res = await getMessaging(app).sendEachForMulticast({
      tokens,
      notification: { title: payload.title, body: payload.body },
      data,
      android: { priority: "high", notification: { channelId: "truvi_default" } },
    });

    // Prune tokens FCM says are dead so we don't keep trying them.
    const dead: string[] = [];
    res.responses.forEach((r, i) => {
      const code = r.error?.code;
      if (code === "messaging/registration-token-not-registered" || code === "messaging/invalid-registration-token") {
        dead.push(tokens[i]!);
      }
    });
    if (dead.length) {
      await db.delete(userPushTokens).where(inArray(userPushTokens.token, dead));
    }
  } catch (err) {
    console.warn("[push] send error:", err instanceof Error ? err.message : err);
  }
}

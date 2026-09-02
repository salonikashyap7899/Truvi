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
import { readFileSync } from "fs";
import type { App } from "firebase-admin/app";

let appPromise: Promise<App | null> | null = null;

function loadServiceAccount(): Record<string, unknown> | null {
  const file = process.env.FCM_SERVICE_ACCOUNT_FILE;
  const b64 = process.env.FCM_SERVICE_ACCOUNT_BASE64;
  const raw = process.env.FCM_SERVICE_ACCOUNT;
  try {
    // Easiest: point at a JSON file on the server (no base64 needed).
    if (file) return JSON.parse(readFileSync(file, "utf8"));
    if (b64) return JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
    if (raw) return JSON.parse(raw);
  } catch (err) {
    console.warn("[push] invalid FCM service account:", err instanceof Error ? err.message : err);
  }
  return null;
}

/** True only when an FCM service account is configured (file, base64 or raw). */
export function isPushEnabled(): boolean {
  return Boolean(
    process.env.FCM_SERVICE_ACCOUNT_FILE ||
      process.env.FCM_SERVICE_ACCOUNT_BASE64 ||
      process.env.FCM_SERVICE_ACCOUNT,
  );
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
export async function sendPushToUsers(
  userIds: string[],
  payload: PushPayload,
  /**
   * Optional map of userId → the notification row id created for that user in
   * this batch. After a successful send, the rows for users who actually had a
   * device are stamped `pushed_at`, so the catch-up path (on device
   * registration) never re-pushes an already-delivered notification.
   */
  notifIdByUser?: Record<string, string>,
): Promise<void> {
  if (!isPushEnabled()) return;
  const ids = Array.from(new Set(userIds.filter(Boolean)));
  if (ids.length === 0) return;

  try {
    const app = await getApp();
    if (!app) return;

    // Imported here (not at top) so the DB layer isn't pulled in when push is off.
    const { getDb } = await import("../config/db");
    const { userPushTokens, notifications } = await import("../db/schema");
    const { inArray } = await import("drizzle-orm");
    const { getMessaging } = await import("firebase-admin/messaging");

    const db = getDb();
    const rows = await db
      .select({ token: userPushTokens.token, userId: userPushTokens.userId })
      .from(userPushTokens)
      .where(inArray(userPushTokens.userId, ids));
    const tokens = rows.map((r) => r.token).filter(Boolean);

    // Mark the rows of users who had at least one device as pushed, regardless
    // of per-token success, so we don't re-push them on the next registration.
    if (notifIdByUser) {
      const usersWithDevice = new Set(rows.map((r) => String(r.userId)));
      const notifIds = [...usersWithDevice].map((u) => notifIdByUser[u]).filter(Boolean) as string[];
      if (notifIds.length) {
        await db.update(notifications).set({ pushedAt: new Date() }).where(inArray(notifications._id, notifIds));
      }
    }

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

/**
 * Deliver, as phone push, any of a user's notifications that were created while
 * they had no device registered (so were never pushed) — e.g. the welcome +
 * role-based onboarding notifications made at signup, before the app first ran.
 * Called when a device registers its token (first sign-in on the app). Marks
 * each pushed so it is delivered exactly once. Safe no-op when push is off.
 */
export async function catchUpPushForUser(userId: string): Promise<void> {
  if (!isPushEnabled() || !userId) return;
  try {
    const app = await getApp();
    if (!app) return;

    const { getDb } = await import("../config/db");
    const { userPushTokens, notifications } = await import("../db/schema");
    const { and, eq, gt, inArray, isNull } = await import("drizzle-orm");
    const { getMessaging } = await import("firebase-admin/messaging");

    const db = getDb();
    const tokenRows = await db
      .select({ token: userPushTokens.token })
      .from(userPushTokens)
      .where(eq(userPushTokens.userId, userId));
    const tokens = tokenRows.map((r) => r.token).filter(Boolean);
    if (tokens.length === 0) return;

    // Recent (7-day), still-unread, never-pushed rows — oldest first so the
    // welcome lands before later onboarding nudges.
    const since = new Date(Date.now() - 1000 * 60 * 60 * 24 * 7);
    const pending = await db
      .select({ id: notifications._id, title: notifications.title, message: notifications.message, type: notifications.type, data: notifications.data })
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, userId),
          eq(notifications.isRead, false),
          isNull(notifications.pushedAt),
          gt(notifications.createdAt, since),
        ),
      )
      .orderBy(notifications.createdAt)
      .limit(10);
    if (pending.length === 0) return;

    const messaging = getMessaging(app);
    for (const n of pending) {
      const data: Record<string, string> = { type: String(n.type) };
      for (const [k, v] of Object.entries((n.data as Record<string, unknown>) ?? {})) data[k] = String(v);
      await messaging.sendEachForMulticast({
        tokens,
        notification: { title: n.title ?? "Truvi", body: n.message },
        data,
        android: { priority: "high", notification: { channelId: "truvi_default" } },
      });
    }
    await db
      .update(notifications)
      .set({ pushedAt: new Date() })
      .where(inArray(notifications._id, pending.map((p) => p.id)));
  } catch (err) {
    console.warn("[push] catch-up error:", err instanceof Error ? err.message : err);
  }
}

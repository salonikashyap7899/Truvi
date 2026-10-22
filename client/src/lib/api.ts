import axios from "axios";
import { Capacitor } from "@capacitor/core";
import { useAuthStore } from "@/store/authStore";
import type { User } from "@/types";

// The installed Android app is bundled and served from https://localhost, so
// window.location.origin points at the device, not our API. Native builds must
// therefore call the production API by its absolute URL. Web keeps using its
// own origin (same-origin in production, the dev server locally).
const NATIVE_API_URL = "https://truviventures.com";

export const API_BASE =
  import.meta.env.VITE_API_URL ||
  (Capacitor.isNativePlatform()
    ? NATIVE_API_URL
    : import.meta.env.PROD
      ? window.location.origin
      : "http://localhost:5000");

export const api = axios.create({
  baseURL: `${API_BASE}/api`,
  withCredentials: true, // send the httpOnly refresh-token cookie
});

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

type RefreshResult = {
  accessToken: string | null;
  /** False only when a network/server failure left session status unknown. */
  definitive: boolean;
};

let refreshPromise: Promise<RefreshResult> | null = null;
let sessionInitializationPromise: Promise<void> | null = null;

// Public/session-establishment endpoints must not trigger a refresh loop.
// Protected endpoints under /auth (notably /auth/submit-kyc and /auth/me) DO
// need refresh-and-retry when a mobile tab has been idle long enough for its
// access token to expire.
const NO_REFRESH_RETRY_ENDPOINTS = new Set([
  "/auth/signup",
  "/auth/login",
  "/auth/verify-account",
  "/auth/resend-otp",
  "/auth/forgot-password",
  "/auth/reset-password",
  "/auth/refresh",
  "/auth/logout",
]);

function shouldSkipTokenRefresh(url?: string): boolean {
  if (!url) return false;
  const path = url.split("?")[0].replace(/\/+$/, "");
  return [...NO_REFRESH_RETRY_ENDPOINTS].some((endpoint) => path === endpoint || path.endsWith(endpoint));
}

/**
 * Access tokens are memory-only. The durable session is the HTTP-only refresh
 * cookie, so restoring the session always fetches a fresh token and current user
 * from the server rather than reading an old token/user snapshot from storage.
 */
async function refreshAccessToken(): Promise<RefreshResult> {
  const initial = useAuthStore.getState();
  try {
    const res = await axios.post(`${API_BASE}/api/auth/refresh`, {}, { withCredentials: true });
    const newToken = res.data.accessToken as string;
    if (!newToken) throw new Error("Refresh endpoint returned no access token");

    const me = await axios.get(`${API_BASE}/api/auth/me`, {
      headers: { Authorization: `Bearer ${newToken}` },
      withCredentials: true,
    });
    const freshUser = me.data.user as User;
    if (!freshUser || !freshUser.role || !freshUser.email) {
      throw new Error("Session endpoint returned an invalid user");
    }

    // Do not overwrite a newer login/logout if it happened while the refresh
    // request was in flight.
    const latest = useAuthStore.getState();
    const unchanged =
      latest.accessToken === initial.accessToken &&
      latest.isInitialized === initial.isInitialized &&
      latest.user === initial.user;
    if (unchanged) {
      latest.setAuth(freshUser, newToken);
      return { accessToken: newToken, definitive: true };
    }
    return { accessToken: latest.accessToken, definitive: latest.isInitialized };
  } catch (error) {
    const latest = useAuthStore.getState();
    const unchanged =
      latest.accessToken === initial.accessToken &&
      latest.isInitialized === initial.isInitialized &&
      latest.user === initial.user;

    // A newer sign-in or explicit logout wins over any older request still in
    // flight. Never resurrect a session after the user clicked Logout.
    if (!unchanged) {
      return { accessToken: latest.accessToken, definitive: latest.isInitialized };
    }

    const status = axios.isAxiosError(error) ? error.response?.status : undefined;
    if (status === 401 || status === 403 || status === 404) {
      // Only a conclusive rejection from the session endpoints should clear
      // authentication. These statuses mean the credential/account is invalid.
      latest.clearAuth();
      return { accessToken: null, definitive: true };
    }

    // A timeout, offline device, 5xx response, or failed /me request does NOT
    // mean the user logged out. Preserve an existing in-memory identity and
    // keep startup in an unknown state until the browser can retry.
    return { accessToken: null, definitive: latest.isInitialized };
  }
}
/** Restore the HTTP-only refresh-cookie session, retrying transient failures. */
export function initializeAuthSession(): Promise<void> {
  if (useAuthStore.getState().isInitialized) return Promise.resolve();
  if (!sessionInitializationPromise) {
    useAuthStore.getState().setSessionRestoreFailed(false);
    sessionInitializationPromise = (async () => {
      try {
        for (let attempt = 0; attempt < 3; attempt += 1) {
          if (!refreshPromise) {
            refreshPromise = refreshAccessToken().finally(() => {
              refreshPromise = null;
            });
          }

          const result = await refreshPromise;
          if (result.definitive) {
            const state = useAuthStore.getState();
            if (!state.isInitialized) state.setInitialized();
            state.setSessionRestoreFailed(false);
            return;
          }

          // Brief retries handle common mobile wake/network hiccups without
          // converting them into a false logged-out state.
          if (attempt < 2) {
            await new Promise((resolve) => setTimeout(resolve, 350 * (2 ** attempt)));
          }
        }

        useAuthStore.getState().setSessionRestoreFailed(true);
      } finally {
        // On transient failure, online/focus events or the retry button must
        // be able to start a new attempt rather than reuse a rejected promise.
        sessionInitializationPromise = null;
      }
    })();
  }
  return sessionInitializationPromise;
}
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    const status = error.response?.status;
    // The access token carries onboardingVerified/role, so right after an admin
    // approves a CP/Ambassador's KYC the still-cached login token is stale and
    // the server rejects data calls with a 403 "Complete onboarding verification…".
    // Treat that like an expired token: mint a fresh one (which now reflects the
    // approval) and retry once, so the workspace works without a re-login.
    const onboardingGate =
      status === 403 &&
      typeof error.response?.data?.error === "string" &&
      error.response.data.error.includes("Complete onboarding verification");
    if (
      (status === 401 || onboardingGate) &&
      original &&
      !original._retry &&
      !shouldSkipTokenRefresh(original.url)
    ) {
      original._retry = true;
      if (!refreshPromise) refreshPromise = refreshAccessToken().finally(() => (refreshPromise = null));
      const refreshResult = await refreshPromise;
      if (refreshResult.accessToken) {
        original.headers.Authorization = `Bearer ${refreshResult.accessToken}`;
        return api(original);
      }
    }
    return Promise.reject(error);
  }
);

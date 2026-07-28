import axios from "axios";
import { useAuthStore } from "@/store/authStore";

export const API_BASE = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? window.location.origin : "http://localhost:5000");

export const api = axios.create({
  baseURL: `${API_BASE}/api`,
  withCredentials: true, // send the httpOnly refresh-token cookie
});

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  try {
    const res = await axios.post(`${API_BASE}/api/auth/refresh`, {}, { withCredentials: true });
    const newToken = res.data.accessToken as string;
    const currentUser = useAuthStore.getState().user;
    if (currentUser) {
      useAuthStore.getState().setAuth(currentUser, newToken);
      // Best-effort: also refresh the cached user snapshot so role/verification
      // gates and the UI reflect the latest account state (e.g. right after an
      // admin approves KYC) without requiring a re-login.
      try {
        const me = await axios.get(`${API_BASE}/api/auth/me`, {
          headers: { Authorization: `Bearer ${newToken}` },
          withCredentials: true,
        });
        const fresh = me.data.user;
        useAuthStore.getState().setAuth(
          {
            ...currentUser,
            role: fresh.role,
            approvalStatus: fresh.approvalStatus,
            emailVerified: fresh.emailVerified,
            phoneVerified: fresh.phoneVerified,
            onboardingVerified: fresh.onboardingVerified,
            onboardingChecks: fresh.onboardingChecks,
          },
          newToken,
        );
      } catch {
        /* keep the token-only update */
      }
    }
    return newToken;
  } catch {
    useAuthStore.getState().clearAuth();
    return null;
  }
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
    if ((status === 401 || onboardingGate) && original && !original._retry && !original.url.includes("/auth/")) {
      original._retry = true;
      if (!refreshPromise) refreshPromise = refreshAccessToken().finally(() => (refreshPromise = null));
      const newToken = await refreshPromise;
      if (newToken) {
        original.headers.Authorization = `Bearer ${newToken}`;
        return api(original);
      }
    }
    return Promise.reject(error);
  }
);

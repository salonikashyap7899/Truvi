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
    if (currentUser) useAuthStore.getState().setAuth(currentUser, newToken);
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
    if (error.response?.status === 401 && !original._retry && !original.url.includes("/auth/")) {
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

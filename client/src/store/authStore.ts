import { create } from "zustand";
import type { User } from "@/types";

interface AuthState {
  user: User | null;
  accessToken: string | null;
  /** True after refresh-cookie restoration succeeds or is conclusively rejected. */
  isInitialized: boolean;
  setAuth: (user: User, accessToken: string) => void;
  setUser: (user: User) => void;
  setInitialized: () => void;
  clearAuth: () => void;
}

// Previous versions persisted the access token and user snapshot in localStorage.
// Remove that legacy value once on app startup so it cannot remain behind after
// switching to an in-memory access token.
try {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem("truvi_auth");
  }
} catch {
  // Storage may be unavailable in hardened browser contexts; auth still works.
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: null,
  isInitialized: false,
  setAuth: (user, accessToken) => set({ user, accessToken, isInitialized: true }),
  setUser: (user) => set({ user, isInitialized: true }),
  setInitialized: () => set({ isInitialized: true }),
  clearAuth: () => {
    try {
      if (typeof window !== "undefined") window.localStorage.removeItem("truvi_auth");
    } catch {
      // Storage may be unavailable; the in-memory session is still cleared.
    }
    set({ user: null, accessToken: null, isInitialized: true });
  },
}));

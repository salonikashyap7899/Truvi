import { create } from "zustand";
import type { User } from "@/types";

interface AuthState {
  user: User | null;
  accessToken: string | null;
  /** True only after restoration succeeds or the server conclusively says there is no session. */
  isInitialized: boolean;
  /** A transient API/network failure prevented us from confirming the saved session. */
  sessionRestoreFailed: boolean;
  setAuth: (user: User, accessToken: string) => void;
  setUser: (user: User) => void;
  setInitialized: () => void;
  setSessionRestoreFailed: (failed: boolean) => void;
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
  sessionRestoreFailed: false,
  setAuth: (user, accessToken) => set({ user, accessToken, isInitialized: true, sessionRestoreFailed: false }),
  setUser: (user) => set({ user, isInitialized: true, sessionRestoreFailed: false }),
  setInitialized: () => set({ isInitialized: true, sessionRestoreFailed: false }),
  setSessionRestoreFailed: (failed) => set({ sessionRestoreFailed: failed }),
  clearAuth: () => {
    try {
      if (typeof window !== "undefined") window.localStorage.removeItem("truvi_auth");
    } catch {
      // Storage may be unavailable; the in-memory session is still cleared.
    }
    set({ user: null, accessToken: null, isInitialized: true, sessionRestoreFailed: false });
  },
}));

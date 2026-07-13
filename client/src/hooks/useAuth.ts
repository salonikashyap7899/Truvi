import { useCallback, useEffect } from "react";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { useCompareStore } from "@/store/compareStore";
import { disconnectSocket, getSocket } from "@/lib/socket";
import type { User } from "@/types";

export function useAuth() {
  const { user, accessToken, setAuth, clearAuth } = useAuthStore();

  // Keep the socket connection alive for the lifetime of the session.
  useEffect(() => {
    if (accessToken) getSocket();
    else disconnectSocket();
  }, [accessToken]);

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await api.post("/auth/login", { email, password });
      setAuth(res.data.user as User, res.data.accessToken as string);
      return res.data.user as User;
    },
    [setAuth]
  );

  const signup = useCallback(async (payload: Record<string, unknown>) => {
    const res = await api.post("/auth/signup", payload);
    return res.data;
  }, []);

  // Confirm both the emailed and texted OTPs. On success the account is
  // verified and logged in.
  const verifyAccount = useCallback(
    async (email: string, emailOtp: string, phoneOtp: string) => {
      const res = await api.post("/auth/verify-account", { email, emailOtp, phoneOtp });
      setAuth(res.data.user as User, res.data.accessToken as string);
      return res.data.user as User;
    },
    [setAuth]
  );

  const resendOtp = useCallback(async (email: string) => {
    const res = await api.post("/auth/resend-otp", { email });
    return res.data;
  }, []);

  const logout = useCallback(async () => {
    await api.post("/auth/logout").catch(() => null);
    disconnectSocket();
    clearAuth();
    useCompareStore.getState().clear(); // prevent stale selections carrying across sessions
  }, [clearAuth]);

  return { user, accessToken, login, signup, verifyAccount, resendOtp, logout, isAuthenticated: !!accessToken };
}

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";

/**
 * Whether the current user may see the Marketing Dashboard. Admins always can;
 * everyone else needs a currently-active grant. Result is cached per browser
 * session so nav components don't re-hit the API on every render, but access is
 * still authoritatively re-checked server-side on every marketing request — so
 * a revoked partner is blocked immediately regardless of this cache.
 */
const CACHE_KEY = "truvi_mkt_access";

export function useMarketingAccess(): { hasAccess: boolean; loading: boolean } {
  const user = useAuthStore((s) => s.user);
  const [hasAccess, setHasAccess] = useState<boolean>(() => {
    try { return sessionStorage.getItem(CACHE_KEY) === "1"; } catch { return false; }
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setHasAccess(false); setLoading(false); return; }
    let cancelled = false;
    api.get("/marketing/access")
      .then((res) => {
        if (cancelled) return;
        const ok = !!res.data?.hasAccess;
        setHasAccess(ok);
        try { sessionStorage.setItem(CACHE_KEY, ok ? "1" : "0"); } catch { /* ignore */ }
      })
      .catch(() => { if (!cancelled) setHasAccess(false); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [user]);

  return { hasAccess, loading };
}

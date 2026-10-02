import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { CpEntitlement } from "@/types";

export const FREE_ENTITLEMENT: CpEntitlement = {
  tier: "FREE",
  crm: false,
  ai: false,
  analytics: false,
  team: false,
  expiresAt: null,
};

export const TIER_LABELS: Record<CpEntitlement["tier"], string> = {
  FREE: "Free",
  CRM_LITE: "CRM Lite",
  CP_PRO: "CP Pro",
  ENTERPRISE: "Enterprise CP",
};

// Module-level cache so hub pages don't refetch on every navigation.
let cached: CpEntitlement | null = null;

export function invalidateEntitlement() {
  cached = null;
}

/**
 * The CP's plan tier, resolved by the server (single source of truth for what
 * is paid for). While loading, callers get `null` so they can avoid flashing
 * the upsell lock at paying users.
 */
export function useEntitlement(): { entitlement: CpEntitlement | null; loading: boolean } {
  const [entitlement, setEntitlement] = useState<CpEntitlement | null>(cached);

  useEffect(() => {
    if (cached) return;
    let alive = true;
    api
      .get("/crm/entitlement")
      .then((res) => {
        cached = res.data.entitlement as CpEntitlement;
        if (alive) setEntitlement(cached);
      })
      .catch(() => {
        if (alive) setEntitlement(FREE_ENTITLEMENT);
      });
    return () => {
      alive = false;
    };
  }, []);

  return { entitlement, loading: entitlement === null };
}

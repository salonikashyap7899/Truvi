import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { DeveloperEntitlement } from "@/types";

export const FREE_DEV_ENTITLEMENT: DeveloperEntitlement = {
  tier: "FREE",
  verified: false,
  crm: false,
  ai: false,
  campaign: false,
  threeDMapping: false,
  pro: false,
  expiresAt: null,
};

export const DEV_TIER_LABELS: Record<DeveloperEntitlement["tier"], string> = {
  FREE: "Free",
  VERIFIED: "Verified",
  CRM: "CRM",
  AI: "AI Analytics",
  PRO: "Developer Pro",
};

// Module-level cache so hub pages don't refetch on every navigation.
let cached: DeveloperEntitlement | null = null;

export function invalidateDeveloperEntitlement() {
  cached = null;
}

/**
 * The developer's unlocked paid tools, resolved by the server (single source of
 * truth). While loading, callers get `null` so they can avoid flashing the
 * upsell lock at a paying developer.
 */
export function useDeveloperEntitlement(): { entitlement: DeveloperEntitlement | null; loading: boolean } {
  const [entitlement, setEntitlement] = useState<DeveloperEntitlement | null>(cached);

  useEffect(() => {
    if (cached) return;
    let alive = true;
    api
      .get("/developer/entitlement")
      .then((res) => {
        cached = res.data.entitlement as DeveloperEntitlement;
        if (alive) setEntitlement(cached);
      })
      .catch(() => {
        if (alive) setEntitlement(FREE_DEV_ENTITLEMENT);
      });
    return () => {
      alive = false;
    };
  }, []);

  return { entitlement, loading: entitlement === null };
}

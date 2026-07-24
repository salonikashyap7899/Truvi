import type { Role, User } from "@/types";

/**
 * Emails that land on the full CEO OS (/founder/dashboard) instead of the
 * operational admin panel. Truvi's founders plus the legacy placeholder; extend
 * via VITE_FOUNDER_EMAILS (comma-separated) without a code change.
 */
const FOUNDER_EMAILS = new Set(
  [
    "founder@truvi.app",
    "sandeep@truviventures.com",
    "meraj@truviventures.com",
    ...(import.meta.env.VITE_FOUNDER_EMAILS?.split(",") ?? []),
  ]
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
);

/** The one page each role lands on — used by login, verify, and the nav. */
export function dashboardPath(user: Pick<User, "role" | "email">): string {
  switch (user.role) {
    case "ADMIN":
      return FOUNDER_EMAILS.has(user.email?.toLowerCase() ?? "") ? "/founder/dashboard" : "/admin/dashboard";
    case "DEVELOPER":
      return "/developer/dashboard";
    case "AMBASSADOR":
      return "/ambassador/dashboard";
    case "CP":
      return "/cp/dashboard";
    case "VERIFIER":
      return "/admin/dashboard";
    default:
      return "/buyer/dashboard";
  }
}

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Admin",
  DEVELOPER: "Developer",
  CP: "Channel Partner",
  BUYER: "Buyer",
  AMBASSADOR: "Ambassador",
  VERIFIER: "Verifier",
};

export function roleLabel(role: Role): string {
  return ROLE_LABELS[role] ?? role;
}

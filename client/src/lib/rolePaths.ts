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
    "isalonikashyap@gmail.com",
    ...(import.meta.env.VITE_FOUNDER_EMAILS?.split(",") ?? []),
  ]
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
);

/** The one page each role lands on — used by login, verify, and the nav. */
export function dashboardPath(user: Pick<User, "role" | "email" | "isFounder">): string {
  switch (user.role) {
    case "ADMIN": {
      // A founder lands on the CEO OS if EITHER signal says so: the
      // server-stamped flag OR the client email allowlist. Using OR (not the
      // server flag alone) means a known founder is never misrouted to the
      // admin panel just because the server's founder-email config drifted
      // and returned isFounder:false.
      const isFounder = user.isFounder === true || FOUNDER_EMAILS.has(user.email?.toLowerCase() ?? "");
      return isFounder ? "/founder/dashboard" : "/admin/dashboard";
    }
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

import type { Role, User } from "@/types";

/** The one page each role lands on — used by login, verify, and the nav. */
export function dashboardPath(user: Pick<User, "role" | "email">): string {
  switch (user.role) {
    case "ADMIN":
      return user.email?.toLowerCase() === "founder@truvi.app" ? "/founder/dashboard" : "/admin/dashboard";
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

/** Shared helpers for inventory leads, offers and meeting scheduling. */

/** Today's date in India as YYYY-MM-DD (visit dates are IST calendar days). */
export function istToday(offsetDays = 0): string {
  return new Date(Date.now() + 5.5 * 3600 * 1000 + offsetDays * 86400 * 1000).toISOString().slice(0, 10);
}

/** Current IST time as HH:MM. */
export function istNowTime(): string {
  return new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(11, 16);
}

/** Half-hour slots between two HH:MM times (inclusive). */
export function timeSlots(from = "09:00", to = "19:00"): string[] {
  const out: string[] = [];
  let [h, m] = from.split(":").map(Number);
  const [th, tm] = to.split(":").map(Number);
  while (h < th || (h === th && m <= tm)) {
    out.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    m += 30;
    if (m >= 60) { m = 0; h += 1; }
  }
  return out;
}

export function formatTime(t: string): string {
  const [h, m] = t.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

export function formatDate(d: string, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "long", year: "numeric" }): string {
  if (!d) return "—";
  return new Date(`${d}T00:00:00+05:30`).toLocaleDateString("en-IN", { ...opts, timeZone: "Asia/Kolkata" });
}

export interface PublicOffer {
  _id: string;
  name: string;
  projectId: string;
  unitId: string | null;
  description: string | null;
  terms: string | null;
  badge: string;
  rewardType: "INCENTIVE" | "BONUS_COMMISSION" | "GIFT" | "DISCOUNT";
  calcBasis: "PER_AREA_BLOCK" | "PER_UNIT" | "PERCENT_OF_VALUE" | "FIXED";
  basisQuantity: number | null;
  amount: number;
  prorate: boolean;
  startDate: string | null;
  endDate: string | null;
  examples: { label: string; reward: number }[];
}

export const LEAD_STATUS_LABEL: Record<string, string> = {
  NEW: "New",
  CONTACTED: "Contacted",
  SITE_VISIT_SCHEDULED: "Site Visit Scheduled",
  SITE_VISIT_COMPLETED: "Site Visit Completed",
  FOLLOW_UP: "Follow-up",
  CONVERTED: "Converted",
  LOST: "Lost",
};

export const LEAD_STATUS_TONE: Record<string, string> = {
  NEW: "border-sky-400/30 bg-sky-500/10 text-sky-200",
  CONTACTED: "border-indigo-400/30 bg-indigo-500/10 text-indigo-200",
  SITE_VISIT_SCHEDULED: "border-amber-400/30 bg-amber-500/10 text-amber-200",
  SITE_VISIT_COMPLETED: "border-teal-400/30 bg-teal-500/10 text-teal-200",
  FOLLOW_UP: "border-violet-400/30 bg-violet-500/10 text-violet-200",
  CONVERTED: "border-emerald-400/30 bg-emerald-500/10 text-emerald-200",
  LOST: "border-rose-400/30 bg-rose-500/10 text-rose-200",
};

export const ROLE_LABEL: Record<string, string> = {
  BUYER: "Buyer",
  CP: "Channel Partner",
  AMBASSADOR: "Ambassador",
  DEVELOPER: "Developer",
  ADMIN: "Admin",
};

/** Roles that can add a lead from an inventory card. */
export const LEAD_CREATOR_ROLES = ["BUYER", "CP", "AMBASSADOR"] as const;

/** Indian mobile → 10 digits, or null (accepts +91 / 0 prefixes and spaces). */
export function normalizeMobile(raw: string | null | undefined): string | null {
  let d = (raw ?? "").replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d) ? d : null;
}

import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatINR(amount: number): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(amount);
}

/** Compact Indian-money formatting: ₹14.2 Cr, ₹85 L, ₹40 K. Great for KPI tiles. */
export function formatCompactINR(amount: number): string {
  const n = Math.abs(amount);
  const sign = amount < 0 ? "-" : "";
  if (n >= 1_00_00_000) return `${sign}₹${(n / 1_00_00_000).toFixed(n >= 10_00_00_000 ? 0 : 1)} Cr`;
  if (n >= 1_00_000) return `${sign}₹${(n / 1_00_000).toFixed(n >= 10_00_000 ? 0 : 1)} L`;
  if (n >= 1_000) return `${sign}₹${(n / 1_000).toFixed(0)} K`;
  return `${sign}₹${Math.round(n)}`;
}

export function formatDate(date: Date | string): string {
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(date));
}

/** Resolves a ref field (object or plain ID string) to its ID string. */
export function idOf(ref: string | { _id: string } | null | undefined): string {
  if (!ref) return "";
  return typeof ref === "string" ? ref : ref._id;
}

/** Resolves a populated ref's display name, falling back gracefully if unpopulated. */
export function nameOf(ref: string | { name: string } | null | undefined, fallback = "—"): string {
  if (!ref || typeof ref === "string") return fallback;
  return ref.name;
}

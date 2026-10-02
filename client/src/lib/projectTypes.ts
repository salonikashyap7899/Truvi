import type { ProjectType } from "@/types";

/**
 * The asset types a developer can pick for a project. Choosing a type reshapes
 * the inventory vocabulary automatically — e.g. an Apartment groups units into
 * "Towers" of "Flats", while a Plotted Development groups "Blocks" of "Plots".
 * `group` is the column/heat-map label; `unit` is what one sellable row is called.
 */
export interface ProjectTypeMeta {
  value: Exclude<ProjectType, "RESIDENTIAL" | "MIXED_USE">;
  label: string;
  emoji: string;
  group: string;
  unit: string;
}

export const PROJECT_TYPE_OPTIONS: ProjectTypeMeta[] = [
  { value: "APARTMENT",  label: "Apartment",          emoji: "🏢", group: "Tower", unit: "Flat" },
  { value: "VILLA",      label: "Villa / Row House",  emoji: "🏘️", group: "Block", unit: "Villa" },
  { value: "PLOTTED",    label: "Plotted Development", emoji: "🏡", group: "Block", unit: "Plot" },
  { value: "COMMERCIAL", label: "Commercial",         emoji: "🏬", group: "Block", unit: "Unit" },
  { value: "INDUSTRIAL", label: "Industrial",         emoji: "🏭", group: "Block", unit: "Unit" },
  { value: "LAND",       label: "Land",               emoji: "🌾", group: "Zone",  unit: "Parcel" },
  { value: "MIXED",      label: "Mixed Project",      emoji: "✅", group: "Block", unit: "Unit" },
];

// Legacy values still stored on older projects → map to the closest terms so
// existing listings keep rendering after the taxonomy expanded.
const LEGACY: Record<string, { label: string; group: string; unit: string }> = {
  RESIDENTIAL: { label: "Residential", group: "Tower", unit: "Flat" },
  MIXED_USE:   { label: "Mixed Use",   group: "Block", unit: "Unit" },
};

const DEFAULT_TERMS = { group: "Block", unit: "Unit" };

/** Grouping + unit vocabulary for a project type (safe for unknown/undefined). */
export function inventoryTerms(type?: string | null): { group: string; unit: string } {
  if (!type) return DEFAULT_TERMS;
  const meta = PROJECT_TYPE_OPTIONS.find((o) => o.value === type);
  if (meta) return { group: meta.group, unit: meta.unit };
  const legacy = LEGACY[type];
  return legacy ? { group: legacy.group, unit: legacy.unit } : DEFAULT_TERMS;
}

/** Human label (with emoji) for a project type, resilient to legacy values. */
export function projectTypeLabel(type?: string | null): string {
  if (!type) return "—";
  const meta = PROJECT_TYPE_OPTIONS.find((o) => o.value === type);
  if (meta) return `${meta.emoji} ${meta.label}`;
  return LEGACY[type]?.label ?? type;
}

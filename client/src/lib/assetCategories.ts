// Presentation asset taxonomy — mirrors ASSET_CATEGORIES on the server.
// Grouped into the sections the presentation page renders.

export interface CategoryMeta {
  value: string;
  label: string;
}

export interface AssetSection {
  key: string;
  title: string;
  categories: CategoryMeta[];
}

export const ASSET_SECTIONS: AssetSection[] = [
  {
    key: "plans",
    title: "Plans & Drawings",
    categories: [
      { value: "SKETCH_LAYOUT", label: "Project Sketch / Layout Plan" },
      { value: "MASTER_PLAN", label: "Master Plan" },
      { value: "SITE_PLAN", label: "Site Plan" },
      { value: "FLOOR_PLAN", label: "Floor Plan" },
      { value: "ELEVATION", label: "Elevation Drawing" },
      { value: "PARKING_LAYOUT", label: "Parking Layout" },
      { value: "ELECTRICAL_PLUMBING", label: "Electrical & Plumbing Layout" },
      { value: "LOCATION_MAP", label: "Location & Connectivity Map" },
    ],
  },
  {
    key: "design",
    title: "Design, Structure & 3D",
    categories: [
      { value: "STRUCTURAL_DESIGN", label: "Structural Design Details" },
      { value: "CONSTRUCTION_SPEC", label: "Construction Specification" },
      { value: "ARCHITECTURE_PRESENTATION", label: "Architecture Presentation" },
      { value: "RENDER_3D", label: "3D View / Rendering" },
      { value: "VIEW_360", label: "360° Project View" },
    ],
  },
  {
    key: "gallery",
    title: "Project Gallery",
    categories: [
      { value: "GALLERY_IMAGE", label: "Gallery Image" },
      { value: "GALLERY_VIDEO", label: "Gallery Video" },
    ],
  },
  {
    key: "documents",
    title: "Documents & Reports",
    categories: [
      { value: "BROCHURE", label: "Project Brochure (PDF)" },
      { value: "TECHNICAL_DOC", label: "Technical Document" },
      { value: "APPROVAL_DOC", label: "Approval Document" },
      { value: "APPROVAL_CERT", label: "Approval Certificate" },
      { value: "MATERIAL_SPEC", label: "Material Specification" },
      { value: "CAD_FILE", label: "CAD File (DWG/DXF)" },
      { value: "STRUCTURAL_REPORT", label: "Structural Report" },
      { value: "ENGINEERING_REPORT", label: "Engineering Report" },
    ],
  },
  {
    key: "progress",
    title: "Construction Progress",
    categories: [{ value: "PROGRESS_UPDATE", label: "Construction Progress Update" }],
  },
];

export const ALL_CATEGORIES: CategoryMeta[] = ASSET_SECTIONS.flatMap((s) => s.categories);

export function categoryLabel(value: string): string {
  return ALL_CATEGORIES.find((c) => c.value === value)?.label ?? value;
}

export const PROJECT_TYPE_LABELS: Record<string, string> = {
  RESIDENTIAL: "Residential",
  COMMERCIAL: "Commercial",
  INDUSTRIAL: "Industrial",
  MIXED_USE: "Mixed Use",
  PLOTTED: "Plotted Development",
};

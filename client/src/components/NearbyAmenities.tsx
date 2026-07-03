import { GraduationCap, Hospital, Train, ShoppingBag, UtensilsCrossed } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

export type AmenityCategory = "school" | "hospital" | "transit" | "mall" | "restaurant";

export interface Amenity {
  category: AmenityCategory;
  name: string;
  distance: string;
}

// ─── Category config ──────────────────────────────────────────────────────────

const CATEGORY_META: Record<
  AmenityCategory,
  { label: string; Icon: React.ComponentType<{ size?: number; className?: string }>; color: string; bg: string }
> = {
  school:     { label: "Schools",     Icon: GraduationCap,   color: "text-blue-400",   bg: "bg-blue-500/10" },
  hospital:   { label: "Hospitals",   Icon: Hospital,        color: "text-red-400",    bg: "bg-red-500/10"  },
  transit:    { label: "Transit",     Icon: Train,           color: "text-purple-400", bg: "bg-purple-500/10" },
  mall:       { label: "Malls",       Icon: ShoppingBag,     color: "text-amber-400",  bg: "bg-amber-500/10" },
  restaurant: { label: "Restaurants", Icon: UtensilsCrossed, color: "text-green-400",  bg: "bg-green-500/10" },
};

const CATEGORY_ORDER: AmenityCategory[] = ["school", "hospital", "transit", "mall", "restaurant"];

// ─── Mock data pools ──────────────────────────────────────────────────────────

const POOL: Record<AmenityCategory, string[]> = {
  school: [
    "Delhi Public School", "Kendriya Vidyalaya", "Ryan International School",
    "Cambridge International", "The Orchid School", "Podar International",
    "Euro School", "Vibgyor High",
  ],
  hospital: [
    "Apollo Hospital", "Fortis Healthcare", "Manipal Hospital",
    "Columbia Asia", "Narayana Health", "Wockhardt Hospital",
    "Aster CMI", "Max Super Speciality",
  ],
  transit: [
    "Metro Station", "Bus Rapid Transit Stop", "Railway Station",
    "Auto Stand", "City Bus Terminus", "Mono Rail Station",
    "Suburban Rail Stop", "Airport Shuttle Hub",
  ],
  mall: [
    "Phoenix Marketcity", "Inorbit Mall", "Forum Mall",
    "Orion Mall", "VR Mall", "Lulu Mall",
    "Select Citywalk", "Nexus Mall",
  ],
  restaurant: [
    "Barbeque Nation", "Social", "Farzi Cafe",
    "The Third Wave Coffee", "Punjab Grill", "Mainland China",
    "Cream Stone", "Theobroma",
  ],
};

const DISTANCES = [
  "0.3 km", "0.5 km", "0.7 km", "0.9 km",
  "1.1 km", "1.4 km", "1.8 km", "2.2 km", "2.8 km", "3.5 km",
];

/** Derives a deterministic list of nearby amenities from a project ID. */
export function mockAmenities(projectId: string): Amenity[] {
  const seed = (offset: number) => {
    const hex = projectId.slice(-(offset + 2), -offset || undefined) || "ab";
    return parseInt(hex, 16);
  };

  const amenities: Amenity[] = [];
  let counter = 0;

  CATEGORY_ORDER.forEach((cat, ci) => {
    const pool = POOL[cat];
    const count = 2; // 2 amenities per category
    for (let i = 0; i < count; i++) {
      const nameIdx = (seed(ci * 3 + i + 1) + counter) % pool.length;
      const distIdx = (seed(ci * 2 + i + 2) + counter * 3) % DISTANCES.length;
      amenities.push({
        category: cat,
        name: pool[nameIdx],
        distance: DISTANCES[distIdx],
      });
      counter++;
    }
  });

  // Sort by distance within each category (ascending)
  return amenities.sort((a, b) => {
    if (a.category !== b.category) return 0;
    return parseFloat(a.distance) - parseFloat(b.distance);
  });
}

// ─── Component ────────────────────────────────────────────────────────────────

interface NearbyAmenitiesProps {
  /** Pass pre-fetched amenities, or leave undefined to use mock data. */
  amenities?: Amenity[];
  projectId: string;
}

export default function NearbyAmenities({ amenities, projectId }: NearbyAmenitiesProps) {
  const data = amenities ?? mockAmenities(projectId);

  const grouped = CATEGORY_ORDER.reduce<Record<AmenityCategory, Amenity[]>>(
    (acc, cat) => ({ ...acc, [cat]: data.filter((a) => a.category === cat) }),
    {} as Record<AmenityCategory, Amenity[]>
  );

  return (
    <div className="rounded-2xl border border-neutral-800 bg-[#121A2B] p-5">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm font-semibold text-white">Nearby Amenities</p>
        <span className="text-[10px] text-neutral-600 uppercase tracking-wide">
          Placeholder distances
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {CATEGORY_ORDER.map((cat) => {
          const items = grouped[cat];
          if (!items.length) return null;
          const meta = CATEGORY_META[cat];
          const { Icon } = meta;

          return (
            <div key={cat}>
              {/* Category header */}
              <div className="flex items-center gap-2 mb-2">
                <span className={`inline-flex items-center justify-center rounded-lg p-1.5 ${meta.bg}`}>
                  <Icon size={13} className={meta.color} />
                </span>
                <span className="text-xs font-medium text-neutral-400">{meta.label}</span>
              </div>

              {/* Amenity rows */}
              <div className="space-y-1.5">
                {items.map((item, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between rounded-lg border border-neutral-800 bg-neutral-900/50 px-3 py-2"
                  >
                    <span className="text-xs text-neutral-300 truncate pr-2">{item.name}</span>
                    <span className="text-[11px] text-neutral-500 shrink-0 font-medium">
                      {item.distance}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

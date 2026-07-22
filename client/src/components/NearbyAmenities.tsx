import { useState } from "react";
import { GraduationCap, Hospital, Train, ShoppingBag, UtensilsCrossed, Pencil, Plus, Trash2, Loader2, Save, X } from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "sonner";

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

/** Derives a deterministic list of nearby amenities from a project ID. Used only
 *  as a placeholder until the developer/admin curates real ones. */
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
  /** Curated amenities saved on the project. When omitted (or empty) and not
   *  editing, the component falls back to placeholder data. */
  amenities?: Amenity[];
  projectId: string;
  /** Developer/admin viewing their own workspace — shows the inline editor. */
  editable?: boolean;
  /** Called with the freshly-saved list so the parent can update its state. */
  onSaved?: (amenities: Amenity[]) => void;
}

function groupByCategory(data: Amenity[]): Record<AmenityCategory, Amenity[]> {
  return CATEGORY_ORDER.reduce<Record<AmenityCategory, Amenity[]>>(
    (acc, cat) => ({ ...acc, [cat]: data.filter((a) => a.category === cat) }),
    {} as Record<AmenityCategory, Amenity[]>,
  );
}

export default function NearbyAmenities({ amenities, projectId, editable, onSaved }: NearbyAmenitiesProps) {
  const hasCurated = Boolean(amenities && amenities.length);
  const display = hasCurated ? (amenities as Amenity[]) : mockAmenities(projectId);
  const grouped = groupByCategory(display);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Amenity[]>([]);
  const [saving, setSaving] = useState(false);

  function startEditing() {
    // Seed the editor with what's already curated (never the mock placeholders).
    setDraft(amenities && amenities.length ? amenities.map((a) => ({ ...a })) : []);
    setEditing(true);
  }

  function updateRow(i: number, patch: Partial<Amenity>) {
    setDraft((prev) => prev.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  }

  function addRow() {
    setDraft((prev) => [...prev, { category: "school", name: "", distance: "" }]);
  }

  function removeRow(i: number) {
    setDraft((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function save() {
    const cleaned = draft
      .map((a) => ({ category: a.category, name: a.name.trim(), distance: a.distance.trim() }))
      .filter((a) => a.name);
    setSaving(true);
    try {
      await api.put(`/presentation/${projectId}/info`, { nearbyAmenities: cleaned });
      onSaved?.(cleaned);
      setEditing(false);
      toast.success("Nearby amenities saved");
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to save amenities");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl border border-white/10 glass p-5">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm font-semibold text-white">Nearby Amenities</p>
        {editing ? (
          <div className="flex items-center gap-2">
            <button
              onClick={save}
              disabled={saving}
              className="inline-flex items-center gap-1 rounded-full border border-emerald-700/60 px-3 py-1 text-[11px] font-medium text-emerald-300 hover:bg-emerald-900/20 disabled:opacity-50"
            >
              {saving ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />} Save
            </button>
            <button
              onClick={() => setEditing(false)}
              disabled={saving}
              className="inline-flex items-center gap-1 rounded-full border border-white/15 px-3 py-1 text-[11px] font-medium text-muted-foreground hover:text-white"
            >
              <X size={11} /> Cancel
            </button>
          </div>
        ) : editable ? (
          <button
            onClick={startEditing}
            className="inline-flex items-center gap-1 rounded-full border border-white/15 px-3 py-1 text-[11px] font-medium text-sky-300 hover:bg-white/5"
          >
            <Pencil size={11} /> Edit
          </button>
        ) : (
          !hasCurated && (
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Placeholder distances</span>
          )
        )}
      </div>

      {editing ? (
        <div className="space-y-2">
          {draft.length === 0 && (
            <p className="text-xs text-muted-foreground">No amenities yet — add schools, hospitals, transit, malls and restaurants with their distances.</p>
          )}
          {draft.map((row, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2 rounded-lg border border-white/10 bg-card/50 p-2">
              <select
                value={row.category}
                onChange={(e) => updateRow(i, { category: e.target.value as AmenityCategory })}
                className="h-8 rounded-md border border-white/15 bg-card px-2 text-xs text-white outline-none focus:border-blue-500"
              >
                {CATEGORY_ORDER.map((cat) => (
                  <option key={cat} value={cat}>{CATEGORY_META[cat].label}</option>
                ))}
              </select>
              <input
                value={row.name}
                onChange={(e) => updateRow(i, { name: e.target.value })}
                placeholder="Place name (e.g. Manipal Hospital)"
                className="h-8 min-w-0 flex-1 rounded-md border border-white/15 bg-card px-2 text-xs text-white outline-none focus:border-blue-500"
              />
              <input
                value={row.distance}
                onChange={(e) => updateRow(i, { distance: e.target.value })}
                placeholder="1.4 km"
                className="h-8 w-24 rounded-md border border-white/15 bg-card px-2 text-xs text-white outline-none focus:border-blue-500"
              />
              <button
                onClick={() => removeRow(i)}
                className="rounded-md p-1.5 text-red-400/70 hover:bg-red-500/10 hover:text-red-400"
                title="Remove"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
          <button
            onClick={addRow}
            className="inline-flex items-center gap-1 rounded-lg border border-dashed border-white/20 px-3 py-1.5 text-xs text-muted-foreground hover:border-blue-500/50 hover:text-blue-300"
          >
            <Plus size={13} /> Add amenity
          </button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {CATEGORY_ORDER.map((cat) => {
            const items = grouped[cat];
            if (!items.length) return null;
            const meta = CATEGORY_META[cat];
            const { Icon } = meta;

            return (
              <div key={cat}>
                {/* Category header */}
                <div className="mb-2 flex items-center gap-2">
                  <span className={`inline-flex items-center justify-center rounded-lg p-1.5 ${meta.bg}`}>
                    <Icon size={13} className={meta.color} />
                  </span>
                  <span className="text-xs font-medium text-muted-foreground">{meta.label}</span>
                </div>

                {/* Amenity rows */}
                <div className="space-y-1.5">
                  {items.map((item, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between rounded-lg border border-white/10 bg-card/50 px-3 py-2"
                    >
                      <span className="truncate pr-2 text-xs text-foreground/90">{item.name}</span>
                      {item.distance && (
                        <span className="shrink-0 text-[11px] font-medium text-muted-foreground">{item.distance}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

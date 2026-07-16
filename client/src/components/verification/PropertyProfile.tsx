import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/primitives";
import { CheckCircle2, Circle } from "lucide-react";

interface CategoryRow {
  _id: string;
  dataKey: string;
  label: string;
  sourceType?: string | null;
  verified: boolean;
  rawData: Record<string, unknown>;
}
interface PropertyData {
  property: { name: string; city?: string; location?: string };
  categories: Record<string, CategoryRow[]>;
}

const CATEGORY_LABELS: Record<string, string> = {
  government_legal: "Government & Legal",
  infrastructure: "Infrastructure",
  location_intelligence: "Location Intelligence",
  market_intelligence: "Market Intelligence",
  environmental_data: "Environmental",
  satellite_gis: "Satellite & GIS",
  community_intelligence: "Community Intelligence",
};

/** Reads /api/property/:id and renders ONLY the categories that have data. */
export default function PropertyProfile({ projectId }: { projectId: string }) {
  const [data, setData] = useState<PropertyData | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    api.get(`/property/${projectId}`).then((r) => setData(r.data)).catch(() => setData(null)).finally(() => setLoaded(true));
  }, [projectId]);

  if (!loaded) return <div className="rounded-2xl border border-white/10 glass p-5 text-sm text-muted-foreground">Loading…</div>;
  if (!data) return <div className="rounded-2xl border border-white/10 glass p-5 text-sm text-muted-foreground">No data.</div>;

  const cats = Object.entries(data.categories);
  if (cats.length === 0) {
    return <div className="rounded-2xl border border-white/10 glass p-5 text-sm text-muted-foreground">No data ingested for this property yet. Upload data via the ingestion API to populate these sections.</div>;
  }

  return (
    <div className="space-y-4">
      {cats.map(([category, rows]) => (
        <section key={category} className="rounded-2xl border border-white/10 glass p-5">
          <h3 className="font-display text-base font-semibold">{CATEGORY_LABELS[category] ?? category}</h3>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {rows.map((r) => (
              <div key={r._id} className="rounded-xl border border-white/8 bg-white/[0.02] p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-white">{r.label}</p>
                  {r.verified ? (
                    <Badge variant="success"><CheckCircle2 size={11} className="mr-1" /> Verified</Badge>
                  ) : (
                    <Badge variant="default"><Circle size={11} className="mr-1" /> Unverified</Badge>
                  )}
                </div>
                {r.sourceType && <p className="mt-0.5 text-[11px] text-muted-foreground">Source: {r.sourceType}</p>}
                <div className="mt-1.5 space-y-0.5">
                  {Object.entries(r.rawData ?? {}).slice(0, 8).map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-3 text-[11px]">
                      <span className="text-muted-foreground">{k}</span>
                      <span className="text-right text-foreground/85">{String(v)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

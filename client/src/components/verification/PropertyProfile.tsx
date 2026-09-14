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
          <div className="mt-3 grid items-stretch gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {rows.map((r) => (
              <div key={r._id} className="rounded-xl border border-white/8 bg-white/[0.02] p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 text-sm font-medium text-white">{r.label}</p>
                  {r.verified ? (
                    <Badge variant="success" className="shrink-0"><CheckCircle2 size={11} className="mr-1" /> Verified</Badge>
                  ) : (
                    <Badge variant="default" className="shrink-0"><Circle size={11} className="mr-1" /> Unverified</Badge>
                  )}
                </div>
                {r.sourceType && <p className="mt-0.5 text-[11px] text-muted-foreground">Source: {r.sourceType}</p>}
                {/* Cap the data area so a long note/discrepancy scrolls inside the
                    card instead of stretching it — keeps every card the same size. */}
                <dl className="mt-2 max-h-44 space-y-1.5 overflow-y-auto pr-1">
                  {Object.entries(r.rawData ?? {}).slice(0, 10).map(([k, v]) => {
                    const val = String(v);
                    const key = k.replace(/_/g, " ");
                    // Long values (notes, discrepancies) read as a full-width block;
                    // short scalars stay as a tidy key/value row so the card stays compact.
                    return val.length > 45 ? (
                      <div key={k} className="text-[11px]">
                        <dt className="capitalize text-muted-foreground">{key}</dt>
                        <dd className="mt-0.5 break-words text-foreground/85">{val}</dd>
                      </div>
                    ) : (
                      <div key={k} className="flex justify-between gap-3 text-[11px]">
                        <dt className="shrink-0 capitalize text-muted-foreground">{key}</dt>
                        <dd className="min-w-0 break-words text-right text-foreground/85">{val}</dd>
                      </div>
                    );
                  })}
                </dl>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

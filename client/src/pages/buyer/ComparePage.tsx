import { useEffect, useMemo, useState } from "react";
import { useSearchParams, Link, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { useCompareStore } from "@/store/compareStore";
import { toast } from "sonner";
import { X, ArrowLeft } from "lucide-react";
import { formatINR } from "@/lib/utils";
import type { Unit, Project } from "@/types";

interface CompareProject extends Project {
  units: Unit[];
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function priceRange(units: Unit[]) {
  if (!units.length) return "—";
  const prices = units.map((u) => u.price).filter(Boolean);
  if (!prices.length) return "—";
  const mn = Math.min(...prices);
  const mx = Math.max(...prices);
  return mn === mx ? formatINR(mn) : `${formatINR(mn)} – ${formatINR(mx)}`;
}

function areaRange(units: Unit[]) {
  if (!units.length) return "—";
  const areas = units.map((u) => u.areaSqft).filter(Boolean);
  if (!areas.length) return "—";
  const mn = Math.min(...areas);
  const mx = Math.max(...areas);
  return mn === mx ? `${mn.toLocaleString()} sqft` : `${mn.toLocaleString()} – ${mx.toLocaleString()} sqft`;
}

function unitTypes(units: Unit[]) {
  if (!units.length) return "—";
  const types = [...new Set(units.map((u) => u.type))].filter(Boolean);
  return types.length ? types.join(", ") : "—";
}

function devName(project: CompareProject) {
  return typeof project.developerId === "object"
    ? (project.developerId as any).name
    : "—";
}

// ─── Row helper ───────────────────────────────────────────────────────────────

function Row({
  label,
  values,
  highlight,
}: {
  label: string;
  values: React.ReactNode[];
  highlight?: boolean;
}) {
  return (
    <tr className={highlight ? "bg-[#141d2f]" : "bg-[#0f1624]"}>
      <td className="sticky left-0 z-10 whitespace-nowrap bg-[#0B1220] px-4 py-3 text-xs font-medium text-neutral-400 w-36">
        {label}
      </td>
      {values.map((v, i) => (
        <td key={i} className="px-5 py-3 text-sm text-neutral-200 align-top min-w-[200px]">
          {v}
        </td>
      ))}
    </tr>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ComparePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { remove, clear, selectedIds: storeIds } = useCompareStore();

  // Derive ids from URL so the page reacts when params change in-place
  const ids = useMemo(
    () =>
      (searchParams.get("ids") ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 4),
    [searchParams]
  );

  const [projects, setProjects] = useState<CompareProject[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (ids.length < 2) {
      setLoading(false);
      return;
    }
    setLoading(true);
    api
      .get(`/buyer/compare?ids=${ids.join(",")}`)
      .then((res) => {
        const fetched: CompareProject[] = res.data.projects;
        setProjects(fetched);
        // Reconcile store: drop any IDs that came back as not-found/not-approved
        const validIds = new Set(fetched.map((p) => p._id));
        storeIds
          .filter((id) => ids.includes(id) && !validIds.has(id))
          .forEach((id) => remove(id));
      })
      .catch((err: any) => toast.error(err?.response?.data?.error || "Failed to load comparison"))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids.join(",")]);

  function removeProject(id: string) {
    remove(id); // also clear from global store
    const next = ids.filter((x) => x !== id);
    setSearchParams({ ids: next.join(",") });
    setProjects((prev) => prev.filter((p) => p._id !== id));
    if (next.length < 2) {
      toast("Select at least 2 properties to compare.");
      navigate("/buyer/projects");
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#0B1220] p-10 text-white">
        <p className="text-sm text-neutral-500">Loading comparison…</p>
      </main>
    );
  }

  if (projects.length < 2) {
    return (
      <main className="min-h-screen bg-[#0B1220] p-10 text-white">
        <p className="text-sm text-neutral-400">Not enough properties to compare.</p>
        <Link to="/buyer/projects" className="mt-4 inline-block">
          <Button size="sm">Browse Properties</Button>
        </Link>
      </main>
    );
  }

  const rows: { label: string; render: (p: CompareProject) => React.ReactNode }[] = [
    { label: "Developer", render: (p) => devName(p) || "—" },
    { label: "Location",  render: (p) => `${p.location}, ${p.city}` },
    { label: "RERA No.",  render: (p) => p.reraNumber || "Not listed" },
    { label: "Listing",   render: (p) => (
        <Badge variant={p.listingTier === "FEATURED" ? "featured" : "default"}>
          {p.listingTier}
        </Badge>
      ),
    },
    { label: "Price Range",  render: (p) => priceRange(p.units) },
    { label: "Area Range",   render: (p) => areaRange(p.units) },
    { label: "Unit Types",   render: (p) => unitTypes(p.units) },
    { label: "Total Units",  render: (p) => p.units.length ? `${p.units.length} units` : "—" },
    { label: "Commission",   render: (p) => `${p.commissionPercent}%` },
    { label: "Price List",   render: (p) => p.priceListUrl
        ? <a href={p.priceListUrl} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline text-xs">View</a>
        : "Not uploaded",
    },
    { label: "Brochure",     render: (p) => p.brochureUrl
        ? <a href={p.brochureUrl} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline text-xs">Download</a>
        : "Not uploaded",
    },
    { label: "Description",  render: (p) => (
        <span className="line-clamp-4 text-xs text-neutral-400">{p.description || "—"}</span>
      ),
    },
  ];

  return (
    <main className="min-h-screen bg-[#0B1220] p-6 text-white md:p-10 pb-24">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => { clear(); navigate(-1); }}
          className="flex items-center gap-1.5 text-sm text-neutral-400 hover:text-white transition-colors"
        >
          <ArrowLeft size={16} /> Back
        </button>
        <h1 className="text-2xl font-semibold">Compare Properties</h1>
      </div>

      {/* Scrollable comparison table */}
      <div className="overflow-x-auto rounded-2xl border border-neutral-800">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-neutral-800 bg-[#0B1220]">
              {/* sticky label column header */}
              <th className="sticky left-0 z-20 bg-[#0B1220] px-4 py-3 text-left text-xs font-medium text-neutral-500 w-36">
                Property
              </th>
              {projects.map((p) => (
                <th
                  key={p._id}
                  className="px-5 py-3 text-left min-w-[200px]"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-white leading-tight">{p.name}</p>
                      <p className="text-xs text-neutral-400 mt-0.5">{p.city}</p>
                    </div>
                    <button
                      onClick={() => removeProject(p._id)}
                      aria-label={`Remove ${p.name} from comparison`}
                      className="shrink-0 rounded-full p-1 text-neutral-500 hover:bg-white/10 hover:text-white transition-colors"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800/60">
            {rows.map((row, i) => (
              <Row
                key={row.label}
                label={row.label}
                values={projects.map((p) => row.render(p))}
                highlight={i % 2 === 0}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* Actions row */}
      <div className="mt-6 flex flex-wrap gap-3">
        <Link to="/buyer/projects">
          <Button variant="secondary" size="sm">Browse more properties</Button>
        </Link>
        <Link to="/buyer/dashboard">
          <Button variant="secondary" size="sm">View saved properties</Button>
        </Link>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => { clear(); navigate("/buyer/projects"); }}
          className="text-neutral-400"
        >
          Clear &amp; start over
        </Button>
      </div>
    </main>
  );
}

import { useMemo, useState } from "react";
import { Boxes, Gauge, AlertTriangle, Sparkles } from "lucide-react";
import { Card, CardTitle, CardValue, Badge } from "@/components/ui/primitives";
import { NotificationBell } from "@/components/NotificationBell";
import { DevHubNav } from "@/components/DevHubNav";
import { DevProGate } from "@/components/DevProGate";
import UserMenu from "@/components/UserMenu";
import { useDeveloperData } from "@/lib/useDeveloperData";
import { useDeveloperEntitlement } from "@/lib/devEntitlements";
import { inventoryHeatMap, inventoryHealth, unitTower } from "@/lib/devIntel";
import { formatINR, formatCompactINR, cn } from "@/lib/utils";
import type { UnitStatus } from "@/types";

const STATUS_VARIANT: Record<UnitStatus, "success" | "warning" | "info" | "danger"> = {
  AVAILABLE: "success",
  LOCKED: "warning",
  RESERVED: "info",
  SOLD: "danger",
};

export default function DeveloperInventoryPage() {
  const { projects, units, unitsByProject, loading } = useDeveloperData();
  const { entitlement } = useDeveloperEntitlement();
  const [projectFilter, setProjectFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<UnitStatus | "ALL">("ALL");

  const aiUnlocked = !!entitlement?.ai;

  const visibleUnits = useMemo(() => {
    let list = projectFilter === "ALL" ? units : unitsByProject[projectFilter] ?? [];
    if (statusFilter !== "ALL") list = list.filter((u) => u.status === statusFilter);
    return [...list].sort((a, b) => a.unitNumber.localeCompare(b.unitNumber, undefined, { numeric: true }));
  }, [units, unitsByProject, projectFilter, statusFilter]);

  const projectName = (id: string) => projects.find((p) => p._id === id)?.name ?? "—";

  if (loading) return <div className="min-h-screen p-10 text-white">Loading inventory…</div>;

  const health = inventoryHealth(units);
  const heat = inventoryHeatMap(units);
  const sold = units.filter((u) => u.status === "SOLD").length;
  const available = units.filter((u) => u.status === "AVAILABLE");
  const unsoldValue = available.reduce((s, u) => s + u.price, 0);
  const oldestIdle = available.length; // proxy for tied-up capital view

  return (
    <main className="min-h-screen p-6 text-white md:p-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold"><Boxes size={22} className="text-amber-400" /> Inventory Manager</h1>
          <p className="mt-1 text-sm text-muted-foreground">Every flat, live — status, pricing and absorption across all your projects.</p>
        </div>
        <div className="flex items-center gap-3">
          <NotificationBell />
          <UserMenu />
        </div>
      </div>
      <DevHubNav />

      {/* Summary tiles */}
      <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card className="border-white/10 glass text-white">
          <CardTitle className="text-muted-foreground">Total Units</CardTitle>
          <CardValue>{units.length}</CardValue>
        </Card>
        <Card className="border-white/10 glass text-white">
          <CardTitle className="text-muted-foreground">Sold / Available</CardTitle>
          <CardValue>{sold} / {available.length}</CardValue>
        </Card>
        <Card className="border-white/10 glass text-white">
          <div className="flex items-center justify-between">
            <CardTitle className="text-muted-foreground">Inventory Health</CardTitle>
            <Gauge size={15} className="text-sky-400" />
          </div>
          <CardValue>{health.score} <span className="text-sm text-muted-foreground">/ 100</span></CardValue>
          <p className="mt-0.5 text-xs text-muted-foreground">{health.label}</p>
        </Card>
        <Card className="border-white/10 glass text-white">
          <div className="flex items-center justify-between">
            <CardTitle className="text-muted-foreground">Unsold Capital</CardTitle>
            <AlertTriangle size={15} className="text-amber-400" />
          </div>
          <CardValue>{formatCompactINR(unsoldValue)}</CardValue>
          <p className="mt-0.5 text-xs text-muted-foreground">{oldestIdle} units to sell</p>
        </Card>
      </div>

      {/* Heat map */}
      {heat.length > 0 && (
        <section className="mt-10">
          <h2 className="text-lg font-medium">Heat map — absorption by tower</h2>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {heat.map((b) => (
              <div key={b.label} className="flex items-center gap-3 rounded-xl border border-white/10 glass px-4 py-3">
                <span className="w-16 shrink-0 text-sm">Tower {b.label}</span>
                <div className="h-3 flex-1 overflow-hidden rounded-full bg-white/5">
                  <div
                    className={cn("h-full rounded-full", b.soldPercent >= 80 ? "bg-emerald-500" : b.soldPercent >= 50 ? "bg-amber-500" : "bg-sky-500")}
                    style={{ width: `${Math.max(4, b.soldPercent)}%` }}
                  />
                </div>
                <span className="w-24 shrink-0 text-right text-sm">{b.soldPercent}% <span className="text-xs text-muted-foreground">({b.sold}/{b.total})</span></span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* AI dynamic pricing — premium */}
      <section className="mt-10">
        <h2 className="flex items-center gap-2 text-lg font-medium"><Sparkles size={16} className="text-purple-400" /> AI Dynamic Pricing</h2>
        <p className="mt-1 text-xs text-muted-foreground">Recommended price nudges per unit, based on absorption and demand.</p>
        <DevProGate unlocked={aiUnlocked} feature="AI Dynamic Pricing" plan="ai" badge="AI" hook="Price smarter, sell faster" className="mt-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {heat.slice(0, 6).map((b) => {
              // Hotter towers can hold or raise; cold towers get a nudge down.
              const delta = b.soldPercent >= 80 ? 3 : b.soldPercent >= 50 ? 0 : -3;
              return (
                <Card key={b.label} className="border-purple-500/20 bg-purple-950/10 text-white">
                  <p className="text-sm font-medium">Tower {b.label}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{b.soldPercent}% sold</p>
                  <p className={cn("mt-2 text-sm font-semibold", delta > 0 ? "text-emerald-400" : delta < 0 ? "text-rose-400" : "text-muted-foreground")}>
                    {delta > 0 ? `Raise price ${delta}%` : delta < 0 ? `Discount ${Math.abs(delta)}% to move` : "Hold price"}
                  </p>
                </Card>
              );
            })}
          </div>
        </DevProGate>
      </section>

      {/* Per-flat table (spec PART 5.9) */}
      <section className="mt-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-medium">All units</h2>
          <div className="flex flex-wrap gap-2">
            <select
              value={projectFilter}
              onChange={(e) => setProjectFilter(e.target.value)}
              className="h-9 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-sm text-white outline-none"
            >
              <option value="ALL">All projects</option>
              {projects.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as UnitStatus | "ALL")}
              className="h-9 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-sm text-white outline-none"
            >
              <option value="ALL">All statuses</option>
              <option value="AVAILABLE">Available</option>
              <option value="LOCKED">Locked</option>
              <option value="RESERVED">Reserved</option>
              <option value="SOLD">Sold</option>
            </select>
          </div>
        </div>

        <div className="mt-3 overflow-x-auto rounded-xl border border-white/10 glass">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-muted-foreground">
              <tr className="border-b border-white/10">
                <th className="px-4 py-3">Unit</th>
                <th className="px-4 py-3">Project</th>
                <th className="px-4 py-3">Tower</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3 text-right">Area</th>
                <th className="px-4 py-3 text-right">Price</th>
                <th className="px-4 py-3 text-right">₹/sqft</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {visibleUnits.map((u) => (
                <tr key={u._id} className="border-b border-white/5 last:border-0">
                  <td className="px-4 py-3 font-medium">{u.unitNumber}</td>
                  <td className="px-4 py-3 text-muted-foreground">{projectName(u.projectId)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{unitTower(u)}</td>
                  <td className="px-4 py-3">{u.type}</td>
                  <td className="px-4 py-3 text-right text-muted-foreground">{u.areaSqft.toLocaleString("en-IN")} sqft</td>
                  <td className="px-4 py-3 text-right">{formatINR(u.price)}</td>
                  <td className="px-4 py-3 text-right text-muted-foreground">{u.areaSqft > 0 ? formatINR(Math.round(u.price / u.areaSqft)) : "—"}</td>
                  <td className="px-4 py-3"><Badge variant={STATUS_VARIANT[u.status]}>{u.status}</Badge></td>
                </tr>
              ))}
              {visibleUnits.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-6 text-center text-muted-foreground">No units match these filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

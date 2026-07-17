import { useMemo, useState } from "react";
import { KanbanSquare, Users, Wallet, Trophy, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Card, CardTitle, CardValue } from "@/components/ui/primitives";
import { NotificationBell } from "@/components/NotificationBell";
import { DevHubNav } from "@/components/DevHubNav";
import { DevProGate } from "@/components/DevProGate";
import UserMenu from "@/components/UserMenu";
import { useDeveloperData } from "@/lib/useDeveloperData";
import { useDeveloperEntitlement } from "@/lib/devEntitlements";
import {
  PIPELINE_STAGES, pipelineStats, teamPerformance, financeSummary, avgUnitPrice, leadValue,
} from "@/lib/devIntel";
import { formatINR, formatCompactINR, nameOf } from "@/lib/utils";
import type { Lead, LeadStage } from "@/types";

const ALL_STAGES: LeadStage[] = [...PIPELINE_STAGES.map((s) => s.stage), "LOST"];

export default function DeveloperSalesPage() {
  const { projects, units, leads, avgPriceByProject, loading, reload } = useDeveloperData();
  const { entitlement } = useDeveloperEntitlement();
  const [saving, setSaving] = useState<string | null>(null);

  const crmUnlocked = !!entitlement?.crm;

  const pipeline = useMemo(() => pipelineStats(leads, avgPriceByProject), [leads, avgPriceByProject]);
  const team = useMemo(() => teamPerformance(leads, avgPriceByProject), [leads, avgPriceByProject]);
  const finance = useMemo(() => financeSummary(units, leads, avgUnitPrice(units)), [units, leads]);

  async function moveStage(lead: Lead, stage: LeadStage) {
    setSaving(lead._id);
    try {
      await api.patch(`/leads/${lead._id}`, { stage });
      toast.success(`Moved to ${stage.replace("_", " ").toLowerCase()}`);
      reload();
    } catch (err) {
      const e = err as { response?: { data?: { error?: string } } };
      toast.error(e?.response?.data?.error || "Failed to move lead");
    } finally {
      setSaving(null);
    }
  }

  if (loading) return <div className="min-h-screen p-10 text-white">Loading your sales pipeline…</div>;

  return (
    <main className="min-h-screen p-6 text-white md:p-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold"><KanbanSquare size={22} className="text-sky-400" /> Sales CRM</h1>
          <p className="mt-1 text-sm text-muted-foreground">Move deals through the pipeline, track your team and see the money.</p>
        </div>
        <div className="flex items-center gap-3">
          <NotificationBell />
          <UserMenu />
        </div>
      </div>
      <DevHubNav />

      {/* Pipeline value summary — always visible so the value of upgrading is clear */}
      <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card className="border-white/10 glass text-white">
          <CardTitle className="text-muted-foreground">Active Leads</CardTitle>
          <CardValue>{leads.filter((l) => !["COMPLETED", "LOST"].includes(l.stage)).length}</CardValue>
        </Card>
        <Card className="border-white/10 glass text-white">
          <CardTitle className="text-muted-foreground">Pipeline Value</CardTitle>
          <CardValue>{formatCompactINR(pipeline.filter((s) => !["COMPLETED"].includes(s.stage)).reduce((a, s) => a + s.value, 0))}</CardValue>
        </Card>
        <Card className="border-white/10 glass text-white">
          <CardTitle className="text-muted-foreground">Booked</CardTitle>
          <CardValue>{leads.filter((l) => ["BOOKING", "REGISTRATION", "COMPLETED"].includes(l.stage)).length}</CardValue>
        </Card>
        <Card className="border-white/10 glass text-white">
          <CardTitle className="text-muted-foreground">Sales Team</CardTitle>
          <CardValue>{team.length}</CardValue>
        </Card>
      </div>

      {/* Pipeline board — gated behind Developer CRM */}
      <section className="mt-10">
        <h2 className="text-lg font-medium">Booking pipeline</h2>
        <p className="mt-1 text-xs text-muted-foreground">Count &amp; value at every stage — move any deal forward or back.</p>
        <DevProGate unlocked={crmUnlocked} feature="Lead Pipeline & Management" plan="crm" badge="CRM" hook="Close 30% more sales" className="mt-3">
          <div className="flex gap-3 overflow-x-auto pb-2">
            {PIPELINE_STAGES.map(({ stage, label }) => {
              const stageLeads = leads.filter((l) => l.stage === stage);
              const value = stageLeads.reduce((s, l) => s + leadValue(l, avgPriceByProject), 0);
              return (
                <div key={stage} className="flex w-64 shrink-0 flex-col rounded-xl border border-white/10 bg-white/[0.02]">
                  <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
                    <span className="text-xs text-emerald-300">{stageLeads.length} · {formatCompactINR(value)}</span>
                  </div>
                  <div className="max-h-[420px] space-y-2 overflow-y-auto p-2">
                    {stageLeads.map((l) => (
                      <div key={l._id} className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                        <p className="text-sm font-medium">{l.clientName}</p>
                        <p className="text-xs text-muted-foreground">{nameOf(l.projectId)} · {formatCompactINR(leadValue(l, avgPriceByProject))}</p>
                        <div className="mt-2 flex items-center gap-2">
                          <select
                            value={l.stage}
                            disabled={saving === l._id}
                            onChange={(e) => moveStage(l, e.target.value as LeadStage)}
                            className="h-7 flex-1 rounded-md border border-white/10 bg-white/[0.05] px-1.5 text-[11px] text-white outline-none"
                          >
                            {ALL_STAGES.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
                          </select>
                          <a
                            href={`https://wa.me/91${l.clientPhone}?text=${encodeURIComponent(`Hi ${l.clientName}, following up on your interest.`)}`}
                            target="_blank"
                            rel="noreferrer"
                            className="rounded-md bg-emerald-500/15 p-1.5 text-emerald-400 hover:bg-emerald-500/25"
                            aria-label="WhatsApp"
                          >
                            <MessageCircle size={13} />
                          </a>
                        </div>
                      </div>
                    ))}
                    {stageLeads.length === 0 && <p className="px-1 py-3 text-center text-[11px] text-muted-foreground">Empty</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </DevProGate>
      </section>

      {/* Sales team performance (spec PART 5.7) */}
      <section className="mt-10">
        <h2 className="flex items-center gap-2 text-lg font-medium"><Users size={16} className="text-violet-400" /> Sales Team Performance</h2>
        <DevProGate unlocked={crmUnlocked} feature="Team Management" plan="crm" badge="CRM" hook="Track every sales manager" className="mt-3">
          <div className="overflow-x-auto rounded-xl border border-white/10 glass">
            <table className="w-full min-w-[620px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-muted-foreground">
                <tr className="border-b border-white/10">
                  <th className="px-4 py-3">Manager</th>
                  <th className="px-4 py-3 text-right">Leads</th>
                  <th className="px-4 py-3 text-right">Site Visits</th>
                  <th className="px-4 py-3 text-right">Bookings</th>
                  <th className="px-4 py-3 text-right">Revenue</th>
                  <th className="px-4 py-3 text-right">Conversion</th>
                </tr>
              </thead>
              <tbody>
                {team.map((m, i) => (
                  <tr key={m.id} className="border-b border-white/5 last:border-0">
                    <td className="px-4 py-3 font-medium">
                      {i === 0 && <Trophy size={13} className="mr-1 inline text-amber-400" />}
                      {m.name}
                    </td>
                    <td className="px-4 py-3 text-right text-muted-foreground">{m.leads}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground">{m.siteVisits}</td>
                    <td className="px-4 py-3 text-right">{m.bookings}</td>
                    <td className="px-4 py-3 text-right text-emerald-300">{formatCompactINR(m.revenue)}</td>
                    <td className="px-4 py-3 text-right">{m.conversion}%</td>
                  </tr>
                ))}
                {team.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">No leads yet — team stats appear as leads arrive.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </DevProGate>
      </section>

      {/* Finance dashboard (spec PART 5.8) */}
      <section className="mt-10">
        <h2 className="flex items-center gap-2 text-lg font-medium"><Wallet size={16} className="text-emerald-400" /> Finance Dashboard</h2>
        <DevProGate unlocked={crmUnlocked} feature="Finance Dashboard" plan="crm" badge="CRM" hook="See the money, live" className="mt-3">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
            <FinanceTile label="Expected Revenue" value={finance.expectedRevenue} tone="text-white" />
            <FinanceTile label="Collected (Sold)" value={finance.collected} tone="text-emerald-400" />
            <FinanceTile label="In Pipeline" value={finance.inPipeline} tone="text-sky-400" />
            <FinanceTile label="Outstanding" value={finance.outstanding} tone="text-amber-400" />
            <FinanceTile label="Pending Registration" value={finance.pendingRegistration} tone="text-violet-400" />
            <FinanceTile label="GST (est.)" value={finance.gstOnCollected} tone="text-rose-400" />
          </div>
        </DevProGate>
      </section>

      {projects.length === 0 && (
        <p className="mt-8 text-sm text-muted-foreground">Add a project and start receiving leads to power your CRM.</p>
      )}
    </main>
  );
}

function FinanceTile({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <Card className="border-white/10 glass text-white">
      <CardTitle className="text-muted-foreground">{label}</CardTitle>
      <CardValue className={tone}>{formatINR(value)}</CardValue>
    </Card>
  );
}

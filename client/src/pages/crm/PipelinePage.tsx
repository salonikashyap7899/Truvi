import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { useSocketEvent } from "@/lib/socket";
import { useAuthStore } from "@/store/authStore";
import { ArrowLeft, Phone, RefreshCw, KanbanSquare, GripVertical } from "lucide-react";
import type { Lead, LeadStage } from "@/types";
import { nameOf } from "@/lib/utils";
import UserMenu from "@/components/UserMenu";

/**
 * CRM Pipeline — live Kanban over the real lead funnel.
 * Data: GET /leads (role-scoped server-side). Moves: PATCH /leads/:id.
 * Real-time: every stage move anywhere emits `lead:update`, which patches
 * the board instantly for all connected users.
 */

const STAGES: { key: LeadStage; label: string; tone: string }[] = [
  { key: "GENERATED", label: "Generated", tone: "#94A3B8" },
  { key: "ASSIGNED", label: "Assigned", tone: "#7C5CFF" },
  { key: "CONTACTED", label: "Contacted", tone: "#38BDF8" },
  { key: "INTERESTED", label: "Interested", tone: "#22D3EE" },
  { key: "SITE_VISIT", label: "Site Visit", tone: "#F5B33F" },
  { key: "NEGOTIATION", label: "Negotiation", tone: "#FB923C" },
  { key: "BOOKING", label: "Booking", tone: "#14C79A" },
  { key: "REGISTRATION", label: "Registration", tone: "#10B981" },
  { key: "COMPLETED", label: "Completed", tone: "#34D399" },
  { key: "LOST", label: "Lost", tone: "#F4574A" },
];

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function PipelinePage() {
  const user = useAuthStore((s) => s.user);
  const [leadRows, setLeadRows] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<LeadStage | null>(null);

  async function load() {
    try {
      const res = await api.get("/leads");
      setLeadRows(res.data.leads ?? []);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to load pipeline");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  // Live board: merge any lead update pushed from the server.
  useSocketEvent<Lead>("lead:update", (lead) => {
    setLeadRows((prev) => {
      const idx = prev.findIndex((l) => l._id === lead._id);
      if (idx === -1) return prev; // not visible to this role — GET scoping decides
      const next = [...prev];
      next[idx] = { ...next[idx], ...lead };
      return next;
    });
  });

  const byStage = useMemo(() => {
    const map = new Map<LeadStage, Lead[]>(STAGES.map((s) => [s.key, []]));
    for (const l of leadRows) map.get(l.stage)?.push(l);
    return map;
  }, [leadRows]);

  const won = byStage.get("COMPLETED")?.length ?? 0;
  const active = leadRows.length - won - (byStage.get("LOST")?.length ?? 0);

  async function moveLead(leadId: string, to: LeadStage) {
    const lead = leadRows.find((l) => l._id === leadId);
    if (!lead || lead.stage === to) return;
    const from = lead.stage;
    // Optimistic move; server is the authority and may reject (guardrails).
    setLeadRows((prev) => prev.map((l) => (l._id === leadId ? { ...l, stage: to } : l)));
    try {
      await api.patch(`/leads/${leadId}`, { stage: to });
    } catch (err: any) {
      setLeadRows((prev) => prev.map((l) => (l._id === leadId ? { ...l, stage: from } : l)));
      toast.error(err?.response?.data?.error || "Could not move lead");
    }
  }

  return (
    <main className="min-h-screen p-4 text-white md:p-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            to={user?.role === "CP" ? "/cp/sales" : user?.role === "DEVELOPER" ? "/developer/crm" : "/admin/dashboard"}
            className="text-muted-foreground transition-colors hover:text-white"
          >
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold">
              <KanbanSquare size={22} className="text-violet-400" /> CRM Pipeline
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Drag leads across stages — updates everyone's board in real time.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex gap-4 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs">
            <span><b className="text-white">{leadRows.length}</b> <span className="text-muted-foreground">total</span></span>
            <span><b className="text-sky-300">{active}</b> <span className="text-muted-foreground">active</span></span>
            <span><b className="text-emerald-300">{won}</b> <span className="text-muted-foreground">won</span></span>
          </div>
          <button onClick={load} className="rounded-full border border-white/10 bg-white/5 p-2 text-white/70 transition hover:bg-white/10" title="Refresh">
            <RefreshCw size={14} />
          </button>
          <UserMenu />
        </div>
      </div>

      {loading ? (
        <div className="mt-6 flex gap-3 overflow-hidden">
          {[0, 1, 2, 3, 4].map((i) => <div key={i} className="tv-skeleton h-72 w-64 shrink-0 rounded-2xl" />)}
        </div>
      ) : (
        <div className="mt-6 flex gap-3 overflow-x-auto pb-4">
          {STAGES.map((stage) => {
            const cards = byStage.get(stage.key) ?? [];
            const isOver = overStage === stage.key;
            return (
              <section
                key={stage.key}
                onDragOver={(e) => { e.preventDefault(); setOverStage(stage.key); }}
                onDragLeave={() => setOverStage((s) => (s === stage.key ? null : s))}
                onDrop={(e) => {
                  e.preventDefault();
                  setOverStage(null);
                  const id = e.dataTransfer.getData("text/lead-id") || dragId;
                  if (id) moveLead(id, stage.key);
                  setDragId(null);
                }}
                className={`flex w-64 shrink-0 flex-col rounded-2xl border bg-white/[0.02] transition-colors ${isOver ? "border-violet-400/60 bg-violet-500/[0.06]" : "border-white/10"}`}
              >
                <header className="flex items-center justify-between px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ background: stage.tone }} />
                    <span className="text-xs font-semibold uppercase tracking-wide text-white/80">{stage.label}</span>
                  </div>
                  <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-white/70">{cards.length}</span>
                </header>
                <div className="flex min-h-[120px] flex-1 flex-col gap-2 px-2 pb-2">
                  {cards.map((lead) => (
                    <article
                      key={lead._id}
                      draggable
                      onDragStart={(e) => {
                        setDragId(lead._id);
                        e.dataTransfer.setData("text/lead-id", lead._id);
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      onDragEnd={() => setDragId(null)}
                      className={`group cursor-grab rounded-xl border border-white/10 bg-white/[0.04] p-3 transition-all hover:border-white/25 active:cursor-grabbing ${dragId === lead._id ? "opacity-40" : ""}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-semibold leading-tight text-white">{lead.clientName}</p>
                        <GripVertical size={13} className="shrink-0 text-white/20 group-hover:text-white/50" />
                      </div>
                      <p className="mt-1 truncate text-[11px] text-muted-foreground">{nameOf(lead.projectId as any, "—")}</p>
                      {(lead.tags?.length ?? 0) > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {lead.tags!.slice(0, 3).map((t) => (
                            <span key={t} className="rounded-full bg-violet-500/15 px-1.5 py-0.5 text-[9px] font-medium text-violet-300">{t}</span>
                          ))}
                        </div>
                      )}
                      <div className="mt-2 flex items-center justify-between">
                        <a
                          href={`tel:${lead.clientPhone}`}
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1 text-[10px] text-sky-300 hover:underline"
                        >
                          <Phone size={10} /> {lead.clientPhone}
                        </a>
                        <span className="text-[10px] text-white/35">{timeAgo(lead.updatedAt || lead.createdAt)}</span>
                      </div>
                    </article>
                  ))}
                  {cards.length === 0 && (
                    <div className={`grid flex-1 place-items-center rounded-xl border border-dashed text-[10px] transition-colors ${isOver ? "border-violet-400/50 text-violet-300" : "border-white/10 text-white/25"}`}>
                      Drop here
                    </div>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {user?.role === "CP" && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          Note: only an Admin or Developer can move a lead into <b>Booking</b> — the stages after it unlock once the booking is confirmed.
        </p>
      )}
    </main>
  );
}

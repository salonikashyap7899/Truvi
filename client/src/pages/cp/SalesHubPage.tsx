import { useEffect, useMemo, useState, type DragEvent } from "react";
import { api } from "@/lib/api";
import { Card, Input, Label, Textarea } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { CpHubNav } from "@/components/CpHubNav";
import { ProGate } from "@/components/ProGate";
import { UpsellModal } from "@/components/UpsellModal";
import { NotificationBell } from "@/components/NotificationBell";
import UserMenu from "@/components/UserMenu";
import { useEntitlement } from "@/lib/entitlements";
import { scoreLead, suggestFollowUp } from "@/lib/crmAi";
import { nameOf, idOf, formatDate, cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  X, Phone, MessageCircle, Mail, CalendarClock, Tag, Download,
  Flame, Plus, CheckCircle2, Circle, ClipboardList, MapPin, Sparkles,
  StickyNote, ArrowLeftRight, FileText, Bot, Settings, type LucideIcon,
} from "lucide-react";
import type { Lead, LeadStage, LeadActivity, LeadFollowUp, CrmTask, FollowUpChannel } from "@/types";

/** The 8 pipeline columns. "New Lead" absorbs both pre-contact stages. */
const COLUMNS: { key: string; label: string; stages: LeadStage[]; drop: LeadStage }[] = [
  { key: "NEW", label: "New Lead", stages: ["GENERATED", "ASSIGNED"], drop: "ASSIGNED" },
  { key: "CONTACTED", label: "Contacted", stages: ["CONTACTED"], drop: "CONTACTED" },
  { key: "INTERESTED", label: "Interested", stages: ["INTERESTED"], drop: "INTERESTED" },
  { key: "SITE_VISIT", label: "Site Visit", stages: ["SITE_VISIT"], drop: "SITE_VISIT" },
  { key: "NEGOTIATION", label: "Negotiation", stages: ["NEGOTIATION"], drop: "NEGOTIATION" },
  { key: "BOOKING", label: "Booking", stages: ["BOOKING"], drop: "BOOKING" },
  { key: "REGISTRATION", label: "Registration", stages: ["REGISTRATION"], drop: "REGISTRATION" },
  { key: "COMPLETED", label: "Completed", stages: ["COMPLETED"], drop: "COMPLETED" },
];

const ACTIVITY_ICONS: Record<string, LucideIcon> = {
  CALL: Phone, WHATSAPP: MessageCircle, EMAIL: Mail, NOTE: StickyNote, STAGE_CHANGE: ArrowLeftRight,
  SITE_VISIT: MapPin, FOLLOW_UP: CalendarClock, DOCUMENT: FileText, AI_REPORT: Bot, SYSTEM: Settings,
};

const QUICK_TAGS = ["Hot", "NRI", "Investor", "First Home", "Loan Needed", "Urgent"];

export default function SalesHubPage() {
  const { entitlement, loading: entLoading } = useEntitlement();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [followUps, setFollowUps] = useState<LeadFollowUp[]>([]);
  const [tasks, setTasks] = useState<CrmTask[]>([]);
  const [selected, setSelected] = useState<Lead | null>(null);
  const [search, setSearch] = useState("");
  const [tempFilter, setTempFilter] = useState<"ALL" | "HOT" | "WARM" | "COLD">("ALL");
  const [dragId, setDragId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [upsellOpen, setUpsellOpen] = useState(false);

  const unlocked = !!entitlement?.crm;

  async function load() {
    try {
      const [leadsRes, fuRes, tasksRes] = await Promise.all([
        api.get("/leads"),
        unlocked ? api.get("/crm/followups") : Promise.resolve({ data: { followUps: [] } }),
        unlocked ? api.get("/crm/tasks") : Promise.resolve({ data: { tasks: [] } }),
      ]);
      setLeads(leadsRes.data.leads);
      setFollowUps(fuRes.data.followUps);
      setTasks(tasksRes.data.tasks);
    } catch {
      /* handled by empty states */
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (entLoading) return;
    load();
    if (!entitlement?.crm) setUpsellOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entLoading, unlocked]);

  const filtered = useMemo(() => {
    return leads.filter((l) => {
      if (search && !`${l.clientName} ${l.clientPhone} ${nameOf(l.projectId, "")}`.toLowerCase().includes(search.toLowerCase())) return false;
      if (tempFilter !== "ALL" && scoreLead(l).temperature !== tempFilter) return false;
      return true;
    });
  }, [leads, search, tempFilter]);

  async function moveLead(leadId: string, stage: LeadStage) {
    const lead = leads.find((l) => l._id === leadId);
    if (!lead || lead.stage === stage) return;
    const prev = leads;
    setLeads((ls) => ls.map((l) => (l._id === leadId ? { ...l, stage } : l)));
    try {
      await api.patch(`/leads/${leadId}`, { stage });
      toast.success(`Moved to ${stage.replace("_", " ")}`);
    } catch (err: any) {
      setLeads(prev);
      toast.error(err?.response?.data?.error || "Could not move lead");
    }
  }

  function onDrop(e: DragEvent, stage: LeadStage) {
    e.preventDefault();
    if (dragId) moveLead(dragId, stage);
    setDragId(null);
  }

  async function exportCsv() {
    try {
      const res = await api.get("/crm/export", { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `truvi-leads-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Export failed");
    }
  }

  const pendingFollowUps = followUps.filter((f) => f.status === "PENDING");
  const overdue = pendingFollowUps.filter((f) => new Date(f.dueAt).getTime() < Date.now());

  const pipeline = (
    <section className="mt-6">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-medium">Lead Pipeline</h2>
        <Input placeholder="Search name, phone, project…" value={search} onChange={(e) => setSearch(e.target.value)} className="h-8 w-56 text-xs" />
        <div className="flex gap-1">
          {(["ALL", "HOT", "WARM", "COLD"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTempFilter(t)}
              className={cn(
                "rounded-full px-3 py-1 text-xs transition-colors",
                tempFilter === t ? "bg-[var(--trust)]/20 text-white" : "bg-white/5 text-muted-foreground hover:text-white"
              )}
            >
              {t === "HOT" ? "Hot" : t === "WARM" ? "Warm" : t === "COLD" ? "Cold" : "All"}
            </button>
          ))}
        </div>
        <Button size="sm" variant="outline" className="ml-auto" onClick={exportCsv}>
          <Download size={13} /> Export CSV
        </Button>
      </div>

      <div className="mt-4 flex gap-3 overflow-x-auto pb-3">
        {COLUMNS.map((col) => {
          const colLeads = filtered.filter((l) => col.stages.includes(l.stage));
          return (
            <div
              key={col.key}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => onDrop(e, col.drop)}
              className="flex w-60 shrink-0 flex-col rounded-xl border border-white/10 bg-white/[0.02] p-2"
            >
              <div className="flex items-center justify-between px-2 py-1.5">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{col.label}</p>
                <span className="rounded-full bg-white/10 px-2 py-px text-[10px] text-white">{colLeads.length}</span>
              </div>
              <div className="min-h-24 space-y-2">
                {colLeads.map((lead) => {
                  const s = scoreLead(lead);
                  return (
                    <div
                      key={lead._id}
                      draggable
                      onDragStart={() => setDragId(lead._id)}
                      onClick={() => setSelected(lead)}
                      className="cursor-pointer rounded-lg border border-white/10 bg-[#11161f] p-3 transition-colors hover:border-[var(--trust)]/50"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium text-white leading-tight">{lead.clientName}</p>
                        {s.temperature === "HOT" && <Flame size={13} className="shrink-0 text-orange-400" />}
                      </div>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">{nameOf(lead.projectId)}</p>
                      <div className="mt-2 flex items-center justify-between">
                        <span className={cn("text-[10px] font-semibold", s.score >= 70 ? "text-emerald-400" : s.score >= 40 ? "text-amber-300" : "text-muted-foreground")}>
                          Score {s.score}%
                        </span>
                        {(lead.tags?.length ?? 0) > 0 && (
                          <span className="max-w-24 truncate rounded bg-white/10 px-1.5 py-px text-[9px] text-foreground/80">{lead.tags![0]}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
                {colLeads.length === 0 && <p className="px-2 py-3 text-center text-[10px] text-muted-foreground/50">Drop leads here</p>}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );

  return (
    <main className="min-h-screen p-6 text-white md:p-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Sales Hub</h1>
          <p className="mt-1 text-sm text-muted-foreground">Pipeline · Follow-ups · Buyer timeline · Tasks — your closing engine.</p>
        </div>
        <div className="flex items-center gap-3">
          <NotificationBell />
          <UserMenu />
        </div>
      </div>
      <CpHubNav />

      {loading || entLoading ? (
        <p className="mt-10 text-sm text-muted-foreground">Loading pipeline…</p>
      ) : (
        <ProGate unlocked={unlocked} feature="Lead Pipeline & Follow-ups" badge="CRM">
          {/* Follow-up queue — the #1 CP pain point, front and centre. */}
          <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Card className="border-white/10 glass">
              <p className="text-xs text-muted-foreground">Follow-ups pending</p>
              <p className="font-display text-2xl font-semibold">{pendingFollowUps.length}</p>
            </Card>
            <Card className={cn("glass", overdue.length ? "border-red-500/40" : "border-white/10")}>
              <p className="text-xs text-muted-foreground">Overdue</p>
              <p className={cn("font-display text-2xl font-semibold", overdue.length && "text-red-400")}>{overdue.length}</p>
            </Card>
            <Card className="border-white/10 glass">
              <p className="text-xs text-muted-foreground">Active leads</p>
              <p className="font-display text-2xl font-semibold">{leads.filter((l) => !["COMPLETED", "LOST"].includes(l.stage)).length}</p>
            </Card>
            <Card className="border-white/10 glass">
              <p className="text-xs text-muted-foreground">Open tasks</p>
              <p className="font-display text-2xl font-semibold">{tasks.filter((t) => t.status === "OPEN").length}</p>
            </Card>
          </section>

          {pipeline}

          <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <FollowUpQueue followUps={pendingFollowUps} leads={leads} onChange={load} onOpenLead={(id) => setSelected(leads.find((l) => l._id === id) || null)} />
            <TaskBoard tasks={tasks} leads={leads} onChange={load} />
          </div>
        </ProGate>
      )}

      {selected && unlocked && (
        <LeadDrawer
          lead={leads.find((l) => l._id === selected._id) || selected}
          followUps={followUps.filter((f) => f.leadId === selected._id)}
          onClose={() => setSelected(null)}
          onChange={load}
        />
      )}
      <UpsellModal open={upsellOpen && !unlocked} onClose={() => setUpsellOpen(false)} feature="Sales Hub (CRM)" />
    </main>
  );
}

// ── Follow-up queue ──────────────────────────────────────────────────────────

function FollowUpQueue({ followUps, onChange, onOpenLead }: { followUps: LeadFollowUp[]; leads: Lead[]; onChange: () => void; onOpenLead: (leadId: string) => void }) {
  async function setStatus(id: string, status: "DONE" | "MISSED") {
    try {
      await api.patch(`/crm/followups/${id}`, { status });
      onChange();
    } catch {
      toast.error("Update failed");
    }
  }

  return (
    <section>
      <h2 className="flex items-center gap-2 text-lg font-medium"><CalendarClock size={16} className="text-amber-400" /> Follow-up queue</h2>
      <div className="mt-3 space-y-2">
        {followUps.slice(0, 8).map((f) => {
          const isOverdue = new Date(f.dueAt).getTime() < Date.now();
          return (
            <Card key={f._id} className={cn("flex items-center justify-between gap-3 glass py-3", isOverdue ? "border-red-500/40" : "border-white/10")}>
              <button className="min-w-0 text-left" onClick={() => f.lead && onOpenLead(f.lead._id)}>
                <p className="truncate text-sm font-medium">{f.lead?.clientName || "Lead"} <span className="text-xs text-muted-foreground">· {f.channel}</span></p>
                <p className={cn("text-xs", isOverdue ? "text-red-400" : "text-muted-foreground")}>
                  {isOverdue ? "Overdue — " : "Due "} {new Date(f.dueAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                  {f.note ? ` · ${f.note}` : ""}
                </p>
              </button>
              <div className="flex shrink-0 gap-2">
                <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setStatus(f._id, "DONE")}>Done</Button>
                <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setStatus(f._id, "MISSED")}>Missed</Button>
              </div>
            </Card>
          );
        })}
        {followUps.length === 0 && <p className="text-sm text-muted-foreground">No pending follow-ups. Open a lead to schedule one.</p>}
      </div>
    </section>
  );
}

// ── Tasks ────────────────────────────────────────────────────────────────────

function TaskBoard({ tasks, leads, onChange }: { tasks: CrmTask[]; leads: Lead[]; onChange: () => void }) {
  const [title, setTitle] = useState("");
  const [dueAt, setDueAt] = useState("");

  async function addTask() {
    if (!title.trim()) return;
    try {
      await api.post("/crm/tasks", { title: title.trim(), dueAt: dueAt || undefined });
      setTitle("");
      setDueAt("");
      onChange();
    } catch {
      toast.error("Could not add task");
    }
  }

  async function toggle(t: CrmTask) {
    try {
      await api.patch(`/crm/tasks/${t._id}`, { status: t.status === "OPEN" ? "DONE" : "OPEN" });
      onChange();
    } catch {
      toast.error("Update failed");
    }
  }

  const leadName = (id?: string | null) => (id ? leads.find((l) => l._id === id)?.clientName : null);

  return (
    <section>
      <h2 className="flex items-center gap-2 text-lg font-medium"><ClipboardList size={16} className="text-sky-400" /> Tasks</h2>
      <div className="mt-3 flex gap-2">
        <Input placeholder="Add a task…" value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addTask()} className="h-9 text-sm" />
        <Input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} className="h-9 w-48 text-xs" />
        <Button size="sm" onClick={addTask}><Plus size={14} /></Button>
      </div>
      <div className="mt-3 space-y-1.5">
        {tasks.slice(0, 10).map((t) => (
          <button key={t._id} onClick={() => toggle(t)} className="flex w-full items-center gap-2.5 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-left transition-colors hover:bg-white/[0.06]">
            {t.status === "DONE" ? <CheckCircle2 size={15} className="shrink-0 text-emerald-400" /> : <Circle size={15} className="shrink-0 text-muted-foreground" />}
            <span className={cn("flex-1 text-sm", t.status === "DONE" && "text-muted-foreground line-through")}>{t.title}</span>
            {leadName(t.leadId) && <span className="text-[10px] text-sky-300">{leadName(t.leadId)}</span>}
            {t.dueAt && <span className="text-[10px] text-muted-foreground">{formatDate(t.dueAt)}</span>}
          </button>
        ))}
        {tasks.length === 0 && <p className="text-sm text-muted-foreground">No tasks yet.</p>}
      </div>
    </section>
  );
}

// ── Lead drawer: follow-ups, timeline, notes, tags, actions ─────────────────

function LeadDrawer({ lead, followUps, onClose, onChange }: { lead: Lead; followUps: LeadFollowUp[]; onClose: () => void; onChange: () => void }) {
  const [activities, setActivities] = useState<LeadActivity[]>([]);
  const [note, setNote] = useState("");
  const [fuDate, setFuDate] = useState("");
  const [fuChannel, setFuChannel] = useState<FollowUpChannel>("CALL");
  const [visitDate, setVisitDate] = useState("");
  const score = scoreLead(lead, activities.length);

  async function loadActivities() {
    try {
      const res = await api.get(`/crm/leads/${lead._id}/activities`);
      setActivities(res.data.activities);
    } catch {
      /* drawer still works without timeline */
    }
  }

  useEffect(() => {
    loadActivities();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead._id]);

  async function log(type: "CALL" | "WHATSAPP" | "EMAIL" | "NOTE", content: string) {
    try {
      await api.post(`/crm/leads/${lead._id}/activities`, { type, content });
      loadActivities();
    } catch {
      toast.error("Could not log activity");
    }
  }

  async function addFollowUp() {
    if (!fuDate) return toast.error("Pick a date & time");
    try {
      await api.post(`/crm/leads/${lead._id}/followups`, { dueAt: new Date(fuDate).toISOString(), channel: fuChannel });
      setFuDate("");
      toast.success("Follow-up scheduled — we'll remind you");
      onChange();
      loadActivities();
    } catch {
      toast.error("Could not schedule follow-up");
    }
  }

  async function toggleTag(tag: string) {
    const tags = lead.tags?.includes(tag) ? lead.tags.filter((t) => t !== tag) : [...(lead.tags ?? []), tag];
    try {
      await api.patch(`/crm/leads/${lead._id}/tags`, { tags });
      onChange();
    } catch {
      toast.error("Could not update tags");
    }
  }

  async function scheduleVisit() {
    if (!visitDate) return toast.error("Pick a date & time");
    try {
      await api.post("/site-visits", { leadId: lead._id, projectId: idOf(lead.projectId), scheduledAt: new Date(visitDate).toISOString() });
      await log("NOTE", `Site visit scheduled for ${new Date(visitDate).toLocaleString("en-IN")}`);
      setVisitDate("");
      toast.success("Site visit scheduled");
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Could not schedule visit");
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex justify-end">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-white/10 bg-[#0d1117] p-5 text-white shadow-2xl">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-semibold">{lead.clientName}</h3>
            <p className="text-xs text-muted-foreground">{nameOf(lead.projectId)} · {lead.clientPhone}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground hover:bg-white/10 hover:text-white"><X size={16} /></button>
        </div>

        {/* AI score */}
        <div className="mt-4 rounded-xl border border-purple-500/30 bg-purple-950/20 p-3">
          <p className="text-sm font-semibold">
            Buyer Score {score.score}% · {score.temperature === "HOT" ? "Hot Lead" : score.temperature === "WARM" ? "Warm Lead" : "Cold Lead"} · Probability to Close {score.closeProbability}%
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{score.reasons.join(" · ")}</p>
          <p className="mt-2 flex items-start gap-1.5 text-xs text-purple-300"><Sparkles size={12} className="mt-0.5 shrink-0" /> {suggestFollowUp(lead)}</p>
        </div>

        {/* Contact actions */}
        <div className="mt-4 grid grid-cols-3 gap-2">
          <a href={`tel:+91${lead.clientPhone}`} onClick={() => log("CALL", `Called ${lead.clientName}`)}
            className="flex items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] py-2 text-xs hover:bg-white/10">
            <Phone size={13} className="text-sky-400" /> Call
          </a>
          <a href={`https://wa.me/91${lead.clientPhone}?text=${encodeURIComponent(`Hi ${lead.clientName}, following up on ${nameOf(lead.projectId, "your enquiry")}.`)}`}
            target="_blank" rel="noreferrer" onClick={() => log("WHATSAPP", `WhatsApp sent to ${lead.clientName}`)}
            className="flex items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] py-2 text-xs hover:bg-white/10">
            <MessageCircle size={13} className="text-emerald-400" /> WhatsApp
          </a>
          <a href={lead.clientEmail ? `mailto:${lead.clientEmail}` : undefined}
            onClick={() => lead.clientEmail && log("EMAIL", `Email sent to ${lead.clientName}`)}
            className={cn("flex items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] py-2 text-xs", lead.clientEmail ? "hover:bg-white/10" : "opacity-40")}>
            <Mail size={13} className="text-amber-400" /> Email
          </a>
        </div>

        {/* Tags */}
        <div className="mt-4">
          <Label className="flex items-center gap-1.5 text-xs"><Tag size={12} /> Lead tags</Label>
          <div className="flex flex-wrap gap-1.5">
            {QUICK_TAGS.map((t) => (
              <button key={t} onClick={() => toggleTag(t)}
                className={cn("rounded-full px-2.5 py-1 text-[11px] transition-colors", lead.tags?.includes(t) ? "bg-[var(--trust)]/25 text-white" : "bg-white/5 text-muted-foreground hover:text-white")}>
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Next follow-up */}
        <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.02] p-3">
          <Label className="text-xs">Next follow-up</Label>
          <div className="flex gap-2">
            <Input type="datetime-local" value={fuDate} onChange={(e) => setFuDate(e.target.value)} className="h-8 text-xs" />
            <select value={fuChannel} onChange={(e) => setFuChannel(e.target.value as FollowUpChannel)} className="h-8 rounded-lg border border-white/10 bg-white/[0.04] px-2 text-xs text-white outline-none">
              {["CALL", "WHATSAPP", "EMAIL", "MEETING"].map((c) => <option key={c} value={c} className="bg-[#0d1117]">{c}</option>)}
            </select>
            <Button size="sm" className="h-8 px-3 text-xs" onClick={addFollowUp}>Set</Button>
          </div>
          {followUps.filter((f) => f.status === "PENDING").map((f) => (
            <p key={f._id} className="mt-2 text-[11px] text-amber-300">⏰ {f.channel} — {new Date(f.dueAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
          ))}
        </div>

        {/* Site visit scheduler */}
        <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.02] p-3">
          <Label className="flex items-center gap-1.5 text-xs"><MapPin size={12} /> Schedule site visit</Label>
          <div className="flex gap-2">
            <Input type="datetime-local" value={visitDate} onChange={(e) => setVisitDate(e.target.value)} className="h-8 text-xs" />
            <Button size="sm" variant="outline" className="h-8 px-3 text-xs" onClick={scheduleVisit}>Book</Button>
          </div>
        </div>

        {/* Notes */}
        <div className="mt-3">
          <Label className="text-xs">Add note</Label>
          <div className="flex gap-2">
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Prefers east-facing, budget flexible till 1.2Cr" className="text-xs" />
          </div>
          <Button size="sm" variant="outline" className="mt-2 h-7 px-3 text-xs" onClick={() => { if (note.trim()) { log("NOTE", note.trim()); setNote(""); } }}>Save note</Button>
        </div>

        {/* Buyer timeline */}
        <div className="mt-5">
          <h4 className="text-sm font-semibold">Buyer Timeline</h4>
          <div className="mt-2 space-y-0 border-l border-white/10 pl-4">
            {activities.map((a) => {
              const Icon = ACTIVITY_ICONS[a.type] ?? Circle;
              return (
                <div key={a._id} className="relative pb-3">
                  <Icon size={12} className="absolute -left-[22px] top-1 text-muted-foreground" />
                  <p className="text-xs text-foreground/90">{a.content}</p>
                  <p className="text-[10px] text-muted-foreground">{new Date(a.createdAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
                </div>
              );
            })}
            <div className="relative">
              <Sparkles size={12} className="absolute -left-[22px] top-1 text-muted-foreground" />
              <p className="text-xs text-foreground/90">Lead created via {lead.source}</p>
              <p className="text-[10px] text-muted-foreground">{formatDate(lead.createdAt)}</p>
            </div>
          </div>
        </div>

        {/* Call history */}
        <div className="mt-4 pb-6">
          <h4 className="text-sm font-semibold">Call history</h4>
          {activities.filter((a) => a.type === "CALL").length === 0 ? (
            <p className="mt-1 text-xs text-muted-foreground">No calls logged yet — tap Call above to start.</p>
          ) : (
            activities.filter((a) => a.type === "CALL").map((a) => (
              <p key={a._id} className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground"><Phone size={11} /> {new Date(a.createdAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { Card, Badge } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { CpHubNav } from "@/components/CpHubNav";
import { ProGate } from "@/components/ProGate";
import { NotificationBell } from "@/components/NotificationBell";
import UserMenu from "@/components/UserMenu";
import { useEntitlement } from "@/lib/entitlements";
import { runCopilot, scoreLead, suggestFollowUp, callScript, whatsAppScript, emailScript, type CopilotMatch } from "@/lib/crmAi";
import { formatINR, nameOf, cn } from "@/lib/utils";
import { toast } from "sonner";
import { Bot, Copy, Flame, MessageCircle, Phone, Mail, Send, Sparkles, Star, Target } from "lucide-react";
import type { Lead, Project, Unit } from "@/types";

type ScriptKind = "call" | "whatsapp" | "email";

/**
 * AI Hub — the flagship. Free tier: basic AI property suggestions.
 * CP Pro: Copilot (budget → matches + commission + ready scripts), AI lead
 * scoring, follow-up suggestions and deal probability.
 */
export default function AIHubPage() {
  const { entitlement } = useEntitlement();
  const [projects, setProjects] = useState<Project[]>([]);
  const [unitsByProject, setUnitsByProject] = useState<Record<string, Unit[]>>({});
  const [leads, setLeads] = useState<Lead[]>([]);
  const [query, setQuery] = useState("");
  const [ran, setRan] = useState(false);
  const [scriptFor, setScriptFor] = useState<{ match: CopilotMatch; kind: ScriptKind } | null>(null);

  const aiUnlocked = !!entitlement?.ai;

  useEffect(() => {
    (async () => {
      try {
        const [projectsRes, leadsRes] = await Promise.all([api.get("/projects"), api.get("/leads")]);
        const projectList: Project[] = projectsRes.data.projects;
        setProjects(projectList);
        setLeads(leadsRes.data.leads);
        const unitLists = await Promise.all(projectList.map((p) => api.get("/units", { params: { projectId: p._id } })));
        const map: Record<string, Unit[]> = {};
        projectList.forEach((p, i) => (map[p._id] = unitLists[i].data.units));
        setUnitsByProject(map);
      } catch {
        /* empty states below */
      }
    })();
  }, []);

  const result = useMemo(() => (ran && query ? runCopilot(query, projects, unitsByProject) : null), [ran, query, projects, unitsByProject]);

  const scoredLeads = useMemo(
    () =>
      leads
        .filter((l) => !["COMPLETED", "LOST"].includes(l.stage))
        .map((l) => ({ lead: l, score: scoreLead(l) }))
        .sort((a, b) => b.score.score - a.score.score),
    [leads]
  );

  function copyText(text: string) {
    navigator.clipboard.writeText(text);
    toast.success("Copied — paste it anywhere");
  }

  const script = scriptFor
    ? scriptFor.kind === "call"
      ? callScript("", scriptFor.match.project, scriptFor.match.fitPrice)
      : scriptFor.kind === "whatsapp"
        ? whatsAppScript("", scriptFor.match.project, scriptFor.match.fitPrice)
        : emailScript("", scriptFor.match.project, scriptFor.match.fitPrice)
    : null;

  return (
    <main className="min-h-screen p-6 text-white md:p-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold"><Bot size={22} className="text-purple-400" /> AI Hub</h1>
          <p className="mt-1 text-sm text-muted-foreground">Copilot · Lead scoring · Property match · Sales scripts · Follow-up intelligence.</p>
        </div>
        <div className="flex items-center gap-3">
          <NotificationBell />
          <UserMenu />
        </div>
      </div>
      <CpHubNav />

      {/* ── AI COPILOT (flagship) ── */}
      <section className="mt-6 rounded-2xl border border-purple-500/30 bg-gradient-to-br from-purple-950/40 via-[#0d1117] to-[#0d1117] p-6">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500 to-fuchsia-600 shadow-lg shadow-purple-900/40"><Sparkles size={16} /></span>
          <div>
            <h2 className="text-lg font-semibold">AI Copilot</h2>
            <p className="text-xs text-muted-foreground">Describe your buyer — get matches, closing odds, commission and ready-to-send scripts.</p>
          </div>
        </div>

        <div className="mt-4 flex gap-2">
          <input
            value={query}
            onChange={(e) => { setQuery(e.target.value); setRan(false); }}
            onKeyDown={(e) => e.key === "Enter" && setRan(true)}
            placeholder={'Describe your buyer — e.g. "₹5 crore budget in Mumbai" or "3BHK, ₹80 lakh in Pune"'}
            className="h-12 flex-1 rounded-xl border border-purple-500/30 bg-white/[0.04] px-4 text-sm text-white outline-none placeholder:text-muted-foreground/60 focus:border-purple-400"
          />
          <Button size="lg" className="bg-purple-600 shadow-[0_0_24px_-6px_#9333ea] hover:bg-purple-500" onClick={() => setRan(true)}>
            <Send size={15} /> Ask
          </Button>
        </div>

        {result && (
          <ProGate unlocked={aiUnlocked} feature="AI Copilot" badge="Pro">
            <div className="mt-5">
              {result.matches.length === 0 ? (
                <p className="text-sm text-muted-foreground">No live inventory matches that budget yet — try a different amount or city.</p>
              ) : (
                <>
                  <p className="text-sm font-semibold text-purple-300">
                    {result.matches.length} matching project{result.matches.length > 1 ? "s" : ""} found
                    {result.budget ? ` for ${formatINR(result.budget)} budget` : ""}{result.city ? ` in ${result.city}` : ""}
                  </p>
                  <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
                    {result.matches.map((m) => (
                      <Card key={m.project._id} className="border-purple-500/20 bg-purple-950/10">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-medium leading-snug">{m.project.name}</p>
                          {m.project.listingTier === "FEATURED" && <Badge variant="featured">Featured</Badge>}
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">{m.project.location}, {m.project.city}</p>
                        <div className="mt-3 space-y-1.5 text-xs">
                          <div className="flex justify-between"><span className="text-muted-foreground">Estimated closing</span><span className="font-semibold text-emerald-400">{m.closingEstimate}%</span></div>
                          <div className="flex justify-between"><span className="text-muted-foreground">Expected commission</span><span className="font-semibold text-amber-300">{formatINR(m.expectedCommission)}</span></div>
                          {m.fitPrice > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Fit price</span><span>{formatINR(m.fitPrice)}</span></div>}
                        </div>
                        <div className="mt-3 grid grid-cols-3 gap-1.5">
                          <button onClick={() => setScriptFor({ match: m, kind: "call" })} className="flex items-center justify-center gap-1 rounded-lg bg-white/5 py-1.5 text-[10px] hover:bg-white/10"><Phone size={11} className="text-sky-400" /> Call</button>
                          <button onClick={() => setScriptFor({ match: m, kind: "whatsapp" })} className="flex items-center justify-center gap-1 rounded-lg bg-white/5 py-1.5 text-[10px] hover:bg-white/10"><MessageCircle size={11} className="text-emerald-400" /> WhatsApp</button>
                          <button onClick={() => setScriptFor({ match: m, kind: "email" })} className="flex items-center justify-center gap-1 rounded-lg bg-white/5 py-1.5 text-[10px] hover:bg-white/10"><Mail size={11} className="text-amber-400" /> Email</button>
                        </div>
                      </Card>
                    ))}
                  </div>
                </>
              )}
            </div>
          </ProGate>
        )}

        {script && scriptFor && (
          <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-purple-300">
                {scriptFor.kind === "call" ? "Call Script Ready" : scriptFor.kind === "whatsapp" ? "WhatsApp Ready" : "Email Ready"} — {scriptFor.match.project.name}
              </p>
              <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => copyText(script)}><Copy size={12} /> Copy</Button>
            </div>
            <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-foreground/90">{script}</p>
          </div>
        )}
      </section>

      {/* ── AI Lead scoring (Pro) ── */}
      <section className="mt-8">
        <h2 className="flex items-center gap-2 text-lg font-medium"><Target size={16} className="text-emerald-400" /> AI Lead Scoring</h2>
        <p className="mt-1 text-xs text-muted-foreground">Every lead auto-scored on stage, recency and engagement — call the hottest first.</p>
        <ProGate unlocked={aiUnlocked} feature="AI Lead Scoring" badge="Pro" className="mt-3">
          <div className="space-y-2">
            {(aiUnlocked ? scoredLeads : scoredLeads.slice(0, 3)).slice(0, 8).map(({ lead, score }) => (
              <Card key={lead._id} className="flex flex-wrap items-center justify-between gap-3 border-white/10 glass py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{lead.clientName} <span className="text-xs text-muted-foreground">· {nameOf(lead.projectId)}</span></p>
                  <p className="mt-0.5 text-xs text-purple-300"><Sparkles size={11} className="mr-1 inline" />{suggestFollowUp(lead)}</p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <div className="text-right">
                    <p className={cn("text-sm font-bold", score.score >= 70 ? "text-emerald-400" : score.score >= 40 ? "text-amber-300" : "text-muted-foreground")}>
                      {score.score}%
                    </p>
                    <p className="text-[10px] text-muted-foreground">Close: {score.closeProbability}%</p>
                  </div>
                  {score.temperature === "HOT" && <span className="flex items-center gap-1 rounded-full bg-orange-500/15 px-2 py-1 text-[10px] font-semibold text-orange-300"><Flame size={10} /> HOT</span>}
                </div>
              </Card>
            ))}
            {scoredLeads.length === 0 && <p className="text-sm text-muted-foreground">No active leads yet — submit one from the dashboard or marketplace.</p>}
          </div>
        </ProGate>
      </section>

      {/* ── Free: basic AI property suggestions ── */}
      <section className="mt-8">
        <h2 className="flex items-center gap-2 text-lg font-medium"><Star size={16} className="text-yellow-400" /> AI Property Suggestions <Badge variant="success">Free</Badge></h2>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[...projects]
            .sort((a, b) => b.commissionPercent - a.commissionPercent)
            .slice(0, 3)
            .map((p) => (
              <Card key={p._id} className="border-white/10 glass">
                <p className="text-sm font-medium">{p.name}</p>
                <p className="text-xs text-muted-foreground">{p.city}</p>
                <p className="mt-2 text-xs"><span className="text-muted-foreground">Commission</span> <span className="font-semibold text-emerald-400">{p.commissionPercent}%</span></p>
              </Card>
            ))}
          {projects.length === 0 && <p className="text-sm text-muted-foreground">No live projects yet.</p>}
        </div>
        {!aiUnlocked && (
          <p className="mt-3 text-xs text-muted-foreground">
            Free tier shows basic suggestions. <span className="text-amber-300">Upgrade to CP Pro</span> for scoring, deal probability, objection handling and the full Copilot.
          </p>
        )}
      </section>
    </main>
  );
}

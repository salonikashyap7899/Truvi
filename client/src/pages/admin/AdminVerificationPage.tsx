import { useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/primitives";
import { toast } from "sonner";
import { Play, Loader2, ShieldCheck, Database, CheckSquare, AlertTriangle, Cpu, Sliders, FileClock, Search } from "lucide-react";
import SectionInfoTooltip from "@/components/admin/SectionInfoTooltip";
import ChecksManager from "@/components/admin/verification/ChecksManager";
import DataIngestPanel from "@/components/admin/verification/DataIngestPanel";
import ProjectDataVault from "@/components/admin/verification/ProjectDataVault";
import FraudRulesManager from "@/components/admin/verification/FraudRulesManager";
import PromptEditor from "@/components/admin/verification/PromptEditor";
import ThresholdSettings from "@/components/admin/verification/ThresholdSettings";
import AuditLogViewer from "@/components/admin/verification/AuditLogViewer";
import VerificationPanel from "@/components/verification/VerificationPanel";
import PropertyProfile from "@/components/verification/PropertyProfile";
import TruviAskAI from "@/components/verification/TruviAskAI";

const TABS = [
  { id: 0, label: "Run & Inspect", icon: Play },
  { id: 1, label: "Ingest Data", icon: Database },
  { id: 2, label: "Data Vault", icon: Search },
  { id: 3, label: "Checks", icon: CheckSquare },
  { id: 4, label: "Fraud Rules", icon: AlertTriangle },
  { id: 5, label: "AI Prompt", icon: Cpu },
  { id: 6, label: "Thresholds", icon: Sliders },
  { id: 7, label: "Audit Log", icon: FileClock },
] as const;

/** Admin console for the dynamic verification engine. */
export default function AdminVerificationPage() {
  const [tab, setTab] = useState(0);

  return (
    <main className="min-h-screen p-4 sm:p-6 lg:p-8 text-foreground max-w-[1600px] mx-auto space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold sm:text-3xl flex items-center gap-2.5">
              <ShieldCheck size={24} className="text-sky-400" />
              Verification Engine
            </h1>
            <SectionInfoTooltip
              title="Automated Property Verification System"
              content="Real-time multi-dimensional verification orchestration. Run ad-hoc inspections on properties, adjust fraud detection rules, refine AI prompts, configure confidence score thresholds, and audit verification events."
            />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Manage checks, fraud rules, the AI prompt and thresholds — changes take effect immediately without redeploying.
          </p>
        </div>
      </div>

      {/* Sleek Segmented Tab Strip */}
      <div className="flex flex-wrap gap-1.5 rounded-xl border border-white/10 bg-white/[0.02] p-1.5 w-fit">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all ${
                tab === t.id
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
              }`}
            >
              <Icon size={14} />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      <div className="rounded-xl border border-white/10 bg-card p-4 sm:p-6 shadow-sm">
        {tab === 0 && <RunInspect />}
        {tab === 1 && <DataIngestPanel />}
        {tab === 2 && <ProjectDataVault />}
        {tab === 3 && <ChecksManager />}
        {tab === 4 && <FraudRulesManager />}
        {tab === 5 && <PromptEditor />}
        {tab === 6 && <ThresholdSettings />}
        {tab === 7 && <AuditLogViewer />}
      </div>
    </main>
  );
}

function RunInspect() {
  const [projectId, setProjectId] = useState("");
  const [active, setActive] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  async function run() {
    const id = projectId.trim();
    if (!id) return;
    setBusy(true);
    try {
      const { data } = await api.post(`/verify/${id}`);
      setActive(id);
      setReloadKey((k) => k + 1);
      toast.success(`Verified — ${data.verification.status} (${data.verification.confidenceScore}%), ${data.fraud.length} fraud hit(s)`);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Verification failed");
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          placeholder="Project / property ID (UUID)"
          className="w-full sm:w-96 rounded-xl border-white/10 bg-background text-foreground text-xs"
        />
        <Button onClick={run} disabled={busy} className="rounded-xl text-xs font-semibold">
          {busy ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <Play size={14} className="mr-1.5" />}
          Run Verification Engine
        </Button>
      </div>

      {active && (
        <div className="space-y-6 border-t border-white/10 pt-6">
          <VerificationPanel projectId={active} reloadKey={reloadKey} />
          <PropertyProfile projectId={active} />
          <TruviAskAI projectId={active} />
        </div>
      )}
    </div>
  );
}

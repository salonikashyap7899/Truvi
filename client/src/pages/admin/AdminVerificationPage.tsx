import { useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/primitives";
import { toast } from "sonner";
import { Play, Loader2 } from "lucide-react";
import ChecksManager from "@/components/admin/verification/ChecksManager";
import FraudRulesManager from "@/components/admin/verification/FraudRulesManager";
import PromptEditor from "@/components/admin/verification/PromptEditor";
import ThresholdSettings from "@/components/admin/verification/ThresholdSettings";
import AuditLogViewer from "@/components/admin/verification/AuditLogViewer";
import VerificationPanel from "@/components/verification/VerificationPanel";
import PropertyProfile from "@/components/verification/PropertyProfile";
import TruviAskAI from "@/components/verification/TruviAskAI";

const TABS = ["Run & Inspect", "Checks", "Fraud Rules", "AI Prompt", "Thresholds", "Audit Log"] as const;

/** Admin console for the dynamic verification engine. */
export default function AdminVerificationPage() {
  const [tab, setTab] = useState(0);

  return (
    <main className="min-h-screen bg-background p-6 text-white md:p-10">
      <h1 className="font-display text-2xl font-semibold">Verification Engine</h1>
      <p className="mt-1 text-sm text-muted-foreground">Manage checks, fraud rules, the AI prompt and thresholds — changes take effect immediately, no redeploy.</p>

      <div className="mt-6 flex flex-wrap gap-1 rounded-full border border-white/10 glass p-1 w-fit">
        {TABS.map((t, i) => (
          <button key={t} onClick={() => setTab(i)} className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${i === tab ? "bg-[var(--trust)] text-white" : "text-muted-foreground hover:text-foreground"}`}>{t}</button>
        ))}
      </div>

      <div className="mt-6">
        {tab === 0 && <RunInspect />}
        {tab === 1 && <ChecksManager />}
        {tab === 2 && <FraudRulesManager />}
        {tab === 3 && <PromptEditor />}
        {tab === 4 && <ThresholdSettings />}
        {tab === 5 && <AuditLogViewer />}
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
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <Input value={projectId} onChange={(e) => setProjectId(e.target.value)} placeholder="Project / property ID (UUID)" className="w-80 border-white/15 bg-card text-white" />
        <Button onClick={run} disabled={busy}>{busy ? <Loader2 size={15} className="mr-1 animate-spin" /> : <Play size={15} className="mr-1" />}Run verification</Button>
      </div>

      {active && (
        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1fr]">
          <div className="space-y-6">
            <VerificationPanel projectId={active} reloadKey={reloadKey} />
            <PropertyProfile projectId={active} />
          </div>
          <TruviAskAI projectId={active} />
        </div>
      )}
    </div>
  );
}

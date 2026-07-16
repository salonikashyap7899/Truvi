import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/primitives";
import { toast } from "sonner";

/** Edit the single score_thresholds row (Verified / Pending cutoffs). */
export default function ThresholdSettings() {
  const [verifiedMin, setVerifiedMin] = useState(85);
  const [pendingMin, setPendingMin] = useState(50);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Thresholds are read via the verification result today; expose current
    // values by attempting a no-op save preview isn't ideal — default to 85/50
    // and let the admin overwrite. (A GET can be added later.)
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true);
    try {
      await api.put("/admin/thresholds", { verifiedMin: Number(verifiedMin), pendingMin: Number(pendingMin) });
      toast.success("Thresholds saved — applies on the next verification run");
    } catch (err: any) { toast.error(err?.response?.data?.error || "Failed"); } finally { setBusy(false); }
  }

  return (
    <form onSubmit={save} className="max-w-md space-y-4 rounded-2xl border border-white/10 glass p-5">
      <p className="font-display text-sm font-semibold">Score thresholds</p>
      <p className="text-xs text-muted-foreground">A property scores 0–100. At or above <b>Verified</b> → Verified; at or above <b>Pending</b> → Pending; below → Unavailable.</p>
      <div><Label>Verified minimum</Label><Input type="number" min={0} max={100} value={verifiedMin} onChange={(e) => setVerifiedMin(Number(e.target.value))} className="border-white/15 bg-card text-white" /></div>
      <div><Label>Pending minimum</Label><Input type="number" min={0} max={100} value={pendingMin} onChange={(e) => setPendingMin(Number(e.target.value))} className="border-white/15 bg-card text-white" /></div>
      <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save thresholds"}</Button>
    </form>
  );
}

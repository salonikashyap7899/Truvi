import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card, Label, Input } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function AdminSettingsPage() {
  const [feePercent, setFeePercent] = useState<number | "">("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get("/admin/settings").then((res) => setFeePercent(res.data.platformFeePercent ?? ""));
  }, []);

  async function save() {
    setLoading(true);
    try {
      await api.patch("/admin/settings", { platformFeePercent: Number(feePercent) });
      toast.success("Platform fee updated");
    } catch {
      toast.error("Failed to update");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen p-6 text-white md:p-10">
      <h1 className="text-2xl font-semibold">Platform Settings</h1>
      <Card className="mt-6 max-w-md border-white/10 glass text-white">
        <Label className="text-foreground/90">Platform fee (% of booking value, billed to Developer)</Label>
        <Input
          type="number"
          step="0.05"
          min={0}
          max={5}
          value={feePercent}
          onChange={(e) => setFeePercent(e.target.value === "" ? "" : Number(e.target.value))}
          className="border-white/15 bg-card text-white"
        />
        <p className="mt-2 text-xs text-muted-foreground">Recommended range: 0.5–1%. This is never deducted from CP commissions.</p>
        <Button className="mt-4" disabled={loading} onClick={save}>
          {loading ? "Saving…" : "Save"}
        </Button>
      </Card>
    </main>
  );
}

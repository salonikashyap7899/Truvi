import { useEffect, useState, type ReactNode } from "react";
import {
  SlidersHorizontal, Percent, Landmark, Bell, CreditCard, Sparkles, ShieldCheck, Users,
} from "lucide-react";
import { api } from "@/lib/api";
import { Card, Label, Input } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type TabKey = "general" | "fees" | "gst" | "notifications" | "payments" | "ai" | "security";

const TABS: { key: TabKey; label: string; icon: ReactNode }[] = [
  { key: "general", label: "General", icon: <SlidersHorizontal size={15} /> },
  { key: "fees", label: "Fees & Commission", icon: <Percent size={15} /> },
  { key: "gst", label: "GST & Tax", icon: <Landmark size={15} /> },
  { key: "notifications", label: "Notifications", icon: <Bell size={15} /> },
  { key: "payments", label: "Payments", icon: <CreditCard size={15} /> },
  { key: "ai", label: "AI Copilot", icon: <Sparkles size={15} /> },
  { key: "security", label: "Security", icon: <ShieldCheck size={15} /> },
];

function Soon() {
  return <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] font-medium text-violet-300">Roadmap</span>;
}

function RoadmapPanel({ title, desc, items }: { title: string; desc: string; items: string[] }) {
  return (
    <Card className="border-white/10 glass text-white">
      <div className="flex items-center gap-2"><h3 className="font-display text-lg font-semibold">{title}</h3><Soon /></div>
      <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {items.map((it) => (
          <div key={it} className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-sm text-white/70">
            <span className="h-1.5 w-1.5 rounded-full bg-violet-400" /> {it}
          </div>
        ))}
      </div>
      <p className="mt-4 text-xs text-muted-foreground">These controls will persist once their service integration is connected. The UI is ready — wiring is tracked on the platform roadmap.</p>
    </Card>
  );
}

export default function AdminSettingsPage() {
  const [tab, setTab] = useState<TabKey>("fees");
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
      <p className="text-xs uppercase tracking-widest text-violet-300/70">Truvi · Admin</p>
      <h1 className="mt-1 text-2xl font-semibold md:text-3xl">Platform Settings</h1>
      <p className="mt-1 text-sm text-muted-foreground">Configure fees, tax, notifications, payments, AI and security.</p>

      <div className="mt-6 grid gap-6 lg:grid-cols-[220px_1fr]">
        {/* Tab rail */}
        <nav className="flex gap-2 overflow-x-auto lg:flex-col lg:overflow-visible">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex shrink-0 items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm font-medium transition ${tab === t.key ? "bg-violet-500/15 text-white ring-1 ring-violet-400/40" : "text-white/60 hover:bg-white/5 hover:text-white"}`}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </nav>

        {/* Panels */}
        <div className="tv-fade-up space-y-5">
          {tab === "general" && (
            <Card className="border-white/10 glass text-white">
              <div className="flex items-center gap-2"><Users size={18} className="text-violet-300" /><h3 className="font-display text-lg font-semibold">Organization</h3></div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <Label className="text-foreground/90">Platform name</Label>
                  <Input value="Truvi" readOnly className="border-white/15 bg-card text-white/70" />
                </div>
                <div>
                  <Label className="text-foreground/90">Default currency</Label>
                  <Input value="INR (₹)" readOnly className="border-white/15 bg-card text-white/70" />
                </div>
              </div>
              <p className="mt-4 text-xs text-muted-foreground">Roles, permissions and team management live in the Users workspace.</p>
            </Card>
          )}

          {tab === "fees" && (
            <>
              <Card className="border-white/10 glass text-white">
                <div className="flex items-center gap-2"><Percent size={18} className="text-violet-300" /><h3 className="font-display text-lg font-semibold">Platform fee</h3></div>
                <Label className="mt-4 text-foreground/90">Platform fee (% of booking value, billed to Developer)</Label>
                <Input
                  type="number"
                  step="0.05"
                  min={0}
                  max={5}
                  value={feePercent}
                  onChange={(e) => setFeePercent(e.target.value === "" ? "" : Number(e.target.value))}
                  className="max-w-xs border-white/15 bg-card text-white"
                />
                <p className="mt-2 text-xs text-muted-foreground">Recommended range: 0.5–1%. This is never deducted from CP commissions.</p>
                <Button className="mt-4" disabled={loading} onClick={save}>{loading ? "Saving…" : "Save"}</Button>
              </Card>
              <RoadmapPanel
                title="Commission structure"
                desc="Configure default CP commission splits, slabs and payout timing."
                items={["Default commission %", "Tiered slabs by volume", "Developer-specific overrides", "Payout schedule"]}
              />
            </>
          )}

          {tab === "gst" && (
            <RoadmapPanel
              title="GST & Tax"
              desc="Tax configuration used across invoices, payments and the finance ledger."
              items={["GSTIN & legal entity", "Default GST rate", "TDS thresholds", "HSN / SAC codes", "Invoice numbering", "State-wise tax rules"]}
            />
          )}

          {tab === "notifications" && (
            <RoadmapPanel
              title="Notifications"
              desc="Choose which events reach your team and partners, and on which channels."
              items={["Email (SMTP / provider)", "SMS gateway", "WhatsApp Business API", "In-app notification rules", "Digest frequency", "Escalation routing"]}
            />
          )}

          {tab === "payments" && (
            <RoadmapPanel
              title="Payment gateway"
              desc="Manage the Razorpay integration that powers checkout and subscriptions."
              items={["Razorpay key & webhook", "Auto-capture settings", "Refund policy", "Settlement account", "Subscription plans", "Retry rules"]}
            />
          )}

          {tab === "ai" && (
            <RoadmapPanel
              title="AI Copilot"
              desc="Tune how the Truvi AI assistant answers, and what data it can reach."
              items={["Model & temperature", "Grounding data sources", "Allowed quick-actions", "Report templates", "Response language", "Rate limits"]}
            />
          )}

          {tab === "security" && (
            <RoadmapPanel
              title="Security & Access"
              desc="Protect the platform and keep an auditable trail of admin actions."
              items={["Two-factor authentication", "Session timeout", "API keys & scopes", "Audit logs", "IP allow-list", "Data backup & export"]}
            />
          )}
        </div>
      </div>
    </main>
  );
}

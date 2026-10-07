import { useEffect, useState, type ReactNode } from "react";
import {
  SlidersHorizontal, Percent, Landmark, Bell, CreditCard, Sparkles, ShieldCheck, Users, Check, BellRing, Send,
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

interface Settings {
  platformFeePercent: number;
  gstPercent: number;
  defaultCommissionPercent: number;
  notifications: { email: boolean; sms: boolean; whatsapp: boolean };
  integrations: { razorpay: boolean; email: boolean; sms: boolean; whatsapp?: boolean; ai: boolean };
  /** Owner's new-lead alert contact (admin-only). */
  leadAlert?: { enabled: boolean; phone: string; email: string };
}

function StatusBadge({ ok }: { ok: boolean }) {
  return ok ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-300"><Check size={11} /> Connected</span>
  ) : (
    <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-medium text-white/50">Not configured</span>
  );
}

function Toggle({ on, onClick, disabled }: { on: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`relative h-6 w-11 shrink-0 rounded-full transition ${on ? "bg-violet-600" : "bg-white/15"} disabled:opacity-50`}
      aria-pressed={on}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${on ? "left-[22px]" : "left-0.5"}`} />
    </button>
  );
}

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
    </Card>
  );
}

export default function AdminSettingsPage() {
  const [tab, setTab] = useState<TabKey>("fees");
  const [s, setS] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get("/admin/settings").then((res) => setS(res.data)).catch(() => toast.error("Failed to load settings"));
  }, []);

  async function save(patch: Record<string, unknown>) {
    setSaving(true);
    try {
      const res = await api.patch("/admin/settings", patch);
      setS(res.data);
      toast.success("Settings saved");
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  function setLocal(patch: Partial<Settings>) {
    setS((prev) => (prev ? { ...prev, ...patch } : prev));
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
          {!s ? (
            <Card className="border-white/10 glass text-white"><p className="text-sm text-muted-foreground">Loading settings…</p></Card>
          ) : (
            <>
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
                <Card className="border-white/10 glass text-white">
                  <div className="flex items-center gap-2"><Percent size={18} className="text-violet-300" /><h3 className="font-display text-lg font-semibold">Fees & Commission</h3></div>
                  <div className="mt-4 grid gap-5 sm:grid-cols-2">
                    <div>
                      <Label className="text-foreground/90">Platform fee (% of booking value)</Label>
                      <Input type="number" step="0.05" min={0} max={100} value={s.platformFeePercent}
                        onChange={(e) => setLocal({ platformFeePercent: Number(e.target.value) })}
                        className="border-white/15 bg-card text-white" />
                      <p className="mt-1 text-xs text-muted-foreground">Billed to the Developer. Never deducted from CP commissions.</p>
                    </div>
                    <div>
                      <Label className="text-foreground/90">Default commission (%)</Label>
                      <Input type="number" step="0.1" min={0} max={100} value={s.defaultCommissionPercent}
                        onChange={(e) => setLocal({ defaultCommissionPercent: Number(e.target.value) })}
                        className="border-white/15 bg-card text-white" />
                      <p className="mt-1 text-xs text-muted-foreground">Applied to new projects unless overridden.</p>
                    </div>
                  </div>
                  <Button className="mt-5" disabled={saving} onClick={() => save({ platformFeePercent: s.platformFeePercent, defaultCommissionPercent: s.defaultCommissionPercent })}>
                    {saving ? "Saving…" : "Save fees"}
                  </Button>
                </Card>
              )}

              {tab === "gst" && (
                <Card className="border-white/10 glass text-white">
                  <div className="flex items-center gap-2"><Landmark size={18} className="text-violet-300" /><h3 className="font-display text-lg font-semibold">GST & Tax</h3></div>
                  <Label className="mt-4 text-foreground/90">Default GST rate (%)</Label>
                  <Input type="number" step="1" min={0} max={100} value={s.gstPercent}
                    onChange={(e) => setLocal({ gstPercent: Number(e.target.value) })}
                    className="max-w-xs border-white/15 bg-card text-white" />
                  <p className="mt-1 text-xs text-muted-foreground">Used across invoices, payments and the finance ledger. India standard is 18%.</p>
                  <Button className="mt-5" disabled={saving} onClick={() => save({ gstPercent: s.gstPercent })}>{saving ? "Saving…" : "Save GST"}</Button>
                </Card>
              )}

              {tab === "notifications" && (
                <Card className="border-white/10 glass text-white">
                  <div className="flex items-center gap-2"><Bell size={18} className="text-violet-300" /><h3 className="font-display text-lg font-semibold">Notifications</h3></div>
                  <p className="mt-1 text-sm text-muted-foreground">Choose which channels deliver platform alerts.</p>
                  <div className="mt-4 divide-y divide-white/10">
                    {([
                      ["email", "Email", s.integrations.email],
                      ["sms", "SMS", s.integrations.sms],
                      ["whatsapp", "WhatsApp", s.integrations.whatsapp ?? s.integrations.sms],
                    ] as const).map(([key, label, wired]) => (
                      <div key={key} className="flex items-center justify-between py-3">
                        <div>
                          <p className="text-sm font-medium">{label}</p>
                          <StatusBadge ok={wired} />
                        </div>
                        <Toggle
                          on={s.notifications[key]}
                          disabled={saving}
                          onClick={() => save({ notifications: { ...s.notifications, [key]: !s.notifications[key] } })}
                        />
                      </div>
                    ))}
                  </div>
                </Card>
              )}

              {tab === "notifications" && s.leadAlert && (
                <LeadAlertCard
                  value={s.leadAlert}
                  integrations={s.integrations}
                  saving={saving}
                  onChange={(leadAlert) => setLocal({ leadAlert })}
                  onSave={() => save({ leadAlert: s.leadAlert })}
                />
              )}

              {tab === "payments" && (
                <>
                  <Card className="border-white/10 glass text-white">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2"><CreditCard size={18} className="text-violet-300" /><h3 className="font-display text-lg font-semibold">Razorpay</h3></div>
                      <StatusBadge ok={s.integrations.razorpay} />
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {s.integrations.razorpay
                        ? "Razorpay keys are configured on the server — checkout and subscriptions are live."
                        : "Set RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET on the server to enable checkout."}
                    </p>
                  </Card>
                  <RoadmapPanel title="Advanced payment controls" desc="Fine-grained gateway configuration." items={["Auto-capture settings", "Refund policy", "Settlement account", "Retry rules"]} />
                </>
              )}

              {tab === "ai" && (
                <Card className="border-white/10 glass text-white">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2"><Sparkles size={18} className="text-violet-300" /><h3 className="font-display text-lg font-semibold">AI Copilot</h3></div>
                    <StatusBadge ok={s.integrations.ai} />
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {s.integrations.ai
                      ? "The AI key is configured — Ask Truvi and AI reports are available."
                      : "Set ANTHROPIC_API_KEY on the server to enable Ask Truvi and AI reports."}
                  </p>
                </Card>
              )}

              {tab === "security" && (
                <RoadmapPanel
                  title="Security & Access"
                  desc="Protect the platform and keep an auditable trail of admin actions."
                  items={["Two-factor authentication", "Session timeout", "API keys & scopes", "Audit logs", "IP allow-list", "Data backup & export"]}
                />
              )}
            </>
          )}
        </div>
      </div>
    </main>
  );
}

/**
 * New-lead alert: every lead added from an inventory card sends "New Lead
 * Received" to this number (WhatsApp / SMS, whichever is connected on the
 * server) and email. The number is stored on the server and never shown to
 * any other role.
 */
function LeadAlertCard({
  value, integrations, saving, onChange, onSave,
}: {
  value: { enabled: boolean; phone: string; email: string };
  integrations: Settings["integrations"];
  saving: boolean;
  onChange: (v: { enabled: boolean; phone: string; email: string }) => void;
  onSave: () => void;
}) {
  const [testing, setTesting] = useState(false);
  async function sendTest() {
    setTesting(true);
    try {
      const res = await api.post("/admin/settings/lead-alert/test");
      const r = res.data as { configured: boolean; whatsapp: boolean; sms: boolean; email: boolean };
      const sent = [r.whatsapp && "WhatsApp", r.sms && "SMS", r.email && "Email"].filter(Boolean);
      if (!r.configured) toast.error("Add an alert number or email first, then save.");
      else if (sent.length) toast.success(`Test alert sent by ${sent.join(", ")}.`);
      else toast.error("Nothing was delivered — WhatsApp, SMS and email aren't connected on the server yet. Admins still get the in-app alert.");
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Couldn't send a test alert");
    } finally {
      setTesting(false);
    }
  }
  return (
    <Card className="border-white/10 glass text-white">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2"><BellRing size={18} className="text-violet-300" /><h3 className="font-display text-lg font-semibold">New lead alerts</h3></div>
        <Toggle on={value.enabled} disabled={saving} onClick={() => onChange({ ...value, enabled: !value.enabled })} />
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        When a Buyer, Channel Partner or Ambassador adds a lead from inventory, the owner gets “New Lead Received” with the
        customer, project, inventory, source and site-visit time. Admins always get it in the app too.
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <Label className="text-foreground/90">Owner / admin mobile (WhatsApp &amp; SMS)</Label>
          <Input
            inputMode="tel"
            placeholder="e.g. +91 98xxxxxxxx"
            value={value.phone}
            onChange={(e) => onChange({ ...value, phone: e.target.value })}
            className="border-white/15 bg-card text-white"
          />
          <div className="mt-1.5 flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
            WhatsApp <StatusBadge ok={!!integrations.whatsapp} /> SMS <StatusBadge ok={integrations.sms} />
          </div>
        </div>
        <div>
          <Label className="text-foreground/90">Alert email (optional)</Label>
          <Input
            type="email"
            placeholder="owner@yourcompany.com"
            value={value.email}
            onChange={(e) => onChange({ ...value, email: e.target.value })}
            className="border-white/15 bg-card text-white"
          />
          <div className="mt-1.5 flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">Email <StatusBadge ok={integrations.email} /></div>
        </div>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        This number is private: it stays on the server and is never shown to partners, buyers or ambassadors.
      </p>
      <div className="mt-5 flex flex-wrap gap-2">
        <Button disabled={saving} onClick={onSave}>{saving ? "Saving…" : "Save lead alerts"}</Button>
        <button
          type="button"
          onClick={sendTest}
          disabled={testing}
          className="inline-flex items-center gap-1.5 rounded-md border border-white/15 px-4 text-sm text-white/80 hover:bg-white/10 disabled:opacity-50"
        >
          <Send size={14} /> {testing ? "Sending…" : "Send test alert"}
        </button>
      </div>
    </Card>
  );
}

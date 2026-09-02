import { useEffect, useState } from "react";
import { Bell, Send, Megaphone, CheckCircle2, XCircle, Smartphone } from "lucide-react";
import { api } from "@/lib/api";
import { Card, Input, Label, Textarea } from "@/components/ui/primitives";
import { toast } from "sonner";

interface Diagnostics {
  pushEnabled: boolean;
  myDeviceTokens: number;
  totalDeviceTokens: number;
  myTokens: { platform: string; updatedAt: string; tokenPreview: string }[];
}

const TARGETS = ["ALL", "DEVELOPER", "CP", "BUYER", "AMBASSADOR", "ADMIN", "VERIFIER"] as const;

export default function AdminNotificationsPage() {
  const [diag, setDiag] = useState<Diagnostics | null>(null);
  const [sendingTest, setSendingTest] = useState(false);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [target, setTarget] = useState<(typeof TARGETS)[number]>("ALL");
  const [href, setHref] = useState("");
  const [broadcasting, setBroadcasting] = useState(false);

  function loadDiag() {
    api.get("/admin/notifications/diagnostics").then((r) => setDiag(r.data)).catch(() => {});
  }
  useEffect(() => { loadDiag(); }, []);

  async function sendTest() {
    setSendingTest(true);
    try {
      const r = await api.post("/admin/notifications/test", {});
      toast.success(r.data.pushEnabled ? "Test sent — check your bell and phone tray" : "Test sent to your bell (FCM push not configured yet)");
    } catch { toast.error("Failed to send test"); } finally { setSendingTest(false); }
  }

  async function broadcast(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !message.trim()) return toast.error("Title and message required");
    if (!confirm(`Send this announcement to ${target === "ALL" ? "ALL users" : target + "s"}?`)) return;
    setBroadcasting(true);
    try {
      const r = await api.post("/admin/notifications/broadcast", {
        title: title.trim(), message: message.trim(), target, href: href.trim() || undefined,
      });
      toast.success(`Sent to ${r.data.recipients} recipient(s)`);
      setTitle(""); setMessage(""); setHref("");
    } catch { toast.error("Failed to broadcast"); } finally { setBroadcasting(false); }
  }

  return (
    <div className="min-h-screen bg-[#05070d] text-white">
      <div className="mx-auto max-w-4xl px-4 pb-24 pt-6">
        <h1 className="flex items-center gap-2 text-2xl font-bold sm:text-3xl"><Bell /> Notifications</h1>
        <p className="mt-1 text-sm text-white/50">Verify push delivery and broadcast announcements. Every message reaches the in-app bell, a real-time pop-up, and the phone tray (when FCM push is configured).</p>

        {/* Diagnostics */}
        <Card className="mt-6 p-4">
          <h2 className="mb-3 text-sm font-semibold text-white/80">Push status</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <Diag ok={!!diag?.pushEnabled} label="FCM push" value={diag?.pushEnabled ? "Configured" : "Not configured"} />
            <Diag ok={(diag?.myDeviceTokens ?? 0) > 0} label="Your devices" value={`${diag?.myDeviceTokens ?? 0} registered`} icon={<Smartphone size={16} />} />
            <Diag ok={(diag?.totalDeviceTokens ?? 0) > 0} label="All devices" value={`${diag?.totalDeviceTokens ?? 0} registered`} />
          </div>
          {!diag?.pushEnabled && (
            <p className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              FCM push is not configured yet, so pop-ups only appear inside the app while it's open. To get phone-tray pop-ups when the app is closed, add <code>google-services.json</code> to the Android build and set <code>FCM_SERVICE_ACCOUNT_BASE64</code> on the server (see <code>client/PUSH_SETUP.md</code>).
            </p>
          )}
          <button onClick={sendTest} disabled={sendingTest} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-sky-500 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-400 disabled:opacity-60">
            <Send size={15} /> {sendingTest ? "Sending…" : "Send myself a test"}
          </button>
        </Card>

        {/* Broadcast */}
        <Card className="mt-6 p-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white/80"><Megaphone size={16} /> Broadcast announcement</h2>
          <form onSubmit={broadcast} className="space-y-3">
            <div><Label>Title</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. New feature is live!" /></div>
            <div><Label>Message</Label><Textarea rows={3} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="What do you want to tell your users?" /></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Send to</Label>
                <select value={target} onChange={(e) => setTarget(e.target.value as typeof target)} className="h-10 w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 text-sm outline-none">
                  {TARGETS.map((t) => <option key={t} value={t} className="bg-[#0a0d14]">{t === "ALL" ? "All users" : t}</option>)}
                </select>
              </div>
              <div><Label>Link (optional)</Label><Input value={href} onChange={(e) => setHref(e.target.value)} placeholder="/marketing" /></div>
            </div>
            <button disabled={broadcasting} className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-400 disabled:opacity-60">
              <Send size={15} /> {broadcasting ? "Sending…" : "Send announcement"}
            </button>
          </form>
        </Card>
      </div>
    </div>
  );
}

function Diag({ ok, label, value, icon }: { ok: boolean; label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
      <div className="flex items-center gap-2 text-xs text-white/50">{icon} {label}</div>
      <div className={`mt-1 flex items-center gap-1.5 text-sm font-semibold ${ok ? "text-emerald-300" : "text-amber-300"}`}>
        {ok ? <CheckCircle2 size={15} /> : <XCircle size={15} />} {value}
      </div>
    </div>
  );
}

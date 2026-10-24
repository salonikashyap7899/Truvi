import { useState } from "react";
import { Bell, Send, Megaphone } from "lucide-react";
import { api } from "@/lib/api";
import { Card, Input, Label, Textarea } from "@/components/ui/primitives";
import { toast } from "sonner";

const TARGETS = ["ALL", "DEVELOPER", "CP", "BUYER", "AMBASSADOR", "ADMIN", "VERIFIER"] as const;

export default function AdminNotificationsPage() {
  const [sendingTest, setSendingTest] = useState(false);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [target, setTarget] = useState<(typeof TARGETS)[number]>("ALL");
  const [href, setHref] = useState("");
  const [broadcasting, setBroadcasting] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [userTest, setUserTest] = useState<{ name: string | null; email: string | null } | null>(null);
  const [testingUser, setTestingUser] = useState(false);

  async function sendTest() {
    setSendingTest(true);
    try {
      await api.post("/admin/notifications/test", {});
      toast.success("Test notification sent to your in-app bell.");
    } catch { toast.error("Failed to send test"); } finally { setSendingTest(false); }
  }

  async function testUser(e: React.FormEvent) {
    e.preventDefault();
    if (!testEmail.trim()) return toast.error("Enter the user's email");
    setTestingUser(true);
    setUserTest(null);
    try {
      const r = await api.post("/admin/notifications/test", { email: testEmail.trim() });
      setUserTest({ name: r.data.targetName, email: r.data.targetEmail });
      toast.success(`In-app test notification sent to ${r.data.targetName || testEmail}.`);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast.error(msg || "Failed — check the email");
    } finally { setTestingUser(false); }
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
        <p className="mt-1 text-sm text-white/50">Test in-app notifications and broadcast announcements. Messages appear in the notification bell and are delivered in real time through the web session.</p>

        <Card className="mt-6 p-4">
          <h2 className="mb-2 text-sm font-semibold text-white/80">Web notification status</h2>
          <p className="text-xs leading-5 text-white/55">The notification bell and live Socket.io updates are enabled for authenticated web sessions.</p>
          <button onClick={sendTest} disabled={sendingTest} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-sky-500 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-400 disabled:opacity-60">
            <Send size={15} /> {sendingTest ? "Sending…" : "Send myself a test"}
          </button>
        </Card>

        <Card className="mt-6 p-4">
          <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-white/80"><Bell size={16} /> Test a specific user's in-app notification</h2>
          <p className="mb-3 text-xs text-white/50">Enter a user's email to send a test notification to their bell and real-time web session.</p>
          <form onSubmit={testUser} className="flex flex-wrap items-end gap-2">
            <div className="flex-1 min-w-[200px]"><Label>User email</Label><Input value={testEmail} onChange={(e) => setTestEmail(e.target.value)} placeholder="newuser@example.com" /></div>
            <button disabled={testingUser} className="inline-flex items-center gap-2 rounded-lg bg-sky-500 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-400 disabled:opacity-60">
              <Send size={15} /> {testingUser ? "Sending…" : "Send test push"}
            </button>
          </form>
          {userTest && (
            <div className="mt-3 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
              <div className="font-semibold">{userTest.name || userTest.email}</div>
              <div className="mt-0.5">A test notification was created for this account. It should appear in their notification bell and live web session.</div>
            </div>
          )}
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


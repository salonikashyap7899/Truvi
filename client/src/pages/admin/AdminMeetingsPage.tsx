import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CalendarClock, ExternalLink, Loader2, Video } from "lucide-react";
import { api } from "@/lib/api";
import { formatDate, formatTime, istToday, ROLE_LABEL, timeSlots } from "@/components/leads/inventoryLeadShared";

/**
 * Admin → Meetings. Google Meet requests from users ("Need help understanding
 * how to work on Truvi?") and the fixed onboarding session everyone new is
 * invited to. Truvi has no Google Calendar integration, so the admin creates
 * the Meet (one tap opens meet.google.com/new), pastes the link and confirms —
 * the user is notified and sees the date, time and a Join button.
 */

interface Meeting {
  _id: string;
  topic: "ONBOARDING" | "HELP";
  date: string;
  time: string;
  note: string | null;
  meetLink: string | null;
  status: "REQUESTED" | "CONFIRMED" | "COMPLETED" | "CANCELLED";
  adminNote: string | null;
  user: { _id: string; name: string; email: string; phone: string | null; role: string };
}
interface Session { date: string; time: string; link: string; note?: string }

const TABS = ["REQUESTED", "CONFIRMED", "COMPLETED", "CANCELLED", ""] as const;
const TAB_LABEL: Record<string, string> = { REQUESTED: "Requests", CONFIRMED: "Confirmed", COMPLETED: "Completed", CANCELLED: "Cancelled", "": "All" };
const SLOTS = timeSlots("09:00", "19:00");
const field =
  "w-full rounded-xl border border-white/12 bg-white/[0.04] px-3 py-2 text-sm text-white placeholder:text-white/35 outline-none focus:border-sky-500 [&>option]:bg-[#0a0d14] [color-scheme:dark]";
const NEW_MEET = "https://meet.google.com/new";

export default function AdminMeetingsPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]>("REQUESTED");
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [session, setSession] = useState<Session>({ date: "", time: "11:00", link: "", note: "" });
  const [hasSession, setHasSession] = useState(false);
  const [loading, setLoading] = useState(true);
  const [savingSession, setSavingSession] = useState(false);

  function load() {
    api
      .get("/meetings/admin", { params: tab ? { status: tab } : {} })
      .then((r) => {
        setMeetings(r.data.meetings ?? []);
        if (r.data.onboardingSession) { setSession(r.data.onboardingSession); setHasSession(true); }
      })
      .catch((err) => toast.error(err?.response?.data?.error || "Couldn't load meetings"))
      .finally(() => setLoading(false));
  }
  useEffect(load, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  async function saveSession(clear = false) {
    setSavingSession(true);
    try {
      const r = await api.put("/meetings/admin/onboarding-session", { session: clear ? null : { ...session, note: session.note?.trim() || undefined } });
      setHasSession(!!r.data.onboardingSession);
      if (clear) setSession({ date: "", time: "11:00", link: "", note: "" });
      toast.success(clear ? "Onboarding session removed" : "Onboarding session saved");
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Couldn't save the session");
    } finally {
      setSavingSession(false);
    }
  }

  return (
    <main className="min-h-screen p-4 text-white sm:p-6 md:p-10">
      <h1 className="flex items-center gap-2 text-2xl font-semibold"><Video size={22} className="text-sky-400" /> Meetings</h1>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
        Google Meet requests from users and the fixed onboarding session. Create the Meet, paste its link and confirm — the user is notified instantly.
      </p>

      {/* Fixed onboarding session */}
      <section className="mt-5 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 font-semibold"><CalendarClock size={16} className="text-amber-300" /> Fixed onboarding session</p>
          {hasSession && <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-200">Shown to new users</span>}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">New Channel Partners, Ambassadors and Developers see this date with a Join button until their onboarding is marked done.</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_2fr]">
          <input type="date" aria-label="Session date" className={field} min={istToday()} value={session.date} onChange={(e) => setSession({ ...session, date: e.target.value })} />
          <select aria-label="Session time" className={field} value={session.time} onChange={(e) => setSession({ ...session, time: e.target.value })}>
            {SLOTS.map((t) => <option key={t} value={t}>{formatTime(t)}</option>)}
          </select>
          <div className="flex gap-2">
            <input aria-label="Meet link" className={field} placeholder="https://meet.google.com/…" value={session.link} onChange={(e) => setSession({ ...session, link: e.target.value })} />
            <a href={NEW_MEET} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-white/15 px-3 text-xs hover:bg-white/10" title="Create a new Google Meet, then paste its link">
              Create a Meet <ExternalLink size={12} />
            </a>
          </div>
        </div>
        <input aria-label="Session note" className={`${field} mt-2`} placeholder="Note (optional) — e.g. Every new partner please join" value={session.note ?? ""} onChange={(e) => setSession({ ...session, note: e.target.value })} maxLength={300} />
        <div className="mt-3 flex gap-2">
          <button onClick={() => saveSession(false)} disabled={savingSession || !session.date || !session.link} className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold hover:bg-sky-500 disabled:opacity-40">Save session</button>
          {hasSession && <button onClick={() => saveSession(true)} disabled={savingSession} className="rounded-xl border border-white/15 px-4 py-2 text-sm hover:bg-white/10">Remove</button>}
        </div>
      </section>

      {/* Requests */}
      <div className="mt-6 flex gap-1.5 overflow-x-auto">
        {TABS.map((t) => (
          <button key={t || "all"} onClick={() => { setLoading(true); setTab(t); }} className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium ${tab === t ? "border-sky-500/60 bg-sky-500/15 text-white" : "border-white/12 text-white/60 hover:bg-white/5"}`}>
            {TAB_LABEL[t]}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="mt-6 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 size={15} className="animate-spin" /> Loading…</p>
      ) : meetings.length === 0 ? (
        <p className="mt-8 text-center text-sm text-muted-foreground">Nothing here.</p>
      ) : (
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {meetings.map((m) => <MeetingCard key={m._id} m={m} onChanged={load} />)}
        </div>
      )}
    </main>
  );
}

function MeetingCard({ m, onChanged }: { m: Meeting; onChanged: () => void }) {
  const [date, setDate] = useState(m.date);
  const [time, setTime] = useState(m.time);
  const [link, setLink] = useState(m.meetLink ?? "");
  const [adminNote, setAdminNote] = useState(m.adminNote ?? "");
  const [busy, setBusy] = useState(false);
  const open = m.status === "REQUESTED" || m.status === "CONFIRMED";

  async function update(status?: Meeting["status"]) {
    setBusy(true);
    try {
      await api.patch(`/meetings/admin/${m._id}`, {
        ...(open ? { date, time, meetLink: link.trim() || null } : {}),
        adminNote: adminNote.trim() || null,
        ...(status ? { status } : {}),
      });
      toast.success(status === "CONFIRMED" ? "Confirmed — the user has been notified" : status ? `Marked ${status.toLowerCase()}` : "Saved");
      onChanged();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Couldn't update the meeting");
    } finally {
      setBusy(false);
    }
  }

  const tone = { REQUESTED: "text-amber-200 border-amber-400/30 bg-amber-500/10", CONFIRMED: "text-emerald-200 border-emerald-400/30 bg-emerald-500/10", COMPLETED: "text-sky-200 border-sky-400/30 bg-sky-500/10", CANCELLED: "text-rose-200 border-rose-400/30 bg-rose-500/10" }[m.status];

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-semibold">{m.user.name} <span className="text-xs font-normal text-muted-foreground">· {ROLE_LABEL[m.user.role] ?? m.user.role}</span></p>
          <p className="truncate text-xs text-muted-foreground">{[m.user.email, m.user.phone].filter(Boolean).join(" · ")}</p>
        </div>
        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] ${tone}`}>{m.status.charAt(0) + m.status.slice(1).toLowerCase()}</span>
      </div>
      <p className="mt-2 text-sm">
        {m.topic === "ONBOARDING" ? "Onboarding" : "Help with Truvi"} · <b>{formatDate(m.date, { weekday: "short", day: "numeric", month: "short" })}, {formatTime(m.time)}</b>
      </p>
      {m.note && <p className="mt-1 text-xs text-white/70">“{m.note}”</p>}

      {open ? (
        <div className="mt-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <input type="date" aria-label="Date" className={field} value={date} min={istToday()} onChange={(e) => setDate(e.target.value)} />
            <select aria-label="Time" className={field} value={time} onChange={(e) => setTime(e.target.value)}>
              {SLOTS.map((t) => <option key={t} value={t}>{formatTime(t)}</option>)}
            </select>
          </div>
          <div className="flex gap-2">
            <input aria-label="Google Meet link" className={field} placeholder="Paste Google Meet link" value={link} onChange={(e) => setLink(e.target.value)} />
            <a href={NEW_MEET} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-white/15 px-3 text-xs hover:bg-white/10">Create <ExternalLink size={12} /></a>
          </div>
          <input aria-label="Note to user" className={field} placeholder="Note to the user (optional)" value={adminNote} onChange={(e) => setAdminNote(e.target.value)} maxLength={500} />
          <div className="flex flex-wrap gap-2">
            <button onClick={() => update("CONFIRMED")} disabled={busy || !link.trim()} className="rounded-xl bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold hover:bg-emerald-500 disabled:opacity-40">
              {m.status === "CONFIRMED" ? "Save & notify" : "Confirm"}
            </button>
            <button onClick={() => update("COMPLETED")} disabled={busy} className="rounded-xl border border-white/15 px-3.5 py-1.5 text-xs hover:bg-white/10">Mark completed</button>
            <button onClick={() => update("CANCELLED")} disabled={busy} className="ml-auto rounded-xl border border-rose-500/30 px-3.5 py-1.5 text-xs text-rose-200 hover:bg-rose-500/10">Cancel</button>
          </div>
        </div>
      ) : (
        m.meetLink && <a href={m.meetLink} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs text-sky-300 hover:underline">{m.meetLink} <ExternalLink size={11} /></a>
      )}
    </div>
  );
}

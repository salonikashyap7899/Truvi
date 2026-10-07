import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CalendarDays, CheckCircle2, Clock, ExternalLink, Loader2, Video } from "lucide-react";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { formatDate, formatTime, istNowTime, istToday, timeSlots } from "@/components/leads/inventoryLeadShared";

/**
 * Schedule a Google Meet with the Truvi team. Select a date → select a time →
 * confirm. The team adds the Google Meet link and confirms; the meeting then
 * shows here with its date, time, link and a Join button. The fixed
 * onboarding session (set by the admin) is shown at the top until the user's
 * onboarding is done.
 */

interface Meeting {
  _id: string;
  topic: "ONBOARDING" | "HELP";
  date: string;
  time: string;
  note: string | null;
  meetLink: string | null;
  status: "REQUESTED" | "CONFIRMED" | "COMPLETED" | "CANCELLED";
}
interface Session { date: string; time: string; link: string; note?: string }

const SLOTS = timeSlots("09:00", "19:00");
const STATUS_TEXT: Record<Meeting["status"], { label: string; tone: string }> = {
  REQUESTED: { label: "Waiting for the team to confirm", tone: "text-amber-200 border-amber-400/30 bg-amber-500/10" },
  CONFIRMED: { label: "Confirmed", tone: "text-emerald-200 border-emerald-400/30 bg-emerald-500/10" },
  COMPLETED: { label: "Completed", tone: "text-sky-200 border-sky-400/30 bg-sky-500/10" },
  CANCELLED: { label: "Cancelled", tone: "text-rose-200 border-rose-400/30 bg-rose-500/10" },
};

export default function MeetPage() {
  const setUser = useAuthStore((s) => s.setUser);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [session, setSession] = useState<Session | null>(null);
  const [onboardingDone, setOnboardingDone] = useState(true);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [topic, setTopic] = useState<"HELP" | "ONBOARDING">("HELP");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function load() {
    api
      .get("/meetings/mine")
      .then((r) => {
        setMeetings(r.data.meetings ?? []);
        setSession(r.data.onboardingSession ?? null);
        setOnboardingDone(!!r.data.onboardingCompleted);
      })
      .catch(() => toast.error("Couldn't load your meetings"))
      .finally(() => setLoading(false));
  }
  useEffect(() => { document.title = "TRUVI — Schedule a Google Meet"; load(); }, []);

  // Next 14 days as quick date chips.
  const days = useMemo(() => Array.from({ length: 14 }, (_, i) => istToday(i)), []);
  const slots = date === istToday() ? SLOTS.filter((t) => t > istNowTime()) : SLOTS;

  async function request() {
    if (!date || !time) return;
    setSubmitting(true);
    try {
      await api.post("/meetings", { topic, date, time, note: note.trim() || undefined });
      toast.success("Request sent — the team will confirm with a Google Meet link.");
      setDate(""); setTime(""); setNote("");
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Couldn't send your request");
    } finally {
      setSubmitting(false);
    }
  }

  async function cancel(id: string) {
    try {
      await api.post(`/meetings/${id}/cancel`);
      toast.success("Meeting cancelled");
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Couldn't cancel");
    }
  }

  async function markOnboardingDone() {
    try {
      const r = await api.post("/meetings/onboarding/complete");
      setOnboardingDone(true);
      const cur = useAuthStore.getState().user;
      if (cur) setUser({ ...cur, onboardingCompletedAt: r.data.onboardingCompletedAt });
      toast.success("Onboarding marked as done");
    } catch {
      toast.error("Couldn't update — please try again");
    }
  }

  const step = !date ? 1 : !time ? 2 : 3;

  return (
    <main className="min-h-screen px-4 pb-24 pt-4 text-white sm:px-6">
      <div className="mx-auto max-w-2xl">
        <div className="flex items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-sky-500/15 text-sky-300 ring-1 ring-sky-400/25"><Video size={20} /></span>
          <div>
            <h1 className="font-display text-xl font-semibold sm:text-2xl">Schedule a Google Meet</h1>
            <p className="mt-1 text-sm text-muted-foreground">Need help understanding how to work on Truvi? Schedule a Google Meet with our team.</p>
          </div>
        </div>

        {/* Fixed onboarding session */}
        {session && !onboardingDone && (
          <div className="mt-5 rounded-2xl border border-amber-400/25 bg-amber-500/[0.07] p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-300">Onboarding session</p>
            <p className="mt-1 text-sm font-semibold">{formatDate(session.date, { weekday: "long", day: "numeric", month: "long" })} · {formatTime(session.time)}</p>
            {session.note && <p className="mt-0.5 text-xs text-white/70">{session.note}</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              <a href={session.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-xl bg-amber-400 px-4 py-2 text-sm font-semibold text-black hover:brightness-105">
                <Video size={14} /> Join
              </a>
              <button onClick={markOnboardingDone} className="rounded-xl border border-white/15 px-4 py-2 text-sm hover:bg-white/10">I’ve completed onboarding</button>
            </div>
          </div>
        )}

        {/* Request */}
        <div className="mt-5 rounded-2xl border border-white/10 glass p-4 sm:p-5">
          <p className="flex items-center gap-1.5 text-sm font-semibold"><span className="grid size-5 place-items-center rounded-full bg-white/10 text-[11px]">1</span> <CalendarDays size={14} /> Select a date</p>
          <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
            {days.map((d) => (
              <button
                key={d}
                onClick={() => { setDate(d); setTime(""); }}
                className={`flex w-14 shrink-0 flex-col items-center rounded-xl border py-1.5 text-xs transition ${date === d ? "border-sky-500/70 bg-sky-500/20" : "border-white/12 hover:bg-white/[0.06]"}`}
              >
                <span className="text-[10px] uppercase text-white/55">{formatDate(d, { weekday: "short" })}</span>
                <span className="text-base font-semibold">{formatDate(d, { day: "numeric" })}</span>
                <span className="text-[10px] text-white/55">{formatDate(d, { month: "short" })}</span>
              </button>
            ))}
          </div>

          {step >= 2 && (
            <>
              <p className="mt-4 flex items-center gap-1.5 text-sm font-semibold"><span className="grid size-5 place-items-center rounded-full bg-white/10 text-[11px]">2</span> <Clock size={14} /> Select a time</p>
              {slots.length === 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">No more slots today — pick another date.</p>
              ) : (
                <div className="mt-2 grid grid-cols-3 gap-1.5 sm:grid-cols-5">
                  {slots.map((t) => (
                    <button key={t} onClick={() => setTime(t)} className={`rounded-lg border py-1.5 text-xs transition ${time === t ? "border-sky-500/70 bg-sky-500/20" : "border-white/12 hover:bg-white/[0.06]"}`}>
                      {formatTime(t)}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {step === 3 && (
            <>
              <p className="mt-4 flex items-center gap-1.5 text-sm font-semibold"><span className="grid size-5 place-items-center rounded-full bg-white/10 text-[11px]">3</span> Confirm</p>
              <div className="mt-2 flex gap-1.5">
                {(["HELP", "ONBOARDING"] as const).map((t) => (
                  <button key={t} onClick={() => setTopic(t)} className={`rounded-full border px-3 py-1 text-xs ${topic === t ? "border-sky-500/60 bg-sky-500/15" : "border-white/12 text-white/65"}`}>
                    {t === "HELP" ? "Help using Truvi" : "Onboarding"}
                  </button>
                ))}
              </div>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={500}
                placeholder="What would you like help with? (optional)"
                className="mt-2 min-h-[64px] w-full rounded-xl border border-white/12 bg-white/[0.04] px-3 py-2 text-sm outline-none placeholder:text-white/35 focus:border-sky-500"
              />
              <button onClick={request} disabled={submitting} className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[var(--trust)] to-[#2563eb] py-2.5 text-sm font-semibold disabled:opacity-50">
                {submitting && <Loader2 size={14} className="animate-spin" />}
                Request Google Meet · {formatDate(date, { day: "numeric", month: "short" })}, {formatTime(time)}
              </button>
              <p className="mt-1.5 text-center text-[11px] text-muted-foreground">Our team adds the Google Meet link and confirms — you’ll get a notification.</p>
            </>
          )}
        </div>

        {/* My meetings */}
        <h2 className="mt-7 text-sm font-semibold text-white/80">Your meetings</h2>
        {loading ? (
          <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 size={14} className="animate-spin" /> Loading…</p>
        ) : meetings.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No meetings yet.</p>
        ) : (
          <div className="mt-3 space-y-2.5">
            {meetings.map((m) => {
              const st = STATUS_TEXT[m.status];
              const upcoming = m.status === "REQUESTED" || m.status === "CONFIRMED";
              return (
                <div key={m._id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold">{formatDate(m.date, { weekday: "short", day: "numeric", month: "short", year: "numeric" })} · {formatTime(m.time)}</p>
                      <p className="text-xs text-muted-foreground">{m.topic === "ONBOARDING" ? "Onboarding" : "Help using Truvi"}</p>
                    </div>
                    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] ${st.tone}`}>{st.label}</span>
                  </div>
                  {m.status === "CONFIRMED" && m.meetLink && (
                    <div className="mt-2.5 flex flex-wrap items-center gap-2">
                      <a href={m.meetLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-4 py-1.5 text-sm font-semibold text-black hover:brightness-105">
                        <Video size={14} /> Join
                      </a>
                      <span className="flex min-w-0 items-center gap-1 truncate text-[11px] text-white/55"><ExternalLink size={11} /> {m.meetLink}</span>
                    </div>
                  )}
                  {upcoming && (
                    <button onClick={() => cancel(m._id)} className="mt-2 text-[11px] text-white/50 hover:text-rose-200">Cancel meeting</button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {onboardingDone && (
          <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-emerald-300/80"><CheckCircle2 size={13} /> Your onboarding is complete.</p>
        )}
      </div>
    </main>
  );
}

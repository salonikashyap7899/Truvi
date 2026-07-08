import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import {
  ShieldCheck, Upload, Phone, Mail, CheckCircle2, MapPin, Clock, Loader2,
  FileCheck, Banknote, ExternalLink, LogOut, Navigation, IndianRupee, ArrowLeft,
} from "lucide-react";

/**
 * Truvi Ambassador portal — the Ambassador SOP end-to-end.
 *
 *  1. Verification gate: Aadhaar upload + phone OTP + email OTP. No task
 *     listings appear until the profile is Active.
 *  2. Task board: GREEN available / YELLOW locked-to-you (6h) / RED done.
 *  3. Accept → checklist (GPS + internet + live location) → document
 *     upload → complete → ₹500 earned.
 *
 * All state comes from /api/ambassador/*.
 */

type View = "verify" | "tasks" | "task" | "earnings";

interface Me {
  name: string; email: string; phone: string | null;
  aadhaarUploaded: boolean; phoneVerified: boolean; emailVerified: boolean;
  active: boolean; tasksCompleted: number; totalEarnings: number;
}

interface Task {
  _id: string; title: string; address: string; mapUrl?: string; deadline?: string;
  status: "GREEN" | "YELLOW" | "RED";
  lockExpiresAt?: string;
  checklist: { gpsOn: boolean; internetOn: boolean; liveLocation?: { lat: number; lng: number } | null };
  documents: { url: string; fileName: string }[];
  projectId?: { name: string; city: string } | null;
}

const STATUS_META: Record<string, { label: string; cls: string; dot: string }> = {
  GREEN: { label: "Available", cls: "text-emerald-300 border-emerald-400/30 bg-emerald-500/10", dot: "bg-emerald-400" },
  YELLOW: { label: "In progress", cls: "text-amber-300 border-amber-400/30 bg-amber-500/10", dot: "bg-amber-400" },
  RED: { label: "Completed", cls: "text-red-300 border-red-400/30 bg-red-500/10", dot: "bg-red-400" },
};

function countdown(iso?: string): string {
  if (!iso) return "";
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "expired";
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return `${h}h ${m}m left`;
}

export default function AmbassadorPortalPage() {
  const { user, logout } = useAuth();
  const [me, setMe] = useState<Me | null>(null);
  const [view, setView] = useState<View>("verify");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [active, setActive] = useState<Task | null>(null);

  async function loadMe() {
    const res = await api.get("/ambassador/me");
    setMe(res.data);
    if (res.data.active) setView((v) => (v === "verify" ? "tasks" : v));
    return res.data as Me;
  }
  async function loadTasks() {
    const res = await api.get("/ambassador/tasks");
    setTasks(res.data.tasks);
  }

  useEffect(() => {
    document.title = "TRUVI — Ambassador";
    loadMe().then((m) => { if (m.active) loadTasks(); }).catch(() => {});
  }, []);

  if (!me) {
    return (
      <main className="grid min-h-screen place-items-center text-white">
        <Loader2 className="animate-spin text-[var(--trust)]" />
      </main>
    );
  }

  return (
    <main className="min-h-screen px-5 pb-24 pt-24 text-white md:px-8">
      <div className="mx-auto max-w-3xl">
        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center overflow-hidden rounded-xl bg-white p-1">
              <img src="/brand/icon.png" alt="Truvi" className="h-full w-full object-contain" />
            </span>
            <div>
              <h1 className="font-display text-xl font-semibold">Truvi Ambassador</h1>
              <p className="text-xs text-muted-foreground">Hi {user?.name?.split(" ")[0] ?? me.name}, verify projects & earn ₹500 each.</p>
            </div>
          </div>
          <button onClick={() => logout()} className="flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-2 text-xs text-white/70 hover:text-white">
            <LogOut size={13} /> Sign out
          </button>
        </div>

        {/* Active-profile tabs */}
        {me.active && (
          <div className="mt-6 flex gap-2">
            {(["tasks", "earnings"] as const).map((t) => (
              <button
                key={t}
                onClick={() => { setView(t); setActive(null); if (t === "tasks") loadTasks(); }}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                  view === t || (t === "tasks" && view === "task")
                    ? "bg-[var(--trust)] text-white"
                    : "border border-white/12 text-muted-foreground hover:text-white"
                }`}
              >
                {t === "tasks" ? "Available Tasks" : "My Earnings"}
              </button>
            ))}
          </div>
        )}

        <div className="mt-6">
          {view === "verify" && <VerifyFlow me={me} onChange={loadMe} onTasks={() => { loadTasks(); setView("tasks"); }} />}
          {view === "tasks" && me.active && (
            <TaskBoard tasks={tasks} onOpen={(t) => { setActive(t); setView("task"); }} onReload={loadTasks} />
          )}
          {view === "task" && active && (
            <TaskDetail
              task={tasks.find((t) => t._id === active._id) ?? active}
              onBack={() => { setView("tasks"); loadTasks(); }}
              onChange={async () => { await loadTasks(); await loadMe(); }}
            />
          )}
          {view === "earnings" && <Earnings />}
        </div>
      </div>
    </main>
  );
}

/* ── Step 0: verification ─────────────────────────────────────────────────── */
function VerifyFlow({ me, onChange, onTasks }: { me: Me; onChange: () => Promise<Me>; onTasks: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [phoneOtpSent, setPhoneOtpSent] = useState(false);
  const [emailOtpSent, setEmailOtpSent] = useState(false);
  const [phoneCode, setPhoneCode] = useState("");
  const [emailCode, setEmailCode] = useState("");

  async function uploadAadhaar(file: File) {
    setBusy("aadhaar");
    try {
      const form = new FormData();
      form.append("file", file);
      await api.post("/ambassador/verify/aadhaar", form, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success("Aadhaar uploaded");
      await onChange();
    } catch (e: any) { toast.error(e?.response?.data?.error || "Upload failed"); }
    finally { setBusy(null); }
  }

  async function sendOtp(kind: "phone" | "email") {
    setBusy(`${kind}-send`);
    try {
      const res = await api.post(`/ambassador/verify/${kind}/send`);
      if (kind === "phone") setPhoneOtpSent(true); else setEmailOtpSent(true);
      if (res.data.devOtp) toast.info(`Dev mode — your ${kind} code is ${res.data.devOtp}`, { duration: 8000 });
      else toast.success(`Code sent to your ${kind}`);
    } catch (e: any) { toast.error(e?.response?.data?.error || "Could not send code"); }
    finally { setBusy(null); }
  }

  async function confirmOtp(kind: "phone" | "email", otp: string) {
    setBusy(`${kind}-confirm`);
    try {
      await api.post(`/ambassador/verify/${kind}/confirm`, { otp });
      toast.success(`${kind === "phone" ? "Phone" : "Email"} verified`);
      const updated = await onChange();
      if (updated.active) { toast.success("Profile Active! You can now see tasks."); onTasks(); }
    } catch (e: any) { toast.error(e?.response?.data?.error || "Verification failed"); }
    finally { setBusy(null); }
  }

  const Step = ({ done, n, title, children }: { done: boolean; n: number; title: string; children: React.ReactNode }) => (
    <div className={`rounded-2xl border p-5 ${done ? "border-emerald-400/30 bg-emerald-500/[0.05]" : "border-white/10 glass"}`}>
      <div className="flex items-center gap-3">
        <span className={`grid size-8 shrink-0 place-items-center rounded-full text-sm font-bold ${done ? "bg-emerald-500 text-white" : "bg-white/10 text-white/70"}`}>
          {done ? <CheckCircle2 size={16} /> : n}
        </span>
        <p className="font-medium text-white">{title}</p>
        {done && <span className="ml-auto text-xs font-medium text-emerald-300">Verified</span>}
      </div>
      {!done && <div className="mt-4 pl-11">{children}</div>}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-[var(--trust)]/25 bg-[var(--trust)]/[0.06] p-5">
        <p className="flex items-center gap-2 text-sm font-semibold text-sky-200">
          <ShieldCheck size={16} /> Complete all three steps to activate your Ambassador profile
        </p>
        <p className="mt-1 text-xs text-muted-foreground">Task listings stay hidden until your Aadhaar, phone and email are all verified.</p>
      </div>

      <Step done={me.aadhaarUploaded} n={1} title="Upload your Aadhaar card">
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-white/20 px-4 py-2.5 text-sm text-muted-foreground hover:border-[var(--trust)]/50 hover:text-sky-300">
          {busy === "aadhaar" ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
          Choose Aadhaar (PDF/JPG/PNG)
          <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" className="sr-only"
            onChange={(e) => e.target.files?.[0] && uploadAadhaar(e.target.files[0])} />
        </label>
      </Step>

      <Step done={me.phoneVerified} n={2} title={`Verify your phone${me.phone ? ` (${me.phone})` : ""}`}>
        {!phoneOtpSent ? (
          <button onClick={() => sendOtp("phone")} disabled={busy === "phone-send"}
            className="inline-flex items-center gap-2 rounded-lg bg-[var(--trust)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--trust)]/85">
            {busy === "phone-send" ? <Loader2 size={14} className="animate-spin" /> : <Phone size={14} />} Send OTP
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <input value={phoneCode} onChange={(e) => setPhoneCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="6-digit code" className="h-10 w-32 rounded-lg border border-white/15 bg-white/5 px-3 text-center tracking-[0.3em] text-white outline-none focus:border-[var(--trust)]" />
            <button onClick={() => confirmOtp("phone", phoneCode)} disabled={phoneCode.length !== 6 || busy === "phone-confirm"}
              className="rounded-lg bg-[var(--trust)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
              {busy === "phone-confirm" ? <Loader2 size={14} className="animate-spin" /> : "Verify"}
            </button>
            <button onClick={() => sendOtp("phone")} className="text-xs text-muted-foreground hover:text-white">Resend</button>
          </div>
        )}
      </Step>

      <Step done={me.emailVerified} n={3} title={`Verify your email (${me.email})`}>
        {!emailOtpSent ? (
          <button onClick={() => sendOtp("email")} disabled={busy === "email-send"}
            className="inline-flex items-center gap-2 rounded-lg bg-[var(--trust)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--trust)]/85">
            {busy === "email-send" ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />} Send OTP
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <input value={emailCode} onChange={(e) => setEmailCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="6-digit code" className="h-10 w-32 rounded-lg border border-white/15 bg-white/5 px-3 text-center tracking-[0.3em] text-white outline-none focus:border-[var(--trust)]" />
            <button onClick={() => confirmOtp("email", emailCode)} disabled={emailCode.length !== 6 || busy === "email-confirm"}
              className="rounded-lg bg-[var(--trust)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
              {busy === "email-confirm" ? <Loader2 size={14} className="animate-spin" /> : "Verify"}
            </button>
            <button onClick={() => sendOtp("email")} className="text-xs text-muted-foreground hover:text-white">Resend</button>
          </div>
        )}
      </Step>
    </div>
  );
}

/* ── Step 1: task board ───────────────────────────────────────────────────── */
function TaskBoard({ tasks, onOpen, onReload }: { tasks: Task[]; onOpen: (t: Task) => void; onReload: () => void }) {
  const [accepting, setAccepting] = useState<string | null>(null);

  async function accept(t: Task, e: React.MouseEvent) {
    e.stopPropagation();
    setAccepting(t._id);
    try {
      await api.post(`/ambassador/tasks/${t._id}/accept`);
      toast.success("Task locked to you for 6 hours");
      onReload();
      onOpen(t);
    } catch (err: any) { toast.error(err?.response?.data?.error || "Could not accept"); onReload(); }
    finally { setAccepting(null); }
  }

  if (tasks.length === 0) {
    return <div className="rounded-2xl border border-white/10 glass p-10 text-center text-sm text-muted-foreground">No verification tasks available right now. Check back soon.</div>;
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {tasks.map((t) => {
        const m = STATUS_META[t.status];
        return (
          <div key={t._id} onClick={() => t.status !== "GREEN" && onOpen(t)}
            className={`rounded-2xl border p-4 transition-colors ${t.status === "GREEN" ? "border-white/10 glass" : "cursor-pointer border-white/10 glass hover:border-white/25"}`}>
            <div className="flex items-start justify-between gap-2">
              <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${m.cls}`}>
                <span className={`size-1.5 rounded-full ${m.dot}`} /> {m.label}
              </span>
              {t.status === "YELLOW" && <span className="flex items-center gap-1 text-[11px] text-amber-300"><Clock size={11} />{countdown(t.lockExpiresAt)}</span>}
            </div>
            <h3 className="mt-2.5 font-semibold text-white">{t.title}</h3>
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground"><MapPin size={12} />{t.address}</p>
            <div className="mt-3 flex items-center justify-between">
              <span className="flex items-center gap-1 text-sm font-semibold text-emerald-300"><IndianRupee size={13} />500</span>
              {t.status === "GREEN" ? (
                <button onClick={(e) => accept(t, e)} disabled={accepting === t._id}
                  className="rounded-full bg-[var(--trust)] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[var(--trust)]/85 disabled:opacity-50">
                  {accepting === t._id ? <Loader2 size={12} className="animate-spin" /> : "Accept task"}
                </button>
              ) : (
                <span className="text-xs text-sky-300">Open →</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── Steps 3–4: task detail (checklist + upload + complete) ───────────────── */
function TaskDetail({ task, onBack, onChange }: { task: Task; onBack: () => void; onChange: () => Promise<void> }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const done = task.status === "RED";
  const checklistDone = task.checklist.gpsOn && task.checklist.internetOn && !!task.checklist.liveLocation;

  async function captureLocation() {
    setBusy("gps");
    if (!navigator.geolocation) { toast.error("Geolocation not supported on this device"); setBusy(null); return; }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          await api.post(`/ambassador/tasks/${task._id}/checklist`, {
            gpsOn: true, internetOn: navigator.onLine, lat: pos.coords.latitude, lng: pos.coords.longitude,
          });
          toast.success("Live location captured");
          await onChange();
        } catch (e: any) { toast.error(e?.response?.data?.error || "Checklist failed"); }
        finally { setBusy(null); }
      },
      () => { toast.error("Turn on GPS and allow location access"); setBusy(null); },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  async function uploadDoc(file: File) {
    setBusy("doc");
    try {
      const form = new FormData();
      form.append("file", file);
      await api.post(`/ambassador/tasks/${task._id}/documents`, form, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success("Document uploaded");
      await onChange();
    } catch (e: any) { toast.error(e?.response?.data?.error || "Upload failed"); }
    finally { setBusy(null); }
  }

  async function complete() {
    setBusy("complete");
    try {
      const res = await api.post(`/ambassador/tasks/${task._id}/complete`);
      toast.success(`Task completed — ₹${res.data.earned} earned!`);
      await onChange();
      onBack();
    } catch (e: any) { toast.error(e?.response?.data?.error || "Cannot complete yet"); }
    finally { setBusy(null); }
  }

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-white"><ArrowLeft size={14} /> Back to tasks</button>

      <div className="rounded-2xl border border-white/10 glass p-5">
        <h2 className="font-display text-lg font-semibold">{task.title}</h2>
        <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground"><MapPin size={13} />{task.address}</p>
        {task.mapUrl && (
          <a href={task.mapUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1.5 text-sm text-sky-300 hover:underline">
            Open in Google Maps <ExternalLink size={12} />
          </a>
        )}
        {task.status === "YELLOW" && <p className="mt-2 flex items-center gap-1 text-xs text-amber-300"><Clock size={12} />{countdown(task.lockExpiresAt)}</p>}
      </div>

      {/* Step 3 — checklist */}
      <div className="rounded-2xl border border-white/10 glass p-5">
        <p className="flex items-center gap-2 font-medium text-white"><Navigation size={16} className="text-[var(--trust)]" /> Site visit checklist</p>
        <div className="mt-3 space-y-2 text-sm">
          {[["GPS ON", task.checklist.gpsOn], ["Internet ON", task.checklist.internetOn], ["Live location captured", !!task.checklist.liveLocation]].map(([label, ok]) => (
            <div key={label as string} className="flex items-center gap-2">
              <CheckCircle2 size={15} className={ok ? "text-emerald-400" : "text-white/25"} />
              <span className={ok ? "text-foreground/90" : "text-muted-foreground"}>{label as string}</span>
            </div>
          ))}
        </div>
        {!done && !checklistDone && (
          <button onClick={captureLocation} disabled={busy === "gps"}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[var(--trust)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--trust)]/85 disabled:opacity-50">
            {busy === "gps" ? <Loader2 size={14} className="animate-spin" /> : <Navigation size={14} />} Capture GPS + live location
          </button>
        )}
      </div>

      {/* Step 4 — documents */}
      <div className="rounded-2xl border border-white/10 glass p-5">
        <p className="flex items-center gap-2 font-medium text-white"><FileCheck size={16} className="text-[var(--trust)]" /> Project documents ({task.documents.length})</p>
        {task.documents.length > 0 && (
          <div className="mt-2 space-y-1">
            {task.documents.map((d, i) => (
              <a key={i} href={d.url} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-xs text-sky-300 hover:underline">
                <FileCheck size={12} /> {d.fileName}
              </a>
            ))}
          </div>
        )}
        {!done && (
          <label className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-white/20 px-4 py-2.5 text-sm text-muted-foreground hover:border-[var(--trust)]/50 hover:text-sky-300">
            {busy === "doc" ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />} Upload site photo / proof
            <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" className="sr-only"
              onChange={(e) => e.target.files?.[0] && uploadDoc(e.target.files[0])} />
          </label>
        )}
      </div>

      {/* Complete */}
      {done ? (
        <div className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-5 text-center">
          <Banknote size={22} className="mx-auto text-emerald-300" />
          <p className="mt-2 font-semibold text-emerald-200">Completed — ₹500 earned</p>
          <p className="mt-0.5 text-xs text-emerald-300/70">Payout is settled by the Truvi team.</p>
        </div>
      ) : (
        <button onClick={complete} disabled={!checklistDone || task.documents.length === 0 || busy === "complete"}
          className="flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-emerald-500 to-emerald-600 py-3 text-sm font-semibold text-white transition hover:shadow-[0_0_30px_rgba(16,185,129,0.35)] disabled:cursor-not-allowed disabled:opacity-40">
          {busy === "complete" ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={16} />} Complete task & earn ₹500
        </button>
      )}
      {!done && (!checklistDone || task.documents.length === 0) && (
        <p className="text-center text-xs text-muted-foreground">Finish the checklist and upload at least one document to complete.</p>
      )}
    </div>
  );
}

/* ── Earnings ─────────────────────────────────────────────────────────────── */
function Earnings() {
  const [data, setData] = useState<{ total: number; paid: number; pending: number; tasks: any[] } | null>(null);
  useEffect(() => { api.get("/ambassador/earnings").then((r) => setData(r.data)).catch(() => {}); }, []);
  if (!data) return <Loader2 className="mx-auto mt-8 animate-spin text-[var(--trust)]" />;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        {[["Total earned", data.total], ["Paid", data.paid], ["Pending", data.pending]].map(([label, val]) => (
          <div key={label as string} className="rounded-2xl border border-white/10 glass p-4 text-center">
            <p className="font-display text-2xl font-semibold text-white">₹{(val as number).toLocaleString("en-IN")}</p>
            <p className="mt-0.5 text-[11px] uppercase tracking-wide text-muted-foreground">{label as string}</p>
          </div>
        ))}
      </div>
      <div className="space-y-2">
        {data.tasks.map((t) => (
          <div key={t._id} className="flex items-center justify-between rounded-xl border border-white/10 glass px-4 py-3">
            <div>
              <p className="text-sm font-medium text-white">{t.title}</p>
              <p className="text-xs text-muted-foreground">{new Date(t.completedAt).toLocaleDateString("en-IN")}</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold text-emerald-300">₹{t.payoutAmount}</p>
              <p className={`text-[11px] ${t.payoutStatus === "PAID" ? "text-emerald-400" : "text-amber-300"}`}>{t.payoutStatus}</p>
            </div>
          </div>
        ))}
        {data.tasks.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No completed tasks yet.</p>}
      </div>
    </div>
  );
}

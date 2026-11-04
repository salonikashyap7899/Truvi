import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { ShieldCheck, FileText, LifeBuoy, LockKeyhole, MessageSquareText, RefreshCw, Send, CheckCircle2, Clock3 } from "lucide-react";

type ConsentEvent = { policyType: string; policyVersion: string; action: string; source: string; occurredAt: string };
type PolicyDocument = { type: "TERMS_OF_SERVICE" | "PRIVACY_NOTICE" | "MARKETING"; version: string; title: string; href: string | null; required: boolean; description: string };
type PrivacyRequest = { _id: string; requestType: string; details: string; status: string; publicResponse?: string | null; requestedAt: string; updatedAt: string; completedAt?: string | null };
type Grievance = { _id: string; caseNumber: string; category: string; subject: string; description: string; status: string; publicResponse?: string | null; requestedAt: string; updatedAt: string; resolvedAt?: string | null };
type PrivacyData = {
  role: string;
  policies: PolicyDocument[];
  currentVersions: Record<string, string>;
  consents: ConsentEvent[];
  consentState: Record<string, { policyVersion: string; action: string; occurredAt: string }>;
  privacyRequests: PrivacyRequest[];
  grievances: Grievance[];
  accountDeletion?: { status: string; otpExpiresAt?: string | null; requestedAt?: string | null } | null;
};

const panel = "rounded-2xl border border-white/10 bg-[#0d1420]/85 shadow-[0_18px_60px_rgba(0,0,0,0.18)]";
const field = "w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-sky-400/50";
const button = "inline-flex items-center justify-center gap-2 rounded-xl bg-sky-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-50";

function readable(value: string) {
  return value.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
function dateLabel(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}
function errorMessage(error: any) {
  return error?.response?.data?.error || "Something went wrong. Please try again.";
}

export default function PrivacyCenterPage() {
  const [data, setData] = useState<PrivacyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingPolicy, setSavingPolicy] = useState<string | null>(null);
  const [requestType, setRequestType] = useState("ACCESS");
  const [requestDetails, setRequestDetails] = useState("");
  const [grievanceCategory, setGrievanceCategory] = useState("OTHER");
  const [grievanceSubject, setGrievanceSubject] = useState("");
  const [grievanceDescription, setGrievanceDescription] = useState("");
  const [submittingPrivacy, setSubmittingPrivacy] = useState(false);
  const [submittingGrievance, setSubmittingGrievance] = useState(false);
  const [deletionOtp, setDeletionOtp] = useState("");
  const [deletionEmail, setDeletionEmail] = useState("");
  const [deletionOtpSent, setDeletionOtpSent] = useState(false);
  const [hideDeletionOtp, setHideDeletionOtp] = useState(false);
  const [requestingDeletion, setRequestingDeletion] = useState(false);
  const [confirmingDeletion, setConfirmingDeletion] = useState(false);
  const navigate = useNavigate();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get("/compliance/me");
      setData(response.data as PrivacyData);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const consentState = data?.consentState ?? {};
  const requiredPolicies = useMemo(() => (data?.policies ?? []).filter((p) => p.required), [data?.policies]);
  const marketingGranted = consentState.MARKETING?.action === "GRANTED" &&
    consentState.MARKETING?.policyVersion === data?.currentVersions?.MARKETING;
  const serverOtpPending = data?.accountDeletion?.status === "OTP_SENT" &&
    Boolean(data.accountDeletion.otpExpiresAt) &&
    new Date(data.accountDeletion.otpExpiresAt!).getTime() > Date.now();
  const showDeletionOtp = !hideDeletionOtp && (deletionOtpSent || serverOtpPending) &&
    (!data?.accountDeletion?.otpExpiresAt || new Date(data.accountDeletion.otpExpiresAt).getTime() > Date.now());

  async function recordPolicy(policy: PolicyDocument, action: "ACKNOWLEDGED" | "GRANTED" | "WITHDRAWN") {
    setSavingPolicy(policy.type);
    try {
      await api.post("/compliance/consents", { policyType: policy.type, policyVersion: policy.version, action });
      toast.success(policy.type === "MARKETING" ? (action === "GRANTED" ? "Promotional updates enabled." : "Promotional updates disabled.") : policy.title + " acknowledgement saved.");
      await load();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSavingPolicy(null);
    }
  }

  async function submitPrivacyRequest(event: React.FormEvent) {
    event.preventDefault();
    setSubmittingPrivacy(true);
    try {
      await api.post("/compliance/privacy-requests", { requestType, details: requestDetails });
      setRequestDetails("");
      toast.success("Your privacy request has been submitted.");
      await load();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSubmittingPrivacy(false);
    }
  }

  async function submitGrievance(event: React.FormEvent) {
    event.preventDefault();
    setSubmittingGrievance(true);
    try {
      const response = await api.post("/compliance/grievances", {
        category: grievanceCategory,
        subject: grievanceSubject,
        description: grievanceDescription,
      });
      setGrievanceSubject("");
      setGrievanceDescription("");
      toast.success("Grievance submitted. Case number: " + response.data.ticket.caseNumber);
      await load();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSubmittingGrievance(false);
    }
  }
  async function requestAccountDeletion() {
    setRequestingDeletion(true);
    try {
      const response = await api.post("/compliance/account-deletion/request", {});
      setDeletionEmail(response.data.email ?? "");
      setDeletionOtp("");
      setDeletionOtpSent(true);
      setHideDeletionOtp(false);
      toast.success("A confirmation code has been sent to your verified email.");
      await load();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setRequestingDeletion(false);
    }
  }

  async function confirmAccountDeletion(event: React.FormEvent) {
    event.preventDefault();
    setConfirmingDeletion(true);
    try {
      const response = await api.post("/compliance/account-deletion/confirm", { otp: deletionOtp });
      toast.success(response.data?.message ?? "Your account has been deactivated.");
      useAuthStore.getState().clearAuth();
      navigate("/", { replace: true });
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setConfirmingDeletion(false);
    }
  }


  return (
    <main className="min-h-screen px-4 pb-20 pt-28 text-white sm:px-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-sky-300">
              <ShieldCheck size={15} /> Account governance
            </div>
            <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">Privacy & Support Centre</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/55">
              Review your policy acknowledgements, manage optional promotional updates, request help with your personal information, and track support cases.
            </p>
          </div>
          <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs text-white/70 hover:bg-white/5 disabled:opacity-50">
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
        </div>

        {loading && !data ? (
          <div className={panel + " p-8 text-sm text-white/50"}>Loading your privacy settings…</div>
        ) : !data ? (
          <div className={panel + " p-8 text-sm text-white/60"}>Privacy Centre could not load. Please refresh or contact support.</div>
        ) : (
          <>
            <section className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
              <div className={panel + " p-5 sm:p-6"}>
                <div className="mb-5 flex items-center gap-3">
                  <span className="grid size-10 place-items-center rounded-xl bg-sky-400/10 text-sky-300"><FileText size={19} /></span>
                  <div>
                    <h2 className="text-base font-semibold">Policies & acknowledgements</h2>
                    <p className="text-xs text-white/45">Your records are tied to the exact document version.</p>
                  </div>
                </div>
                <div className="space-y-3">
                  {requiredPolicies.map((policy) => {
                    const state = consentState[policy.type];
                    const accepted = state?.policyVersion === policy.version && state?.action === "ACKNOWLEDGED";
                    return (
                      <div key={policy.type} className="flex flex-col justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.025] p-4 sm:flex-row sm:items-center">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold">{policy.title}</span>
                            {accepted ? (
                              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-0.5 text-[10px] text-emerald-300"><CheckCircle2 size={11} /> Acknowledged</span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/20 bg-amber-400/10 px-2 py-0.5 text-[10px] text-amber-200"><Clock3 size={11} /> Review required</span>
                            )}
                          </div>
                          <p className="mt-1 text-xs leading-relaxed text-white/45">{policy.description}</p>
                          <p className="mt-1 text-[10px] text-white/30">Version {policy.version}{accepted ? " · Saved " + dateLabel(state.occurredAt) : ""}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          {policy.href && <Link to={policy.href} target="_blank" className="rounded-lg border border-white/10 px-3 py-2 text-xs text-sky-300 hover:bg-white/5">Read policy</Link>}
                          {!accepted && <button type="button" onClick={() => void recordPolicy(policy, "ACKNOWLEDGED")} disabled={savingPolicy === policy.type} className={button + " px-3 py-2 text-xs"}>{savingPolicy === policy.type ? "Saving…" : "Acknowledge"}</button>}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p className="mt-4 text-[11px] leading-relaxed text-white/35">
                  An acknowledgement records that you saw the named document version. It is separate from OTP verification and does not replace any specific permission required by law.
                </p>
              </div>

              <div className={panel + " p-5 sm:p-6"}>
                <div className="mb-4 flex items-center gap-3">
                  <span className="grid size-10 place-items-center rounded-xl bg-violet-400/10 text-violet-300"><MessageSquareText size={19} /></span>
                  <div>
                    <h2 className="text-base font-semibold">Promotional updates</h2>
                    <p className="text-xs text-white/45">Optional and independent from essential service messages.</p>
                  </div>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[0.025] p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold">{marketingGranted ? "Promotional updates enabled" : "Promotional updates disabled"}</p>
                      <p className="mt-1 text-xs text-white/45">{marketingGranted ? "You have opted in to optional promotional communication." : "You are not opted in to optional promotional communication."}</p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={marketingGranted}
                      disabled={savingPolicy === "MARKETING"}
                      onClick={() => {
                        const policy = data.policies.find((item) => item.type === "MARKETING");
                        if (policy) void recordPolicy(policy, marketingGranted ? "WITHDRAWN" : "GRANTED");
                      }}
                      className={`relative h-7 w-12 shrink-0 rounded-full border transition ${marketingGranted ? "border-sky-400 bg-sky-500" : "border-white/20 bg-white/10"} `}
                    >
                      <span className={`absolute top-0.5 size-5 rounded-full bg-white transition-all ${marketingGranted ? "left-6" : "left-0.5"}`} />
                    </button>
                  </div>
                  <p className="mt-4 text-[11px] leading-relaxed text-white/35">Changing this preference does not disable account, transaction, security, or other necessary service notifications.</p>
                </div>
                <div className="mt-4 rounded-xl border border-white/10 p-4">
                  <p className="text-xs font-semibold text-white/80">Account role</p>
                  <p className="mt-1 text-sm text-white/55">{readable(data.role)}</p>
                  <p className="mt-3 text-[11px] leading-relaxed text-white/35">Privacy requests and grievances submitted here are linked to your signed-in Truvi account, regardless of role.</p>
                </div>
              </div>
            </section>

            <section className="mt-4 grid gap-4 lg:grid-cols-2">
              <form onSubmit={submitPrivacyRequest} className={panel + " space-y-4 p-5 sm:p-6"}>
                <div className="flex items-center gap-3">
                  <span className="grid size-10 place-items-center rounded-xl bg-cyan-400/10 text-cyan-300"><LockKeyhole size={19} /></span>
                  <div>
                    <h2 className="text-base font-semibold">Personal data request</h2>
                    <p className="text-xs text-white/45">Ask our team to review a request about your information.</p>
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-white/70">Request type</label>
                  <select value={requestType} onChange={(e) => setRequestType(e.target.value)} className={field}>
                    <option value="ACCESS">Access / copy of my information</option>
                    <option value="CORRECTION">Correction of information</option>
                    <option value="ERASURE">Erasure / deletion review</option>
                    <option value="WITHDRAW_CONSENT">Withdraw a permission / consent</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-white/70">Details</label>
                  <textarea required minLength={10} maxLength={3000} rows={4} value={requestDetails} onChange={(e) => setRequestDetails(e.target.value)} className={field + " resize-y"} placeholder="Tell us what information or action you are requesting. Please do not include passwords, OTPs, or full identity-document numbers." />
                  <p className="mt-1 text-right text-[10px] text-white/30">{requestDetails.length}/3000</p>
                </div>
                <button disabled={submittingPrivacy} className={button}><Send size={14} /> {submittingPrivacy ? "Submitting…" : "Submit privacy request"}</button>
              </form>

              <form onSubmit={submitGrievance} className={panel + " space-y-4 p-5 sm:p-6"}>
                <div className="flex items-center gap-3">
                  <span className="grid size-10 place-items-center rounded-xl bg-amber-400/10 text-amber-300"><LifeBuoy size={19} /></span>
                  <div>
                    <h2 className="text-base font-semibold">Submit a grievance</h2>
                    <p className="text-xs text-white/45">Create a support case and track its reference number.</p>
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-white/70">Category</label>
                  <select value={grievanceCategory} onChange={(e) => setGrievanceCategory(e.target.value)} className={field}>
                    <option value="PRIVACY">Privacy / personal information</option>
                    <option value="ACCOUNT">Account / access</option>
                    <option value="PAYMENT">Payment / subscription</option>
                    <option value="PROJECT_LISTING">Project / listing</option>
                    <option value="KYC">KYC / verification</option>
                    <option value="TECHNICAL">Technical issue</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-white/70">Subject</label>
                  <input required minLength={5} maxLength={160} value={grievanceSubject} onChange={(e) => setGrievanceSubject(e.target.value)} className={field} placeholder="A short description of the issue" />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-white/70">What happened?</label>
                  <textarea required minLength={15} maxLength={5000} rows={3} value={grievanceDescription} onChange={(e) => setGrievanceDescription(e.target.value)} className={field + " resize-y"} placeholder="Describe the issue and the outcome you are seeking. Do not share passwords or OTPs." />
                </div>
                <button disabled={submittingGrievance} className={button}><Send size={14} /> {submittingGrievance ? "Submitting…" : "Submit grievance"}</button>
              </form>
            </section>

            <section className="mt-4 grid gap-4 lg:grid-cols-2">
              <div className={panel + " p-5 sm:p-6"}>
                <h2 className="text-base font-semibold">Privacy request history</h2>
                <p className="mb-4 mt-1 text-xs text-white/45">Only you and authorised compliance administrators can view your requests.</p>
                {data.privacyRequests.length ? (
                  <div className="space-y-3">
                    {data.privacyRequests.map((request) => (
                      <article key={request._id} className="rounded-xl border border-white/10 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-sm font-semibold">{readable(request.requestType)}</span>
                          <span className="rounded-full border border-white/10 px-2 py-1 text-[10px] text-sky-200">{readable(request.status)}</span>
                        </div>
                        <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-white/55">{request.details}</p>
                        <p className="mt-2 text-[10px] text-white/30">Submitted {dateLabel(request.requestedAt)} · Updated {dateLabel(request.updatedAt)}</p>
                        {request.publicResponse && <p className="mt-3 rounded-lg bg-sky-400/5 p-3 text-xs leading-relaxed text-sky-100/80">Truvi response: {request.publicResponse}</p>}
                      </article>
                    ))}
                  </div>
                ) : <p className="rounded-xl border border-dashed border-white/10 p-4 text-xs text-white/35">No privacy requests submitted yet.</p>}
              </div>

              <div className={panel + " p-5 sm:p-6"}>
                <h2 className="text-base font-semibold">Grievance history</h2>
                <p className="mb-4 mt-1 text-xs text-white/45">Track the case status and any response from Truvi.</p>
                {data.grievances.length ? (
                  <div className="space-y-3">
                    {data.grievances.map((ticket) => (
                      <article key={ticket._id} className="rounded-xl border border-white/10 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-sky-300">{ticket.caseNumber}</p>
                            <p className="mt-1 text-sm font-semibold">{ticket.subject}</p>
                          </div>
                          <span className="rounded-full border border-white/10 px-2 py-1 text-[10px] text-sky-200">{readable(ticket.status)}</span>
                        </div>
                        <p className="mt-2 text-xs leading-relaxed text-white/50">{ticket.description}</p>
                        <p className="mt-2 text-[10px] text-white/30">{readable(ticket.category)} · Submitted {dateLabel(ticket.requestedAt)}</p>
                        {ticket.publicResponse && <p className="mt-3 rounded-lg bg-sky-400/5 p-3 text-xs leading-relaxed text-sky-100/80">Truvi response: {ticket.publicResponse}</p>}
                      </article>
                    ))}
                  </div>
                ) : <p className="rounded-xl border border-dashed border-white/10 p-4 text-xs text-white/35">No grievances submitted yet.</p>}
              </div>
            </section>
            <section className={panel + " mt-4 p-5 sm:p-6"}>
              <div className="flex items-start gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-red-400/10 text-red-300"><LockKeyhole size={19} /></span>
                <div className="min-w-0 flex-1">
                  <h2 className="text-base font-semibold text-red-100">Delete your Truvi account</h2>
                  <p className="mt-1 text-xs leading-relaxed text-white/50">
                    We will send a one-time code to your verified email. After you confirm it, sign-in and existing sessions are disabled immediately.
                  </p>
                  <p className="mt-2 text-xs leading-relaxed text-white/45">
                    You can restore your account using a single-use email link for 30 days. After that, the request moves to a review for deletion or anonymisation. Some transaction, payment, commission, KYC, tax, security and dispute records may need to be retained where lawfully required.
                  </p>
                  {data.accountDeletion?.status === "ERASURE_REVIEW" && (
                    <p className="mt-3 rounded-lg border border-amber-400/20 bg-amber-400/5 p-3 text-xs text-amber-100/80">
                      Your recovery period has ended. Your account remains deactivated and is in Truvi's erasure/retention review queue.
                    </p>
                  )}
                  {showDeletionOtp ? (
                    <form onSubmit={confirmAccountDeletion} className="mt-4 space-y-3">
                      <p className="text-xs text-white/65">
                        Enter the six-digit code sent to {deletionEmail || "your verified email address"}.
                        {data.accountDeletion?.otpExpiresAt ? " Code expires " + dateLabel(data.accountDeletion.otpExpiresAt) + "." : " The code expires in 10 minutes."}
                      </p>
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <input
                          inputMode="numeric"
                          autoComplete="one-time-code"
                          pattern="[0-9]{6}"
                          maxLength={6}
                          required
                          value={deletionOtp}
                          onChange={(e) => setDeletionOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                          className={field + " sm:max-w-[220px]"}
                          placeholder="6-digit email code"
                        />
                        <button type="submit" disabled={confirmingDeletion || deletionOtp.length !== 6} className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-400 disabled:cursor-not-allowed disabled:opacity-50">
                          {confirmingDeletion ? "Deactivating…" : "Confirm & deactivate"}
                        </button>
                      </div>
                      <button type="button" onClick={() => { setDeletionOtpSent(false); setDeletionOtp(""); setHideDeletionOtp(true); }} className="text-xs text-white/45 underline underline-offset-2 hover:text-white/70">
                        Cancel this confirmation
                      </button>
                    </form>
                  ) : (
                    <div className="mt-4">
                      <button
                        type="button"
                        onClick={() => void requestAccountDeletion()}
                        disabled={requestingDeletion || data.accountDeletion?.status === "DEACTIVATED"}
                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-2.5 text-sm font-semibold text-red-200 transition hover:bg-red-500/15 disabled:opacity-50"
                      >
                        {requestingDeletion ? "Sending code…" : "Request account deletion"}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </section>

            <p className="mt-6 text-center text-[11px] leading-relaxed text-white/30">
              Submitting an erasure request starts a review; it does not automatically delete records. Certain records may need to be retained where required by law, to complete a transaction, or to establish, exercise, or defend legal claims.
            </p>
          </>
        )}
      </div>
    </main>
  );
}

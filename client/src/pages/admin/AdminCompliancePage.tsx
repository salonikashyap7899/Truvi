import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { ShieldCheck, RefreshCw, MessageSquareText, UserRound, Clock3 } from "lucide-react";

type Grievance = {
  _id: string; caseNumber: string; category: string; subject: string; description: string; status: string;
  publicResponse?: string | null; internalNotes?: string | null; requestedAt: string; updatedAt: string;
  requesterName: string; requesterEmail: string; requesterRole: string; requesterPhone?: string | null;
  acknowledgedAt?: string | null; acknowledgementDueAt?: string | null; responseDueAt?: string | null;
};
type PrivacyRequest = {
  _id: string; requestType: string; details: string; status: string; publicResponse?: string | null;
  internalNotes?: string | null; requestedAt: string; updatedAt: string;
  requesterName: string; requesterEmail: string; requesterRole: string;
};
type AccountDeletion = {
  _id: string; status: string; requestedAt: string; deactivatedAt?: string | null; restoreExpiresAt?: string | null;
  requesterName: string; requesterEmail: string; requesterRole: string;
};
type QueueData = { grievances: Grievance[]; privacyRequests: PrivacyRequest[]; accountDeletions: AccountDeletion[] };
type Draft = { status: string; publicResponse: string; internalNote: string };

const panel = "admin-compliance-panel rounded-2xl border border-white/10 bg-[#0d1420]/85";
const field = "w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white outline-none focus:border-sky-400/50";
const grievanceStatuses = ["SUBMITTED", "ACKNOWLEDGED", "IN_PROGRESS", "WAITING_FOR_USER", "RESOLVED", "CLOSED"];
const privacyStatuses = ["SUBMITTED", "UNDER_REVIEW", "WAITING_FOR_USER", "APPROVED", "REJECTED", "COMPLETED"];
const pretty = (s: string) => s.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const dateLabel = (s: string) => new Date(s).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
const errorMessage = (error: any) => error?.response?.data?.error || "Could not update the compliance queue.";

export default function AdminCompliancePage() {
  const [data, setData] = useState<QueueData>({ grievances: [], privacyRequests: [], accountDeletions: [] });
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"GRIEVANCES" | "PRIVACY" | "ACCOUNT_DELETIONS">("GRIEVANCES");
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get("/compliance/admin/queue");
      setData({ grievances: response.data.grievances ?? [], privacyRequests: response.data.privacyRequests ?? [], accountDeletions: response.data.accountDeletions ?? [] });
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  function getDraft(id: string, status: string, publicResponse?: string | null): Draft {
    return drafts[id] ?? { status, publicResponse: publicResponse ?? "", internalNote: "" };
  }
  function patchDraft(id: string, patch: Partial<Draft>, status: string, response?: string | null) {
    setDrafts((current) => ({ ...current, [id]: { ...getDraft(id, status, response), ...patch } }));
  }

  async function save(kind: "GRIEVANCE" | "PRIVACY", id: string, currentStatus: string, publicResponse?: string | null) {
    const draft = getDraft(id, currentStatus, publicResponse);
    setSaving(id);
    try {
      const endpoint = kind === "GRIEVANCE" ? `/compliance/admin/grievances/${id}` : `/compliance/admin/privacy-requests/${id}`;
      await api.patch(endpoint, {
        status: draft.status,
        publicResponse: draft.publicResponse.trim() || undefined,
        internalNote: draft.internalNote.trim() || undefined,
      });
      setDrafts((current) => { const next = { ...current }; delete next[id]; return next; });
      toast.success("Compliance case updated.");
      await load();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(null);
    }
  }

  const totalOpenGrievances = data.grievances.filter((item) => !["RESOLVED", "CLOSED"].includes(item.status)).length;
  const totalOpenPrivacy = data.privacyRequests.filter((item) => !["REJECTED", "COMPLETED"].includes(item.status)).length;
  const empty = tab === "GRIEVANCES" ? data.grievances.length === 0 : tab === "PRIVACY" ? data.privacyRequests.length === 0 : data.accountDeletions.length === 0;

  return (
    <div className="admin-compliance-page space-y-5 text-white">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-sky-300"><ShieldCheck size={14} /> Governance & support</div>
          <h1 className="font-display text-2xl font-semibold sm:text-3xl">Compliance Centre</h1>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-white/45">Review public and account-linked grievances, privacy requests and account deactivations. Public complaints are acknowledged by email with a case number and complaint copy. Internal notes are restricted to authorised administrators.</p>
        </div>
        <button onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs text-white/70 hover:bg-white/5 disabled:opacity-50"><RefreshCw size={13} className={loading ? "animate-spin" : ""}/> Refresh queue</button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className={panel + " p-4"}><p className="text-xs text-white/45">Grievances received</p><p className="mt-2 text-2xl font-semibold tabular-nums">{data.grievances.length}</p><p className="mt-1 text-[11px] text-white/35">{totalOpenGrievances} open</p></div>
        <div className={panel + " p-4"}><p className="text-xs text-white/45">Privacy requests</p><p className="mt-2 text-2xl font-semibold tabular-nums">{data.privacyRequests.length}</p><p className="mt-1 text-[11px] text-white/35">{totalOpenPrivacy} open</p></div>
        <div className={panel + " p-4"}><p className="text-xs text-white/45">Account deactivations</p><p className="mt-2 text-2xl font-semibold tabular-nums">{data.accountDeletions.length}</p><p className="mt-1 text-[11px] text-white/35">Recovery or erasure review</p></div>
        <div className={panel + " p-4"}><p className="text-xs text-white/45">Roles covered</p><p className="mt-2 text-2xl font-semibold">All 7</p><p className="mt-1 text-[11px] text-white/35">Admin · Verifier · Employee · Buyer · CP · Developer · Ambassador</p></div>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-white/[0.025] p-1.5">
        <button onClick={() => setTab("GRIEVANCES")} className={`rounded-lg px-4 py-2 text-xs font-semibold transition ${tab === "GRIEVANCES" ? "bg-sky-500 text-white" : "text-white/55 hover:bg-white/5"}`}>Grievances ({data.grievances.length})</button>
        <button onClick={() => setTab("PRIVACY")} className={`rounded-lg px-4 py-2 text-xs font-semibold transition ${tab === "PRIVACY" ? "bg-sky-500 text-white" : "text-white/55 hover:bg-white/5"}`}>Privacy requests ({data.privacyRequests.length})</button>
        <button onClick={() => setTab("ACCOUNT_DELETIONS")} className={`rounded-lg px-4 py-2 text-xs font-semibold transition ${tab === "ACCOUNT_DELETIONS" ? "bg-sky-500 text-white" : "text-white/55 hover:bg-white/5"}`}>Account deactivations ({data.accountDeletions.length})</button>
      </div>

      {loading ? <div className={panel + " p-8 text-sm text-white/45"}>Loading compliance queue…</div> : empty ? (
        <div className={panel + " p-10 text-center text-sm text-white/40"}>No {tab === "GRIEVANCES" ? "grievances" : tab === "PRIVACY" ? "privacy requests" : "account deactivations"} are in this queue.</div>
      ) : tab === "GRIEVANCES" ? (
        <div className="space-y-3">
          {data.grievances.map((item) => {
            const draft = getDraft(item._id, item.status, item.publicResponse);
            return (
              <article key={item._id} className={panel + " p-4 sm:p-5"}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-md bg-sky-400/10 px-2 py-1 text-[10px] font-bold tracking-wider text-sky-200">{item.caseNumber}</span>
                      <span className="text-[10px] text-white/35">{pretty(item.category)}</span>
                    </div>
                    <h2 className="mt-2 text-base font-semibold">{item.subject}</h2>
                    <p className="mt-2 max-w-3xl whitespace-pre-wrap text-xs leading-relaxed text-white/55">{item.description}</p>
                  </div>
                  <span className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] text-amber-200">{pretty(item.status)}</span>
                </div>
                <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 border-t border-white/10 pt-3 text-[11px] text-white/40">
                  <span className="inline-flex items-center gap-1.5"><UserRound size={12}/>{item.requesterName} · {pretty(item.requesterRole)}</span>
                  <span>{item.requesterEmail}</span>
                  {item.requesterPhone && <span>{item.requesterPhone}</span>}
                  <span className="inline-flex items-center gap-1.5"><Clock3 size={12}/>{dateLabel(item.requestedAt)}</span>
                  {item.acknowledgedAt && <span>Acknowledged {dateLabel(item.acknowledgedAt)}</span>}
                  {!item.acknowledgedAt && item.acknowledgementDueAt && <span className={new Date(item.acknowledgementDueAt).getTime() < Date.now() ? "font-semibold text-rose-300" : "text-amber-200"}>48-hour acknowledgement due {dateLabel(item.acknowledgementDueAt)}{new Date(item.acknowledgementDueAt).getTime() < Date.now() ? " · overdue" : ""}</span>}
                  {item.responseDueAt && <span className={new Date(item.responseDueAt).getTime() < Date.now() && !["RESOLVED", "CLOSED"].includes(item.status) ? "font-semibold text-rose-300" : ""}>Internal 15-day response target {dateLabel(item.responseDueAt)}{new Date(item.responseDueAt).getTime() < Date.now() && !["RESOLVED", "CLOSED"].includes(item.status) ? " · overdue" : ""}</span>}
                </div>
                <div className="mt-4 grid gap-3 lg:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-[11px] text-white/55">Case status</label>
                    <select className={field} value={draft.status} onChange={(e) => patchDraft(item._id, { status: e.target.value }, item.status, item.publicResponse)}>
                      {grievanceStatuses.map((status) => <option key={status} value={status}>{pretty(status)}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-[11px] text-white/55">Customer-visible response</label>
                    <input className={field} value={draft.publicResponse} onChange={(e) => patchDraft(item._id, { publicResponse: e.target.value }, item.status, item.publicResponse)} placeholder="Update sent to the user…" />
                  </div>
                </div>
                <div className="mt-3">
                  <label className="mb-1.5 block text-[11px] text-white/55">Internal note (not visible to the user)</label>
                  <textarea rows={2} className={field + " resize-y"} value={draft.internalNote} onChange={(e) => patchDraft(item._id, { internalNote: e.target.value }, item.status, item.publicResponse)} placeholder="Add an internal handling note…" />
                  {item.internalNotes && <div className="mt-2 rounded-lg border border-white/10 bg-black/15 p-3"><p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-white/35">Internal note history</p><p className="whitespace-pre-wrap text-xs leading-relaxed text-white/55">{item.internalNotes}</p></div>}
                </div>
                <div className="mt-3 flex justify-end"><button onClick={() => void save("GRIEVANCE", item._id, item.status, item.publicResponse)} disabled={saving === item._id} className="inline-flex items-center gap-2 rounded-xl bg-sky-500 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-400 disabled:opacity-50"><MessageSquareText size={13}/>{saving === item._id ? "Saving…" : "Save update"}</button></div>
              </article>
            );
          })}
        </div>
      ) : tab === "PRIVACY" ? (
        <div className="space-y-3">
          {data.privacyRequests.map((item) => {
            const draft = getDraft(item._id, item.status, item.publicResponse);
            return (
              <article key={item._id} className={panel + " p-4 sm:p-5"}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-300">{pretty(item.requestType)}</span>
                    <p className="mt-2 max-w-3xl whitespace-pre-wrap text-sm leading-relaxed text-white/75">{item.details}</p>
                  </div>
                  <span className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] text-amber-200">{pretty(item.status)}</span>
                </div>
                <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 border-t border-white/10 pt-3 text-[11px] text-white/40">
                  <span className="inline-flex items-center gap-1.5"><UserRound size={12}/>{item.requesterName} · {pretty(item.requesterRole)}</span>
                  <span>{item.requesterEmail}</span>
                  <span className="inline-flex items-center gap-1.5"><Clock3 size={12}/>{dateLabel(item.requestedAt)}</span>
                </div>
                <div className="mt-4 grid gap-3 lg:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-[11px] text-white/55">Request status</label>
                    <select className={field} value={draft.status} onChange={(e) => patchDraft(item._id, { status: e.target.value }, item.status, item.publicResponse)}>
                      {privacyStatuses.map((status) => <option key={status} value={status}>{pretty(status)}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-[11px] text-white/55">Customer-visible response</label>
                    <input className={field} value={draft.publicResponse} onChange={(e) => patchDraft(item._id, { publicResponse: e.target.value }, item.status, item.publicResponse)} placeholder="Explain the review or outcome…" />
                  </div>
                </div>
                <div className="mt-3">
                  <label className="mb-1.5 block text-[11px] text-white/55">Internal note (not visible to the user)</label>
                  <textarea rows={2} className={field + " resize-y"} value={draft.internalNote} onChange={(e) => patchDraft(item._id, { internalNote: e.target.value }, item.status, item.publicResponse)} placeholder="Record verification steps, legal hold, or data-system checks…" />
                  {item.internalNotes && <div className="mt-2 rounded-lg border border-white/10 bg-black/15 p-3"><p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-white/35">Internal note history</p><p className="whitespace-pre-wrap text-xs leading-relaxed text-white/55">{item.internalNotes}</p></div>}
                </div>
                <div className="mt-3 flex justify-end"><button onClick={() => void save("PRIVACY", item._id, item.status, item.publicResponse)} disabled={saving === item._id} className="inline-flex items-center gap-2 rounded-xl bg-sky-500 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-400 disabled:opacity-50"><MessageSquareText size={13}/>{saving === item._id ? "Saving…" : "Save update"}</button></div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="space-y-3">
          {data.accountDeletions.map((item) => (
            <article key={item._id} className={panel + " p-4 sm:p-5"}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-rose-300">Account deletion</p>
                  <h2 className="mt-2 text-base font-semibold">{item.requesterName}</h2>
                  <p className="mt-1 text-xs text-white/50">{item.requesterEmail}</p>
                </div>
                <span className={`rounded-full border px-2.5 py-1 text-[10px] ${item.status === "ERASURE_REVIEW" ? "border-amber-400/25 text-amber-200" : "border-sky-400/25 text-sky-200"}`}>{pretty(item.status)}</span>
              </div>
              <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 border-t border-white/10 pt-3 text-[11px] text-white/40">
                <span className="inline-flex items-center gap-1.5"><UserRound size={12}/>{pretty(item.requesterRole)}</span>
                <span>Requested {dateLabel(item.requestedAt)}</span>
                {item.deactivatedAt && <span>Deactivated {dateLabel(item.deactivatedAt)}</span>}
                {item.restoreExpiresAt && <span>Restore link expired {dateLabel(item.restoreExpiresAt)}</span>}
              </div>
              <p className="mt-3 text-xs leading-relaxed text-white/50">
                {item.status === "ERASURE_REVIEW"
                  ? "The 30-day restoration period has ended. Review dependent project, payment, KYC, commission, employee, security and dispute records before approving any final erasure or legally required retention."
                  : "The account is deactivated. The user can restore it using the single-use link sent to their verified email until the restoration deadline."}
              </p>
            </article>
          ))}
        </div>
      )}
      <p className="text-[10px] leading-relaxed text-white/30">Account deactivation is not a physical purge. The erasure queue requires an authorised review of dependent and legally retained records before final deletion or anonymisation.</p>
    </div>
  );
}

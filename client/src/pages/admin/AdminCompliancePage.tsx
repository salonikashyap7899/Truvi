import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import {
  ShieldCheck,
  RefreshCw,
  MessageSquareText,
  UserRound,
  Clock3,
  Download,
  Search,
  FileCheck,
} from "lucide-react";
import { useTheme } from "@/lib/theme";
import SectionInfoTooltip from "@/components/admin/SectionInfoTooltip";

type Grievance = {
  _id: string;
  caseNumber: string;
  category: string;
  subject: string;
  description: string;
  status: string;
  publicResponse?: string | null;
  internalNotes?: string | null;
  requestedAt: string;
  updatedAt: string;
  requesterName: string;
  requesterEmail: string;
  requesterRole: string;
  requesterPhone?: string | null;
  acknowledgedAt?: string | null;
  acknowledgementDueAt?: string | null;
  responseDueAt?: string | null;
};

type PrivacyRequest = {
  _id: string;
  requestType: string;
  details: string;
  status: string;
  publicResponse?: string | null;
  internalNotes?: string | null;
  requestedAt: string;
  updatedAt: string;
  requesterName: string;
  requesterEmail: string;
  requesterRole: string;
};

type AccountDeletion = {
  _id: string;
  status: string;
  requestedAt: string;
  deactivatedAt?: string | null;
  restoreExpiresAt?: string | null;
  requesterName: string;
  requesterEmail: string;
  requesterRole: string;
};

type QueueData = {
  grievances: Grievance[];
  privacyRequests: PrivacyRequest[];
  accountDeletions: AccountDeletion[];
};

type Draft = { status: string; publicResponse: string; internalNote: string };

const grievanceStatuses = [
  "SUBMITTED",
  "ACKNOWLEDGED",
  "IN_PROGRESS",
  "WAITING_FOR_USER",
  "RESOLVED",
  "CLOSED",
];
const privacyStatuses = [
  "SUBMITTED",
  "UNDER_REVIEW",
  "WAITING_FOR_USER",
  "APPROVED",
  "REJECTED",
  "COMPLETED",
];

const pretty = (s: string) =>
  s.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const dateLabel = (s: string) =>
  new Date(s).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });

export default function AdminCompliancePage() {
  const { theme } = useTheme();
  const isLight = theme === "light";

  const [data, setData] = useState<QueueData>({
    grievances: [],
    privacyRequests: [],
    accountDeletions: [],
  });
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"GRIEVANCES" | "PRIVACY" | "ACCOUNT_DELETIONS">("GRIEVANCES");
  const [search, setSearch] = useState("");
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get("/compliance/admin/queue");
      setData({
        grievances: response.data.grievances ?? [],
        privacyRequests: response.data.privacyRequests ?? [],
        accountDeletions: response.data.accountDeletions ?? [],
      });
    } catch (error: any) {
      toast.error(error?.response?.data?.error || "Could not update the compliance queue.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function getDraft(id: string, status: string, publicResponse?: string | null): Draft {
    return drafts[id] ?? { status, publicResponse: publicResponse ?? "", internalNote: "" };
  }

  function patchDraft(id: string, patch: Partial<Draft>, status: string, response?: string | null) {
    setDrafts((current) => ({
      ...current,
      [id]: { ...getDraft(id, status, response), ...patch },
    }));
  }

  async function save(
    kind: "GRIEVANCE" | "PRIVACY",
    id: string,
    currentStatus: string,
    publicResponse?: string | null,
  ) {
    const draft = getDraft(id, currentStatus, publicResponse);
    setSaving(id);
    try {
      const endpoint =
        kind === "GRIEVANCE"
          ? `/compliance/admin/grievances/${id}`
          : `/compliance/admin/privacy-requests/${id}`;
      await api.patch(endpoint, {
        status: draft.status,
        publicResponse: draft.publicResponse.trim() || undefined,
        internalNote: draft.internalNote.trim() || undefined,
      });
      setDrafts((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
      toast.success("Compliance case updated.");
      await load();
    } catch (error: any) {
      toast.error(error?.response?.data?.error || "Failed to save update.");
    } finally {
      setSaving(null);
    }
  }

  async function updateDeletionStatus(id: string, status: string) {
    setSaving(id);
    try {
      await api.patch(`/compliance/admin/account-deletions/${id}`, { status });
      toast.success(`Account deletion status updated to ${pretty(status)}`);
      await load();
    } catch (error: any) {
      toast.error(error?.response?.data?.error || "Failed to update deletion status.");
    } finally {
      setSaving(null);
    }
  }

  async function exportReport() {
    try {
      const res = await api.get("/compliance/admin/export");
      const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `compliance_audit_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Compliance audit export downloaded.");
    } catch (err) {
      toast.error("Failed to export compliance report.");
    }
  }

  const totalOpenGrievances = data.grievances.filter(
    (item) => !["RESOLVED", "CLOSED"].includes(item.status),
  ).length;
  const totalOpenPrivacy = data.privacyRequests.filter(
    (item) => !["REJECTED", "COMPLETED"].includes(item.status),
  ).length;

  const filteredGrievances = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return data.grievances;
    return data.grievances.filter(
      (g) =>
        g.caseNumber.toLowerCase().includes(q) ||
        g.subject.toLowerCase().includes(q) ||
        g.requesterName.toLowerCase().includes(q) ||
        g.requesterEmail.toLowerCase().includes(q) ||
        g.category.toLowerCase().includes(q),
    );
  }, [data.grievances, search]);

  const filteredPrivacy = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return data.privacyRequests;
    return data.privacyRequests.filter(
      (p) =>
        p.requestType.toLowerCase().includes(q) ||
        p.requesterName.toLowerCase().includes(q) ||
        p.requesterEmail.toLowerCase().includes(q) ||
        p.details.toLowerCase().includes(q),
    );
  }, [data.privacyRequests, search]);

  const filteredDeletions = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return data.accountDeletions;
    return data.accountDeletions.filter(
      (d) =>
        d.requesterName.toLowerCase().includes(q) ||
        d.requesterEmail.toLowerCase().includes(q) ||
        d.status.toLowerCase().includes(q),
    );
  }, [data.accountDeletions, search]);

  const panelClass = `rounded-xl border transition-colors ${
    isLight ? "bg-white border-slate-200 shadow-sm" : "bg-[#0F172A]/80 border-white/10 shadow-lg"
  }`;

  const inputClass = `w-full rounded-lg border px-3 py-2 text-xs transition-colors focus:outline-none ${
    isLight
      ? "bg-slate-50 border-slate-200 text-slate-800 focus:border-violet-500"
      : "bg-black/30 border-white/10 text-slate-100 focus:border-sky-400"
  }`;

  return (
    <div
      className={`admin-compliance-page space-y-5 font-sans ${
        isLight ? "text-slate-800" : "text-slate-100"
      }`}
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4 border-inherit">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-sky-500 flex-shrink-0" />
          <h1 className={`text-2xl font-bold tracking-tight ${isLight ? "text-slate-900" : "text-white"}`}>
            Compliance Centre
          </h1>
          <SectionInfoTooltip
            title="Compliance & Regulatory Register"
            content="Statutory governance register monitoring public grievances, customer data rights (DPDP), account deactivations, and compliance audit trail."
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => void exportReport()}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
              isLight
                ? "bg-white hover:bg-slate-50 border-slate-200 text-slate-700"
                : "bg-white/5 hover:bg-white/10 border-white/10 text-slate-300"
            }`}
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Report</span>
          </button>

          <button
            onClick={() => void load()}
            disabled={loading}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
              isLight
                ? "bg-white hover:bg-slate-50 border-slate-200 text-slate-700 disabled:opacity-50"
                : "bg-white/5 hover:bg-white/10 border-white/10 text-slate-300 disabled:opacity-50"
            }`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <div className={`${panelClass} p-4`}>
          <div className="flex items-center justify-between">
            <span className={`text-[11px] font-semibold uppercase tracking-wider ${isLight ? "text-slate-500" : "text-slate-400"}`}>
              Grievances
            </span>
            <span className="text-xs font-bold text-sky-500">{totalOpenGrievances} open</span>
          </div>
          <div className={`mt-2 text-2xl font-bold ${isLight ? "text-slate-900" : "text-white"}`}>
            {data.grievances.length}
          </div>
          <p className={`mt-1 text-[11px] ${isLight ? "text-slate-500" : "text-slate-400"}`}>
            Public & account disputes
          </p>
        </div>

        <div className={`${panelClass} p-4`}>
          <div className="flex items-center justify-between">
            <span className={`text-[11px] font-semibold uppercase tracking-wider ${isLight ? "text-slate-500" : "text-slate-400"}`}>
              Privacy Requests
            </span>
            <span className="text-xs font-bold text-indigo-500">{totalOpenPrivacy} active</span>
          </div>
          <div className={`mt-2 text-2xl font-bold ${isLight ? "text-slate-900" : "text-white"}`}>
            {data.privacyRequests.length}
          </div>
          <p className={`mt-1 text-[11px] ${isLight ? "text-slate-500" : "text-slate-400"}`}>
            DPDP access & deletion
          </p>
        </div>

        <div className={`${panelClass} p-4`}>
          <div className="flex items-center justify-between">
            <span className={`text-[11px] font-semibold uppercase tracking-wider ${isLight ? "text-slate-500" : "text-slate-400"}`}>
              Account Deletions
            </span>
            <span className="text-xs font-bold text-amber-500">
              {data.accountDeletions.filter((d) => d.status === "ERASURE_REVIEW").length} in review
            </span>
          </div>
          <div className={`mt-2 text-2xl font-bold ${isLight ? "text-slate-900" : "text-white"}`}>
            {data.accountDeletions.length}
          </div>
          <p className={`mt-1 text-[11px] ${isLight ? "text-slate-500" : "text-slate-400"}`}>
            30-day restore queue
          </p>
        </div>

        <div className={`${panelClass} p-4`}>
          <div className="flex items-center justify-between">
            <span className={`text-[11px] font-semibold uppercase tracking-wider ${isLight ? "text-slate-500" : "text-slate-400"}`}>
              Coverage
            </span>
            <span className="text-xs font-bold text-emerald-500">Compliant</span>
          </div>
          <div className={`mt-2 text-2xl font-bold ${isLight ? "text-slate-900" : "text-white"}`}>
            All 7 Roles
          </div>
          <p className={`mt-1 text-[11px] ${isLight ? "text-slate-500" : "text-slate-400"}`}>
            Admin, Verifier, CP, Buyer, Dev
          </p>
        </div>
      </div>

      {/* Toolbar & Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div
          className={`flex items-center gap-1 p-1 rounded-xl border ${
            isLight ? "bg-slate-100 border-slate-200" : "bg-white/[0.04] border-white/10"
          }`}
        >
          <button
            onClick={() => setTab("GRIEVANCES")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              tab === "GRIEVANCES"
                ? "bg-violet-600 text-white shadow-xs"
                : isLight
                ? "text-slate-600 hover:text-slate-900"
                : "text-slate-400 hover:text-white"
            }`}
          >
            Grievances ({data.grievances.length})
          </button>
          <button
            onClick={() => setTab("PRIVACY")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              tab === "PRIVACY"
                ? "bg-violet-600 text-white shadow-xs"
                : isLight
                ? "text-slate-600 hover:text-slate-900"
                : "text-slate-400 hover:text-white"
            }`}
          >
            Privacy Requests ({data.privacyRequests.length})
          </button>
          <button
            onClick={() => setTab("ACCOUNT_DELETIONS")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              tab === "ACCOUNT_DELETIONS"
                ? "bg-violet-600 text-white shadow-xs"
                : isLight
                ? "text-slate-600 hover:text-slate-900"
                : "text-slate-400 hover:text-white"
            }`}
          >
            Deactivations ({data.accountDeletions.length})
          </button>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search records…"
            className={`w-full pl-8 pr-3 py-1.5 rounded-lg border text-xs ${
              isLight
                ? "bg-white border-slate-200 text-slate-800"
                : "bg-white/5 border-white/10 text-white"
            }`}
          />
        </div>
      </div>

      {/* Main Queue Content */}
      {loading ? (
        <div className={`${panelClass} p-8 text-center text-xs text-slate-400`}>
          <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-violet-500" />
          Loading compliance queue…
        </div>
      ) : tab === "GRIEVANCES" ? (
        filteredGrievances.length === 0 ? (
          <div className={`${panelClass} p-8 text-center text-xs text-slate-400`}>
            No grievances in this view.
          </div>
        ) : (
          <div className="space-y-3">
            {filteredGrievances.map((item) => {
              const draft = getDraft(item._id, item.status, item.publicResponse);
              return (
                <article key={item._id} className={`${panelClass} p-5 space-y-4`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-violet-600 dark:text-violet-400">
                          {item.caseNumber}
                        </span>
                        <span className="text-[11px] text-slate-400">· {pretty(item.category)}</span>
                      </div>
                      <h2 className={`mt-1.5 text-base font-semibold ${isLight ? "text-slate-900" : "text-white"}`}>
                        {item.subject}
                      </h2>
                      <p className={`mt-1.5 text-xs leading-relaxed max-w-3xl ${isLight ? "text-slate-600" : "text-slate-300"}`}>
                        {item.description}
                      </p>
                    </div>

                    <span className="px-2.5 py-1 rounded-md text-[11px] font-semibold border border-amber-500/20 bg-amber-500/10 text-amber-500">
                      {pretty(item.status)}
                    </span>
                  </div>

                  <div className={`flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[11px] border-t pt-3 ${isLight ? "border-slate-100 text-slate-500" : "border-white/5 text-slate-400"}`}>
                    <span className="inline-flex items-center gap-1">
                      <UserRound className="w-3 h-3" />
                      {item.requesterName} ({pretty(item.requesterRole)})
                    </span>
                    <span>{item.requesterEmail}</span>
                    {item.requesterPhone && <span>{item.requesterPhone}</span>}
                    <span className="inline-flex items-center gap-1">
                      <Clock3 className="w-3 h-3" />
                      {dateLabel(item.requestedAt)}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-medium text-slate-400 mb-1">
                        Status
                      </label>
                      <select
                        className={inputClass}
                        value={draft.status}
                        onChange={(e) =>
                          patchDraft(item._id, { status: e.target.value }, item.status, item.publicResponse)
                        }
                      >
                        {grievanceStatuses.map((s) => (
                          <option key={s} value={s}>
                            {pretty(s)}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-medium text-slate-400 mb-1">
                        Public Response (sent to requester)
                      </label>
                      <input
                        className={inputClass}
                        value={draft.publicResponse}
                        onChange={(e) =>
                          patchDraft(item._id, { publicResponse: e.target.value }, item.status, item.publicResponse)
                        }
                        placeholder="Official resolution note…"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1">
                      Internal Admin Notes
                    </label>
                    <textarea
                      rows={2}
                      className={inputClass}
                      value={draft.internalNote}
                      onChange={(e) =>
                        patchDraft(item._id, { internalNote: e.target.value }, item.status, item.publicResponse)
                      }
                      placeholder="Confidential case logs…"
                    />
                    {item.internalNotes && (
                      <div className={`mt-2 p-2.5 rounded-lg text-xs leading-relaxed font-mono ${isLight ? "bg-slate-100 text-slate-700" : "bg-black/30 text-slate-300"}`}>
                        {item.internalNotes}
                      </div>
                    )}
                  </div>

                  <div className="flex justify-end">
                    <button
                      onClick={() => void save("GRIEVANCE", item._id, item.status, item.publicResponse)}
                      disabled={saving === item._id}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold shadow-xs transition-all disabled:opacity-50"
                    >
                      <MessageSquareText className="w-3.5 h-3.5" />
                      <span>{saving === item._id ? "Saving…" : "Save Case Update"}</span>
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )
      ) : tab === "PRIVACY" ? (
        filteredPrivacy.length === 0 ? (
          <div className={`${panelClass} p-8 text-center text-xs text-slate-400`}>
            No privacy requests in this view.
          </div>
        ) : (
          <div className="space-y-3">
            {filteredPrivacy.map((item) => {
              const draft = getDraft(item._id, item.status, item.publicResponse);
              return (
                <article key={item._id} className={`${panelClass} p-5 space-y-4`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <span className="font-mono text-xs font-bold text-sky-500">
                        {pretty(item.requestType)}
                      </span>
                      <p className={`mt-2 text-xs leading-relaxed max-w-3xl ${isLight ? "text-slate-700" : "text-slate-300"}`}>
                        {item.details}
                      </p>
                    </div>

                    <span className="px-2.5 py-1 rounded-md text-[11px] font-semibold border border-sky-500/20 bg-sky-500/10 text-sky-500">
                      {pretty(item.status)}
                    </span>
                  </div>

                  <div className={`flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[11px] border-t pt-3 ${isLight ? "border-slate-100 text-slate-500" : "border-white/5 text-slate-400"}`}>
                    <span className="inline-flex items-center gap-1">
                      <UserRound className="w-3 h-3" />
                      {item.requesterName} ({pretty(item.requesterRole)})
                    </span>
                    <span>{item.requesterEmail}</span>
                    <span className="inline-flex items-center gap-1">
                      <Clock3 className="w-3 h-3" />
                      {dateLabel(item.requestedAt)}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-medium text-slate-400 mb-1">
                        Status
                      </label>
                      <select
                        className={inputClass}
                        value={draft.status}
                        onChange={(e) =>
                          patchDraft(item._id, { status: e.target.value }, item.status, item.publicResponse)
                        }
                      >
                        {privacyStatuses.map((s) => (
                          <option key={s} value={s}>
                            {pretty(s)}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-medium text-slate-400 mb-1">
                        Public Response
                      </label>
                      <input
                        className={inputClass}
                        value={draft.publicResponse}
                        onChange={(e) =>
                          patchDraft(item._id, { publicResponse: e.target.value }, item.status, item.publicResponse)
                        }
                        placeholder="Response to user…"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <button
                      onClick={() => void save("PRIVACY", item._id, item.status, item.publicResponse)}
                      disabled={saving === item._id}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold shadow-xs transition-all disabled:opacity-50"
                    >
                      <FileCheck className="w-3.5 h-3.5" />
                      <span>{saving === item._id ? "Saving…" : "Save Privacy Update"}</span>
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )
      ) : (
        filteredDeletions.length === 0 ? (
          <div className={`${panelClass} p-8 text-center text-xs text-slate-400`}>
            No account deletion requests in queue.
          </div>
        ) : (
          <div className="space-y-3">
            {filteredDeletions.map((item) => (
              <article key={item._id} className={`${panelClass} p-5 space-y-3`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <span className="text-[11px] font-semibold text-rose-500 uppercase tracking-wider">
                      Account Deactivation
                    </span>
                    <h2 className={`mt-1 text-base font-semibold ${isLight ? "text-slate-900" : "text-white"}`}>
                      {item.requesterName}
                    </h2>
                    <p className={`text-xs ${isLight ? "text-slate-500" : "text-slate-400"}`}>
                      {item.requesterEmail} · {pretty(item.requesterRole)}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-1 rounded-md text-[11px] font-semibold border border-rose-500/20 bg-rose-500/10 text-rose-500">
                      {pretty(item.status)}
                    </span>
                    <button
                      onClick={() => void updateDeletionStatus(item._id, "ERASURE_REVIEW")}
                      disabled={saving === item._id}
                      className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
                        isLight
                          ? "bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-700"
                          : "bg-white/5 hover:bg-white/10 border-white/10 text-slate-300"
                      }`}
                    >
                      Mark Erasure Review
                    </button>
                    <button
                      onClick={() => void updateDeletionStatus(item._id, "CANCELLED")}
                      disabled={saving === item._id}
                      className={`px-3 py-1.5 rounded-lg border text-xs font-semibold text-rose-500 border-rose-500/20 bg-rose-500/5 hover:bg-rose-500/10`}
                    >
                      Cancel Deletion
                    </button>
                  </div>
                </div>

                <div className={`flex flex-wrap items-center gap-x-5 gap-y-1 text-[11px] border-t pt-3 ${isLight ? "border-slate-100 text-slate-500" : "border-white/5 text-slate-400"}`}>
                  <span>Requested {dateLabel(item.requestedAt)}</span>
                  {item.deactivatedAt && <span>Deactivated {dateLabel(item.deactivatedAt)}</span>}
                  {item.restoreExpiresAt && <span>Restore expires {dateLabel(item.restoreExpiresAt)}</span>}
                </div>
              </article>
            ))}
          </div>
        )
      )}
    </div>
  );
}

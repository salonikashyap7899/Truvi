import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { ShieldCheck, ExternalLink, Loader2, Trash2, Search } from "lucide-react";
import SectionInfoTooltip from "@/components/admin/SectionInfoTooltip";

type KycStatus = "PENDING" | "APPROVED" | "REJECTED" | "NOT_SUBMITTED";
interface KycSubmission {
  _id: string;
  name: string;
  email: string;
  phone?: string;
  role: string;
  kycStatus: KycStatus | null;
  panNumberMasked: string | null;
  hasAadhaar: boolean;
  hasPan: boolean;
  hasSelfie: boolean;
  submittedAt: string | null;
}
interface KycCounts { total: number; approved: number; pending: number; rejected: number; notSubmitted: number; }

export default function AdminKycPage() {
  const [submissions, setSubmissions] = useState<KycSubmission[]>([]);
  const [counts, setCounts] = useState<KycCounts | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"ALL" | "PENDING" | "APPROVED" | "REJECTED" | "NOT_SUBMITTED">("ALL");
  const [query, setQuery] = useState("");
  const [selectedSubmissionId, setSelectedSubmissionId] = useState<string | null>(null);

  async function load() {
    try {
      const res = await api.get("/admin/kyc/records");
      const records: KycSubmission[] = res.data.records || [];
      setSubmissions(records);
      setCounts(res.data.counts || null);
      if (records.length > 0 && !selectedSubmissionId) {
        setSelectedSubmissionId(records[0]._id);
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to load submissions");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function decide(userId: string, approve: boolean) {
    let reason: string | undefined;
    if (!approve) {
      reason = window.prompt("Reason for rejection (shown to the partner):") || undefined;
      if (reason === undefined) return;
    }
    setBusyId(userId);
    try {
      await api.post(`/admin/kyc/${userId}/decision`, { approve, reason });
      toast.success(approve ? "Approved — partner access unlocked." : "KYC submission rejected.");
      setSubmissions((prev) => prev.map((s) => (s._id === userId ? { ...s, kycStatus: approve ? "APPROVED" : "REJECTED" } : s)));
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Action failed");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(userId: string) {
    if (!window.confirm("Remove this user's KYC? Their documents will be deleted and they will need to submit KYC again.")) return;
    setBusyId(userId);
    try {
      await api.delete(`/admin/kyc/${userId}`);
      toast.success("KYC removed — the user must re-submit.");
      setSubmissions((prev) => prev.filter((s) => s._id !== userId));
      if (selectedSubmissionId === userId) {
        setSelectedSubmissionId(null);
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to remove KYC");
    } finally {
      setBusyId(null);
    }
  }

  const filtered = useMemo(() => {
    let list = submissions;
    if (activeTab === "PENDING") list = list.filter((s) => s.kycStatus === "PENDING");
    else if (activeTab === "APPROVED") list = list.filter((s) => s.kycStatus === "APPROVED");
    else if (activeTab === "REJECTED") list = list.filter((s) => s.kycStatus === "REJECTED");
    else if (activeTab === "NOT_SUBMITTED") list = list.filter((s) => s.kycStatus === "NOT_SUBMITTED");

    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter((s) =>
        `${s.name} ${s.email} ${s.phone || ""} ${s.panNumberMasked || ""} ${s.role}`.toLowerCase().includes(q)
      );
    }
    return list;
  }, [submissions, activeTab, query]);

  const activeSubmission = useMemo(() => {
    return submissions.find((s) => s._id === selectedSubmissionId) || filtered[0] || null;
  }, [submissions, selectedSubmissionId, filtered]);

  return (
    <main className="min-h-screen p-4 sm:p-6 lg:p-8 text-foreground max-w-[1600px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold sm:text-3xl flex items-center gap-2.5">
              <ShieldCheck size={24} className="text-sky-400" />
              Channel Partner KYC
            </h1>
            <SectionInfoTooltip
              title="CP KYC Verification Console"
              content="Verification and identity compliance queue for Channel Partners and Ambassadors. Validate masked PAN, Aadhaar compliance, and live selfie match before granting transaction and payout privileges."
            />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Review partner credentials, inspect unmasked identity limits, and unlock partner workspaces.
          </p>
        </div>

        <div className="relative w-full sm:w-80">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, email, PAN…"
            className="w-full rounded-xl border border-white/10 bg-white/[0.03] py-2 pl-9 pr-3 text-xs placeholder:text-muted-foreground outline-none focus:border-sky-500 transition"
          />
        </div>
      </div>

      {/* KPI Cards */}
      {counts && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <CountCard label="Total Partners" value={counts.total} />
          <CountCard label="Verified" value={counts.approved} dotColor="bg-emerald-400" />
          <CountCard label="Awaiting Review" value={counts.pending} dotColor="bg-amber-400" />
          <CountCard label="Rejected" value={counts.rejected} dotColor="bg-rose-400" />
          <CountCard label="Not Submitted" value={counts.notSubmitted} dotColor="bg-slate-400" />
        </div>
      )}

      {/* Queue Filter Tabs */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-white/10 pb-2">
        {[
          { key: "ALL", label: `All Partners (${submissions.length})` },
          { key: "PENDING", label: `Awaiting Review (${counts?.pending ?? 0})` },
          { key: "APPROVED", label: `Verified (${counts?.approved ?? 0})` },
          { key: "REJECTED", label: `Rejected (${counts?.rejected ?? 0})` },
          { key: "NOT_SUBMITTED", label: `Not Submitted (${counts?.notSubmitted ?? 0})` },
        ].map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setActiveTab(t.key as any)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              activeTab === t.key
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center p-16 text-muted-foreground gap-3">
          <Loader2 size={18} className="animate-spin text-sky-400" />
          <span>Loading KYC submissions…</span>
        </div>
      ) : submissions.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-12 text-center text-sm text-muted-foreground">
          No Channel Partners or Ambassadors registered yet.
        </div>
      ) : (
        /* Split-View: List of submissions on Left + Detailed Review/Preview on Right */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Submission Queue List (7 Cols) */}
          <div className="lg:col-span-7 space-y-3">
            {filtered.map((s) => {
              const isSelected = s._id === activeSubmission?._id;
              const isApproved = s.kycStatus === "APPROVED";
              const isPending = s.kycStatus === "PENDING";
              const isRejected = s.kycStatus === "REJECTED";
              return (
                <div
                  key={s._id}
                  onClick={() => setSelectedSubmissionId(s._id)}
                  className={`cursor-pointer rounded-xl border p-4 transition-all ${
                    isSelected
                      ? "border-sky-500/50 bg-sky-500/[0.06] shadow-sm"
                      : "border-white/10 bg-card hover:border-white/20 hover:bg-white/[0.02]"
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-foreground">{s.name}</span>
                        <span className="text-[10px] font-semibold tracking-wider px-2 py-0.5 rounded-md bg-white/5 text-muted-foreground uppercase">
                          {s.role}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground truncate">
                        {s.email}{s.phone ? ` · ${s.phone}` : ""}
                      </p>
                      <div className="mt-1 flex items-center gap-3 text-[11px] text-muted-foreground">
                        <span>PAN: <strong className="text-foreground font-mono">{s.panNumberMasked || "Not Provided"}</strong></span>
                        {s.submittedAt && (
                          <span>· {new Date(s.submittedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <div className="flex items-center gap-1.5 text-xs font-semibold">
                        <span
                          className={`size-2 rounded-full ${
                            isApproved
                              ? "bg-emerald-400"
                              : isPending
                              ? "bg-amber-400 animate-pulse"
                              : isRejected
                              ? "bg-rose-400"
                              : "bg-slate-400"
                          }`}
                        />
                        <span
                          className={
                            isApproved
                              ? "text-emerald-400"
                              : isPending
                              ? "text-amber-400"
                              : isRejected
                              ? "text-rose-400"
                              : "text-slate-400"
                          }
                        >
                          {isApproved
                            ? "Verified"
                            : isPending
                            ? "In Review"
                            : isRejected
                            ? "Rejected"
                            : "Not Submitted"}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <span className={s.hasAadhaar ? "text-emerald-400 font-medium" : "text-muted-foreground/60"}>
                          {s.hasAadhaar ? "✓ Aadhaar" : "✗ Aadhaar"}
                        </span>
                        <span>·</span>
                        <span className={s.hasPan ? "text-emerald-400 font-medium" : "text-muted-foreground/60"}>
                          {s.hasPan ? "✓ PAN" : "✗ PAN"}
                        </span>
                        <span>·</span>
                        <span className={s.hasSelfie ? "text-emerald-400 font-medium" : "text-muted-foreground/60"}>
                          {s.hasSelfie ? "✓ Selfie" : "✗ Selfie"}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            {filtered.length === 0 && (
              <p className="p-8 text-center text-sm text-muted-foreground rounded-xl border border-white/10 bg-card">
                No submissions match the selected filters.
              </p>
            )}
          </div>

          {/* Right Panel: Split-Screen Detail Preview & Decision Checklist (5 Cols) */}
          <div className="lg:col-span-5 sticky top-6 space-y-4">
            {activeSubmission ? (
              <div className="rounded-xl border border-white/10 bg-card p-5 sm:p-6 shadow-sm space-y-5">
                <div className="flex items-start justify-between border-b border-white/10 pb-4">
                  <div>
                    <span className="text-[10px] font-bold tracking-wider text-sky-400 uppercase">
                      Verification Dossier
                    </span>
                    <h2 className="text-lg font-bold mt-0.5">{activeSubmission.name}</h2>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {activeSubmission.email}{activeSubmission.phone ? ` · ${activeSubmission.phone}` : ""}
                    </p>
                  </div>

                  <Link
                    to={`/admin/users/${activeSubmission._id}`}
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground border border-white/10 px-2.5 py-1.5 rounded-lg transition"
                  >
                    User Profile <ExternalLink size={11} />
                  </Link>
                </div>

                {/* Status & Review Controls */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground font-semibold">Current State</span>
                    <span className="font-semibold text-foreground">
                      {activeSubmission.kycStatus === "APPROVED"
                        ? "Verified Partner"
                        : activeSubmission.kycStatus === "PENDING"
                        ? "Awaiting Admin Review"
                        : activeSubmission.kycStatus === "REJECTED"
                        ? "Rejected"
                        : "Not Submitted"}
                    </span>
                  </div>

                  {activeSubmission.kycStatus === "PENDING" && (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => decide(activeSubmission._id, true)}
                        disabled={busyId === activeSubmission._id}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500 transition disabled:opacity-50"
                      >
                        {busyId === activeSubmission._id && <Loader2 size={13} className="animate-spin" />}
                        Approve &amp; Unlock
                      </button>
                      <button
                        type="button"
                        onClick={() => decide(activeSubmission._id, false)}
                        disabled={busyId === activeSubmission._id}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-xs font-semibold text-rose-300 hover:bg-rose-500/20 transition disabled:opacity-50"
                      >
                        Reject
                      </button>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-2 border-t border-white/5">
                    <button
                      type="button"
                      onClick={() => remove(activeSubmission._id)}
                      disabled={busyId === activeSubmission._id}
                      className="inline-flex items-center gap-1 text-xs text-rose-400 hover:text-rose-300 transition disabled:opacity-50"
                    >
                      <Trash2 size={12} /> Delete KYC Record
                    </button>
                    <span className="text-[11px] text-muted-foreground font-mono">
                      ID: {activeSubmission._id.slice(-8)}
                    </span>
                  </div>
                </div>

                {/* Document Previews */}
                <div className="space-y-3 border-t border-white/10 pt-4">
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                    Uploaded Verification Documents
                  </p>
                  <div className="grid grid-cols-1 gap-3">
                    <DocTile label="Aadhaar / ID Card" userId={activeSubmission._id} type="aadhaar" present={activeSubmission.hasAadhaar} />
                    <DocTile label="PAN Card" userId={activeSubmission._id} type="pan" present={activeSubmission.hasPan} />
                    <DocTile label="Live Verification Selfie" userId={activeSubmission._id} type="selfie" present={activeSubmission.hasSelfie} />
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-white/10 bg-card p-8 text-center text-sm text-muted-foreground">
                Select a submission on the left to preview documents and verify.
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

function CountCard({ label, value, dotColor }: { label: string; value: number; dotColor?: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-card p-4 space-y-1">
      <div className="flex items-center gap-1.5">
        {dotColor && <span className={`size-1.5 rounded-full ${dotColor}`} />}
        <p className="text-xs text-muted-foreground font-medium">{label}</p>
      </div>
      <p className="text-2xl font-bold tracking-tight text-foreground tabular-nums">{value}</p>
    </div>
  );
}

function DocTile({ label, userId, type, present }: { label: string; userId: string; type: string; present: boolean }) {
  const [src, setSrc] = useState<string | null>(null);
  const [isPdf, setIsPdf] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!present) return;
    let url: string | null = null;
    let cancelled = false;
    api
      .get(`/admin/kyc/${userId}/file/${type}`, { responseType: "blob" })
      .then((res) => {
        if (cancelled) return;
        const blob = res.data as Blob;
        url = URL.createObjectURL(blob);
        setIsPdf(blob.type === "application/pdf");
        setSrc(url);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [userId, type, present]);

  return (
    <div className="rounded-xl border border-white/10 bg-background/50 p-3 space-y-2">
      <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
        <span>{label}</span>
        {src && (
          <a href={src} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sky-400 hover:underline">
            Inspect <ExternalLink size={11} />
          </a>
        )}
      </div>

      {!present || failed ? (
        <div className="grid h-28 place-items-center text-xs text-muted-foreground/60 border border-dashed border-white/10 rounded-lg">
          {failed ? "Failed to load document" : "Not submitted"}
        </div>
      ) : !src ? (
        <div className="grid h-28 place-items-center text-muted-foreground border border-white/10 rounded-lg">
          <Loader2 size={16} className="animate-spin text-sky-400" />
        </div>
      ) : isPdf ? (
        <a href={src} target="_blank" rel="noreferrer" className="grid h-28 place-items-center rounded-lg border border-white/10 bg-white/[0.02] text-xs font-semibold text-sky-400 hover:bg-white/5 transition">
          View PDF Attachment
        </a>
      ) : (
        <a href={src} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg border border-white/10">
          <img src={src} alt={label} className="h-32 w-full object-cover transition hover:scale-105 duration-300" />
        </a>
      )}
    </div>
  );
}

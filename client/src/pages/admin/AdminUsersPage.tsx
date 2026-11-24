import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { roleLabel } from "@/lib/rolePaths";
import { formatDate } from "@/lib/utils";
import { toast } from "sonner";
import { Search, Crown, X, Loader2, Users, Trash2, Download } from "lucide-react";
import SectionInfoTooltip from "@/components/admin/SectionInfoTooltip";
import type { User, Role } from "@/types";

type KycState = "VERIFIED" | "PENDING" | "REJECTED" | "NONE";

function kycState(u: User): KycState {
  if (u.onboardingVerified || u.onboardingChecks?.kycStatus === "APPROVED") return "VERIFIED";
  const s = u.onboardingChecks?.kycStatus;
  if (s === "PENDING") return "PENDING";
  if (s === "REJECTED") return "REJECTED";
  return "NONE";
}

const KYC_FILTERS: { key: "ALL" | KycState; label: string }[] = [
  { key: "ALL", label: "All KYC" },
  { key: "VERIFIED", label: "Verified" },
  { key: "PENDING", label: "Pending" },
  { key: "REJECTED", label: "Rejected" },
];

type Pending = {
  title: string;
  message: string;
  confirmLabel: string;
  tone: "success" | "danger" | "default";
  run: () => Promise<void>;
};

export default function AdminUsersPage() {
  const me = useAuthStore((s) => s.user);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<Role | "ALL">("ALL");
  const [kycFilter, setKycFilter] = useState<"ALL" | KycState>("ALL");
  const [statusView, setStatusView] = useState<"REVIEW" | "APPROVED">("APPROVED");
  const [pending, setPending] = useState<Pending | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  async function load() {
    try {
      const res = await api.get("/admin/users", { params: { all: "true" } });
      setUsers(res.data.users || []);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to load users");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  async function doSetDisabled(u: User, disabled: boolean) {
    setBusyId(u._id);
    try {
      const res = await api.patch(`/admin/users/${u._id}`, { disabled });
      setUsers((prev) => prev.map((x) => (x._id === u._id ? { ...res.data.user, subscription: x.subscription } : x)));
      if (selectedUser?._id === u._id) {
        setSelectedUser((prev) => (prev ? { ...prev, disabled } : null));
      }
      toast.success(disabled ? "User deactivated" : "User restored");
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Action failed");
    } finally {
      setBusyId(null);
    }
  }

  async function doSetApproval(u: User, approvalStatus: "APPROVED" | "REJECTED") {
    setBusyId(u._id);
    try {
      const res = await api.patch(`/admin/users/${u._id}`, { approvalStatus });
      setUsers((prev) => prev.map((x) => (x._id === u._id ? { ...res.data.user, subscription: x.subscription } : x)));
      if (selectedUser?._id === u._id) {
        setSelectedUser((prev) => (prev ? { ...prev, approvalStatus } : null));
      }
      toast.success(approvalStatus === "APPROVED" ? "User approved" : "User rejected");
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Action failed");
    } finally {
      setBusyId(null);
    }
  }

  async function doCancelSubscription(u: User) {
    setBusyId(u._id);
    try {
      const res = await api.post(`/admin/users/${u._id}/cancel-subscription`);
      setUsers((prev) => prev.map((x) => (x._id === u._id ? { ...res.data.user, subscription: { active: false, count: 0, label: null } } : x)));
      toast.success(res.data.cancelledCount > 0 ? `Cancelled ${res.data.cancelledCount} subscription(s)` : "Premium cleared");
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Action failed");
    } finally {
      setBusyId(null);
    }
  }

  async function doDelete(u: User) {
    setBusyId(u._id);
    try {
      const res = await api.delete(`/admin/users/${u._id}`);
      setUsers((prev) => prev.filter((x) => x._id !== u._id));
      if (selectedUser?._id === u._id) setSelectedUser(null);
      toast.success(`Permanently deleted ${res.data.deleted || u.name}`);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Delete failed");
    } finally {
      setBusyId(null);
    }
  }

  function askApprove(u: User) {
    setPending({
      title: `Approve ${u.name}?`,
      message: "They will be permitted to access and utilize their designated workspace.",
      confirmLabel: "Approve User",
      tone: "success",
      run: () => doSetApproval(u, "APPROVED"),
    });
  }

  function askReject(u: User) {
    setPending({
      title: `Reject ${u.name}?`,
      message: "They won't be able to log in until approved again by an administrator.",
      confirmLabel: "Reject User",
      tone: "danger",
      run: () => doSetApproval(u, "REJECTED"),
    });
  }

  function askRemove(u: User) {
    setPending({
      title: `Deactivate ${u.name}?`,
      message: "This deactivates the account — their session will terminate and login will be blocked.",
      confirmLabel: "Deactivate",
      tone: "danger",
      run: () => doSetDisabled(u, true),
    });
  }

  function askDelete(u: User) {
    setPending({
      title: `Permanently delete ${u.name}?`,
      message: "This action is irreversible. All associated listings, leads, logs, and files will be permanently purged.",
      confirmLabel: "Delete Forever",
      tone: "danger",
      run: () => doDelete(u),
    });
  }

  function askRestore(u: User) {
    setPending({
      title: `Restore ${u.name}?`,
      message: "They will be restored to active status and permitted to log in.",
      confirmLabel: "Restore Account",
      tone: "default",
      run: () => doSetDisabled(u, false),
    });
  }

  function askCancelSub(u: User) {
    setPending({
      title: `Cancel ${u.name}'s subscription?`,
      message: "Their active plans will be cancelled and premium tier revoked.",
      confirmLabel: "Cancel Subscription",
      tone: "danger",
      run: () => doCancelSubscription(u),
    });
  }

  async function runPending() {
    if (!pending) return;
    setConfirming(true);
    try {
      await pending.run();
    } finally {
      setConfirming(false);
      setPending(null);
    }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users.filter((u) => {
      const approved = u.approvalStatus === "APPROVED";
      if (statusView === "APPROVED" ? !approved : approved) return false;
      if (roleFilter !== "ALL" && u.role !== roleFilter) return false;
      if (kycFilter !== "ALL" && kycState(u) !== kycFilter) return false;
      if (!q) return true;
      return u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || (u.phone || "").includes(q);
    });
  }, [users, query, roleFilter, kycFilter, statusView]);

  const counts = useMemo(() => ({
    total: users.length,
    active: users.filter((u) => !u.disabled).length,
    subscribers: users.filter((u) => u.subscription?.active).length,
    review: users.filter((u) => u.approvalStatus !== "APPROVED").length,
    approved: users.filter((u) => u.approvalStatus === "APPROVED").length,
    kycVerified: users.filter((u) => kycState(u) === "VERIFIED").length,
    kycPending: users.filter((u) => kycState(u) === "PENDING").length,
  }), [users]);

  function exportUsersCsv() {
    const header = ["ID", "Name", "Email", "Phone", "Role", "Approval Status", "KYC Status", "Disabled", "Created At"];
    const lines = filtered.map((u) => [
      u._id,
      u.name,
      u.email,
      u.phone || "",
      u.role,
      u.approvalStatus,
      kycState(u),
      u.disabled ? "YES" : "NO",
      u.createdAt || "",
    ]);
    const csv = [header, ...lines].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `truvi-users-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="min-h-screen p-4 sm:p-6 lg:p-8 text-foreground max-w-[1600px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold sm:text-3xl flex items-center gap-2.5">
              <Users size={24} className="text-sky-400" />
              User Management
            </h1>
            <SectionInfoTooltip
              title="Identity & Access Governance"
              content="Directory of all registered buyers, channel partners, ambassadors, developers, and platform staff. Manage account lifecycle, role privileges, KYC compliance status, and subscription entitlements."
            />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Manage identity verification, approvals, privilege levels, and subscription tiers.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={exportUsersCsv}
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 px-3.5 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-white/5 transition"
          >
            <Download size={13} /> Export Users
          </button>
        </div>
      </div>

      {/* Role Distribution Strip */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-7">
        {(["ALL", "DEVELOPER", "CP", "AMBASSADOR", "BUYER", "VERIFIER", "ADMIN"] as (Role | "ALL")[]).map((r) => {
          const isSelected = roleFilter === r;
          const count = r === "ALL" ? users.length : users.filter((u) => u.role === r).length;
          return (
            <button
              key={r}
              type="button"
              onClick={() => setRoleFilter(r)}
              className={`rounded-xl border p-3 text-left transition ${
                isSelected
                  ? "border-sky-500/50 bg-sky-500/10 text-foreground"
                  : "border-white/10 bg-card hover:border-white/20 hover:bg-white/[0.02] text-muted-foreground hover:text-foreground"
              }`}
            >
              <p className="text-[11px] font-semibold text-muted-foreground">
                {r === "ALL" ? "All Accounts" : roleLabel(r)}
              </p>
              <p className="text-xl font-bold text-foreground mt-0.5 tabular-nums">{count}</p>
            </button>
          );
        })}
      </div>

      {/* Status View Tabs (Approved vs Needs Review) */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setStatusView("APPROVED")}
            className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition ${
              statusView === "APPROVED"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
            }`}
          >
            <span className="size-1.5 rounded-full bg-emerald-400" />
            <span>Active &amp; Approved ({counts.approved})</span>
          </button>

          <button
            type="button"
            onClick={() => setStatusView("REVIEW")}
            className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition ${
              statusView === "REVIEW"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
            }`}
          >
            <span className="size-1.5 rounded-full bg-amber-400" />
            <span>Needs Review ({counts.review})</span>
          </button>
        </div>

        {/* KYC Filter */}
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground font-semibold">KYC:</span>
          <select
            value={kycFilter}
            onChange={(e) => setKycFilter(e.target.value as any)}
            className="rounded-lg border border-white/10 bg-background px-2.5 py-1 text-xs font-medium focus:border-sky-500 outline-none"
          >
            {KYC_FILTERS.map((f) => (
              <option key={f.key} value={f.key}>{f.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Search Bar */}
      <div className="relative w-full">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by name, email, or phone number…"
          className="w-full rounded-xl border border-white/10 bg-white/[0.03] py-2 pl-9 pr-3 text-xs placeholder:text-muted-foreground outline-none focus:border-sky-500 transition"
        />
      </div>

      {/* User Data Table */}
      {loading ? (
        <div className="flex items-center justify-center p-16 text-muted-foreground gap-3">
          <Loader2 size={18} className="animate-spin text-sky-400" />
          <span>Loading user accounts…</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-card p-12 text-center text-sm text-muted-foreground">
          {statusView === "REVIEW"
            ? "No accounts awaiting approval. All accounts are processed."
            : "No approved users match the current search filters."}
        </div>
      ) : (
        <div className="rounded-xl border border-white/10 bg-card overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[950px] text-left text-sm">
              <thead className="border-b border-white/10 bg-white/[0.02] text-xs text-muted-foreground">
                <tr>
                  <th className="p-3.5">User Identity</th>
                  <th className="p-3.5">Role &amp; Tier</th>
                  <th className="p-3.5">KYC Status</th>
                  <th className="p-3.5">Account State</th>
                  <th className="p-3.5">Subscription</th>
                  <th className="p-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filtered.map((u) => {
                  const isSelf = u._id === me?._id;
                  const isAdmin = u.role === "ADMIN";
                  const busy = busyId === u._id;
                  const kyc = kycState(u);
                  const isApproved = u.approvalStatus === "APPROVED";
                  return (
                    <tr
                      key={u._id}
                      onClick={() => setSelectedUser(u)}
                      className={`cursor-pointer transition hover:bg-white/[0.02] ${u.disabled ? "opacity-50" : ""}`}
                    >
                      <td className="p-3.5">
                        <div className="flex items-center gap-3">
                          <div className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 border border-primary/20 text-xs font-bold text-primary">
                            {(u.name || u.email || "?").charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <span className="font-semibold text-xs text-foreground block truncate">
                              {u.name}
                            </span>
                            <span className="text-[11px] text-muted-foreground block truncate">
                              {u.email}{u.phone ? ` · ${u.phone}` : ""}
                            </span>
                          </div>
                        </div>
                      </td>

                      <td className="p-3.5">
                        <span className="font-semibold text-xs text-foreground">{roleLabel(u.role)}</span>
                        {u.cpTier && (
                          <span className="block text-[11px] text-muted-foreground">{u.cpTier}</span>
                        )}
                      </td>

                      <td className="p-3.5">
                        <div className="flex items-center gap-1.5 text-xs">
                          <span
                            className={`size-1.5 rounded-full ${
                              kyc === "VERIFIED"
                                ? "bg-emerald-400"
                                : kyc === "PENDING"
                                ? "bg-amber-400 animate-pulse"
                                : kyc === "REJECTED"
                                ? "bg-rose-400"
                                : "bg-slate-500"
                            }`}
                          />
                          <span
                            className={
                              kyc === "VERIFIED"
                                ? "text-emerald-400 font-medium"
                                : kyc === "PENDING"
                                ? "text-amber-400 font-medium"
                                : kyc === "REJECTED"
                                ? "text-rose-400 font-medium"
                                : "text-muted-foreground"
                            }
                          >
                            {kyc === "VERIFIED" ? "Verified" : kyc === "PENDING" ? "In Review" : kyc === "REJECTED" ? "Rejected" : "Unverified"}
                          </span>
                        </div>
                      </td>

                      <td className="p-3.5">
                        <div className="flex items-center gap-1.5 text-xs">
                          <span
                            className={`size-1.5 rounded-full ${
                              u.disabled
                                ? "bg-rose-500"
                                : isApproved
                                ? "bg-emerald-400"
                                : "bg-amber-400 animate-pulse"
                            }`}
                          />
                          <span className={u.disabled ? "text-rose-400" : isApproved ? "text-emerald-400" : "text-amber-400"}>
                            {u.disabled ? "Deactivated" : isApproved ? "Active" : "Awaiting Approval"}
                          </span>
                        </div>
                      </td>

                      <td className="p-3.5">
                        {u.subscription?.active ? (
                          <span className="inline-flex items-center gap-1 text-xs text-amber-400 font-medium">
                            <Crown size={12} /> {u.subscription.label || "Premium"}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">Standard</span>
                        )}
                      </td>

                      <td className="p-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => setSelectedUser(u)}
                            className="rounded-lg border border-white/10 px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground transition"
                          >
                            Inspect
                          </button>

                          {isAdmin || isSelf ? (
                            <span className="text-[11px] text-muted-foreground px-2">Protected</span>
                          ) : (
                            <>
                              {isApproved ? (
                                <button
                                  type="button"
                                  onClick={() => askReject(u)}
                                  disabled={busy}
                                  className="rounded-lg border border-rose-500/30 px-2 py-1 text-xs text-rose-300 hover:bg-rose-500/10 transition disabled:opacity-50"
                                >
                                  Reject
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => askApprove(u)}
                                  disabled={busy}
                                  className="rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-500 transition disabled:opacity-50"
                                >
                                  Approve
                                </button>
                              )}

                              {u.disabled ? (
                                <button
                                  type="button"
                                  onClick={() => askRestore(u)}
                                  disabled={busy}
                                  className="rounded-lg border border-white/10 px-2 py-1 text-xs text-muted-foreground hover:text-foreground transition disabled:opacity-50"
                                >
                                  Restore
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => askRemove(u)}
                                  disabled={busy}
                                  className="rounded-lg border border-rose-500/30 px-2 py-1 text-xs text-rose-300 hover:bg-rose-500/10 transition disabled:opacity-50"
                                >
                                  Deactivate
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Slide-over User Detail Drawer */}
      {selectedUser && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedUser(null);
          }}
        >
          <div className="w-full max-w-md bg-card border-l border-white/10 p-6 shadow-2xl flex flex-col justify-between overflow-y-auto animate-in slide-in-from-right duration-200">
            <div className="space-y-5">
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <div className="flex items-center gap-3">
                  <div className="grid size-11 shrink-0 place-items-center rounded-full bg-primary/10 border border-primary/20 text-base font-bold text-primary">
                    {(selectedUser.name || "?").charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-foreground">{selectedUser.name}</h2>
                    <p className="text-xs text-muted-foreground">{roleLabel(selectedUser.role)}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedUser(null)}
                  className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-white/5 transition"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-4 text-xs">
                <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Email:</span>
                    <strong className="text-foreground font-mono">{selectedUser.email}</strong>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Phone:</span>
                    <strong className="text-foreground font-mono">{selectedUser.phone || "Not set"}</strong>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Account Status:</span>
                    <strong className={selectedUser.disabled ? "text-rose-400" : "text-emerald-400"}>
                      {selectedUser.disabled ? "Deactivated" : selectedUser.approvalStatus}
                    </strong>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">KYC Verification:</span>
                    <strong className="text-foreground">{kycState(selectedUser)}</strong>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Member Since:</span>
                    <strong className="text-foreground">{formatDate(selectedUser.createdAt || new Date())}</strong>
                  </div>
                </div>

                {/* Subscriptions */}
                {selectedUser.subscription?.active && (
                  <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.05] p-3 space-y-1">
                    <span className="font-semibold text-amber-300 flex items-center gap-1.5">
                      <Crown size={13} /> Active Subscription
                    </span>
                    <p className="text-muted-foreground">Plan: {selectedUser.subscription.label || "Premium"}</p>
                    <button
                      type="button"
                      onClick={() => askCancelSub(selectedUser)}
                      className="text-xs text-rose-400 hover:underline pt-1 block"
                    >
                      Cancel Subscription
                    </button>
                  </div>
                )}

                {/* Actions */}
                <div className="pt-2 space-y-2">
                  <Link
                    to={`/admin/users/${selectedUser._id}`}
                    className="w-full inline-flex items-center justify-center rounded-xl border border-white/10 py-2.5 text-xs font-semibold hover:bg-white/5 transition"
                  >
                    Open Deep Profile Dossier
                  </Link>

                  {selectedUser.role !== "ADMIN" && selectedUser._id !== me?._id && (
                    <button
                      type="button"
                      onClick={() => askDelete(selectedUser)}
                      className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl border border-rose-500/30 bg-rose-500/10 py-2.5 text-xs font-semibold text-rose-300 hover:bg-rose-500/20 transition"
                    >
                      <Trash2 size={13} /> Permanently Delete Account
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-white/10">
              <button
                type="button"
                onClick={() => setSelectedUser(null)}
                className="w-full rounded-xl bg-white/5 py-2.5 text-xs font-semibold hover:bg-white/10 transition"
              >
                Close Drawer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Dialog */}
      {pending && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget && !confirming) setPending(null);
          }}
        >
          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-card p-5 shadow-2xl space-y-4">
            <h3 className="font-semibold text-base">{pending.title}</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">{pending.message}</p>
            <div className="flex gap-2 justify-end pt-2">
              <button
                type="button"
                onClick={() => setPending(null)}
                disabled={confirming}
                className="rounded-xl border border-white/10 px-4 py-2 text-xs font-semibold hover:bg-white/5 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={runPending}
                disabled={confirming}
                className={`rounded-xl px-4 py-2 text-xs font-semibold text-white transition ${
                  pending.tone === "danger"
                    ? "bg-rose-600 hover:bg-rose-500"
                    : pending.tone === "success"
                    ? "bg-emerald-600 hover:bg-emerald-500"
                    : "bg-primary hover:bg-primary/90"
                }`}
              >
                {confirming ? <Loader2 size={13} className="animate-spin inline mr-1" /> : null}
                {pending.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

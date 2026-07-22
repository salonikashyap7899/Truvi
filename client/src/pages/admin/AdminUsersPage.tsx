import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { Card, Badge, Input } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/store/authStore";
import { roleLabel } from "@/lib/rolePaths";
import { formatDate } from "@/lib/utils";
import { toast } from "sonner";
import { ArrowLeft, Search, ShieldAlert, Crown, X, CheckCircle2, Loader2 } from "lucide-react";
import type { User, Role } from "@/types";

const ROLE_FILTERS: (Role | "ALL")[] = ["ALL", "DEVELOPER", "CP", "BUYER", "AMBASSADOR", "VERIFIER", "ADMIN"];

// A pending confirmation — drives the in-app dialog so we never fall back to
// the browser's native "site says…" popup for a destructive/status action.
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
  // Two boxes: users awaiting a decision (PENDING/REJECTED) vs already approved.
  const [statusView, setStatusView] = useState<"REVIEW" | "APPROVED">("REVIEW");
  const [pending, setPending] = useState<Pending | null>(null);
  const [confirming, setConfirming] = useState(false);

  async function load() {
    try {
      const res = await api.get("/admin/users", { params: { all: "true" } });
      setUsers(res.data.users);
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
      // Status change doesn't affect the subscription — keep the computed summary.
      setUsers((prev) => prev.map((x) => (x._id === u._id ? { ...res.data.user, subscription: x.subscription } : x)));
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
      // Subscription is now gone — reflect that in the row immediately.
      setUsers((prev) => prev.map((x) => (x._id === u._id ? { ...res.data.user, subscription: { active: false, count: 0, label: null } } : x)));
      toast.success(res.data.cancelledCount > 0 ? `Cancelled ${res.data.cancelledCount} subscription(s)` : "Premium cleared");
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Action failed");
    } finally {
      setBusyId(null);
    }
  }

  // Each action opens the in-app dialog describing that specific action.
  function askApprove(u: User) {
    setPending({
      title: `Approve ${u.name}?`,
      message: "They'll be able to log in and use the platform.",
      confirmLabel: "Approve",
      tone: "success",
      run: () => doSetApproval(u, "APPROVED"),
    });
  }
  function askReject(u: User) {
    setPending({
      title: `Reject ${u.name}?`,
      message: "They won't be able to log in until you approve them again.",
      confirmLabel: "Reject",
      tone: "danger",
      run: () => doSetApproval(u, "REJECTED"),
    });
  }
  function askRemove(u: User) {
    setPending({
      title: `Remove ${u.name}?`,
      message: "This deactivates the account — they will no longer be able to log in.",
      confirmLabel: "Remove",
      tone: "danger",
      run: () => doSetDisabled(u, true),
    });
  }
  function askRestore(u: User) {
    setPending({
      title: `Restore ${u.name}?`,
      message: "They will be able to log in again.",
      confirmLabel: "Restore",
      tone: "default",
      run: () => doSetDisabled(u, false),
    });
  }
  function askCancelSub(u: User) {
    setPending({
      title: `Cancel ${u.name}'s subscription?`,
      message: "Their active/pending plans will be cancelled and premium removed.",
      confirmLabel: "Cancel subscription",
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
      if (!q) return true;
      return u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || (u.phone || "").includes(q);
    });
  }, [users, query, roleFilter, statusView]);

  const counts = useMemo(() => ({
    total: users.length,
    active: users.filter((u) => !u.disabled).length,
    subscribers: users.filter((u) => u.subscription?.active).length,
    pending: users.filter((u) => u.approvalStatus === "PENDING").length,
    review: users.filter((u) => u.approvalStatus !== "APPROVED").length,
    approved: users.filter((u) => u.approvalStatus === "APPROVED").length,
  }), [users]);

  // Land on whichever box has something to look at: Needs Review if anyone is
  // waiting, otherwise the Approved list (so the page is never blank on load).
  useEffect(() => {
    if (!loading) setStatusView(counts.review > 0 ? "REVIEW" : "APPROVED");
  }, [loading]); // eslint-disable-line react-hooks/exhaustive-deps

  const roleCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const u of users) m[u.role] = (m[u.role] ?? 0) + 1;
    return m;
  }, [users]);

  if (loading) return <div className="min-h-screen p-10 text-white">Loading users…</div>;

  return (
    <main className="min-h-screen p-6 text-white md:p-10">
      <Link to="/admin/dashboard" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-white">
        <ArrowLeft size={14} /> Back to dashboard
      </Link>

      <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">User Management</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {counts.total} accounts · {counts.active} active · {counts.subscribers} with an active subscription. Remove (deactivate) accounts, and cancel a subscription only where one exists.
          </p>
        </div>
      </div>

      {/* Role counts */}
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {(["DEVELOPER", "CP", "AMBASSADOR", "BUYER", "VERIFIER", "ADMIN"] as Role[]).map((r) => (
          <button
            key={r}
            onClick={() => setRoleFilter(r)}
            className={`rounded-xl border px-3 py-2.5 text-left transition ${roleFilter === r ? "border-blue-500/50 bg-blue-500/10" : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"}`}
          >
            <p className="text-xs text-muted-foreground">{roleLabel(r)}</p>
            <p className="font-display text-xl font-semibold">{roleCounts[r] ?? 0}</p>
          </button>
        ))}
      </div>

      {/* Approval boxes: Needs Review vs Approved */}
      <div className="mt-5 flex flex-wrap gap-2">
        {([
          { key: "REVIEW" as const, label: "Needs Review", count: counts.review, tone: "amber" },
          { key: "APPROVED" as const, label: "Approved", count: counts.approved, tone: "emerald" },
        ]).map((tab) => {
          const active = statusView === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setStatusView(tab.key)}
              className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition ${
                active
                  ? tab.tone === "amber"
                    ? "border-amber-500/50 bg-amber-500/10 text-amber-200"
                    : "border-emerald-500/50 bg-emerald-500/10 text-emerald-200"
                  : "border-white/10 bg-white/[0.03] text-muted-foreground hover:bg-white/[0.06]"
              }`}
            >
              {tab.label}
              <span className={`rounded-full px-2 py-0.5 text-xs ${active ? "bg-white/15 text-white" : "bg-white/10 text-foreground/70"}`}>
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Controls */}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, email or phone…"
            className="border-white/15 bg-card pl-9 text-white"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {ROLE_FILTERS.map((r) => (
            <button
              key={r}
              onClick={() => setRoleFilter(r)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                roleFilter === r ? "border-blue-500/60 bg-blue-500/15 text-blue-200" : "border-white/15 text-muted-foreground hover:bg-white/5"
              }`}
            >
              {r === "ALL" ? "All" : roleLabel(r)}
            </button>
          ))}
        </div>
      </div>

      {/* Users list */}
      <div className="mt-4 space-y-2.5">
        {filtered.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {statusView === "REVIEW"
              ? "No users awaiting review — everyone is approved. Switch to the Approved box to see them."
              : "No approved users match your filters."}
          </p>
        )}
        {filtered.map((u) => {
          const isSelf = u._id === me?._id;
          const isAdmin = u.role === "ADMIN";
          const sub = u.subscription;
          const hasSubscription = Boolean(sub?.active);
          const isApproved = u.approvalStatus === "APPROVED";
          const isRejected = u.approvalStatus === "REJECTED";
          const busy = busyId === u._id;
          return (
            <Card key={u._id} className={`flex flex-col gap-3 border-white/10 text-white sm:flex-row sm:items-center sm:justify-between ${u.disabled ? "opacity-60" : ""}`}>
              <div className="flex min-w-0 items-center gap-3">
                <div className="grid size-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[var(--trust,#3b82f6)] to-[#2563eb] text-sm font-bold text-white">
                  {(u.name || u.email || "?").trim().charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-medium">{u.name}</span>
                    <Badge className="border-white/15 bg-white/5 text-[11px] text-foreground/80">{roleLabel(u.role)}</Badge>
                    {u.role === "CP" && u.cpTier && (
                      <Badge className="border-white/15 bg-white/5 text-[11px] text-foreground/80">{u.cpTier}</Badge>
                    )}
                    {hasSubscription && (
                      <Badge className="border-amber-500/30 bg-amber-500/10 text-[11px] text-amber-300">
                        <Crown size={11} className="mr-1 inline" /> {sub?.label || "Subscribed"}
                      </Badge>
                    )}
                    {u.disabled && <Badge className="border-red-500/30 bg-red-500/10 text-[11px] text-red-300">Deactivated</Badge>}
                    {isApproved && <Badge className="border-emerald-500/30 bg-emerald-500/10 text-[11px] text-emerald-300">Approved</Badge>}
                    {isRejected && <Badge className="border-rose-500/30 bg-rose-500/10 text-[11px] text-rose-300">Rejected</Badge>}
                    {u.approvalStatus === "PENDING" && <Badge className="border-amber-500/30 bg-amber-500/10 text-[11px] text-amber-300">Pending</Badge>}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {u.email}{u.phone ? ` · ${u.phone}` : ""}{u.createdAt ? ` · joined ${formatDate(u.createdAt)}` : ""}
                  </p>
                </div>
              </div>

              <div className="flex shrink-0 flex-wrap items-center gap-2">
                {isAdmin || isSelf ? (
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <ShieldAlert size={13} /> {isSelf ? "You" : "Admin — protected"}
                  </span>
                ) : (
                  <>
                    {isApproved ? (
                      // Already approved — the only status action is to move them
                      // back to Needs Review (unapprove/reject).
                      <Button
                        size="sm"
                        disabled={busy}
                        onClick={() => askReject(u)}
                        className="border border-rose-700/60 bg-transparent text-rose-300 hover:bg-rose-900/25"
                      >
                        Reject
                      </Button>
                    ) : (
                      // Awaiting a decision — approve moves them into the Approved box.
                      <Button
                        size="sm"
                        disabled={busy}
                        onClick={() => askApprove(u)}
                        className="bg-emerald-600 text-white hover:bg-emerald-500"
                      >
                        <CheckCircle2 size={13} className="mr-1" /> Approve
                      </Button>
                    )}
                    {hasSubscription && (
                      <Button size="sm" variant="outline" disabled={busy} onClick={() => askCancelSub(u)}>
                        Cancel subscription
                      </Button>
                    )}
                    {u.disabled ? (
                      <Button size="sm" disabled={busy} onClick={() => askRestore(u)}>
                        Restore
                      </Button>
                    ) : (
                      <Button size="sm" variant="destructive" disabled={busy} onClick={() => askRemove(u)}>
                        Remove
                      </Button>
                    )}
                  </>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      {/* In-app confirmation dialog — replaces the browser's native confirm() */}
      {pending && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget && !confirming) setPending(null); }}
        >
          <div className="w-full max-w-sm overflow-hidden rounded-2xl border border-white/15 bg-[#0d1117] shadow-2xl">
            <div className="flex items-start justify-between border-b border-white/10 px-5 py-4">
              <h2 className="pr-4 text-base font-semibold text-white">{pending.title}</h2>
              <button
                onClick={() => !confirming && setPending(null)}
                aria-label="Close"
                className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-white/10 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>
            <div className="px-5 py-4">
              <p className="text-sm text-muted-foreground">{pending.message}</p>
            </div>
            <div className="flex justify-end gap-2 border-t border-white/10 px-5 py-4">
              <Button size="sm" variant="outline" disabled={confirming} onClick={() => setPending(null)}>
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={confirming}
                onClick={runPending}
                className={
                  pending.tone === "danger"
                    ? "bg-rose-700 text-white hover:bg-rose-600"
                    : pending.tone === "success"
                      ? "bg-emerald-600 text-white hover:bg-emerald-500"
                      : ""
                }
              >
                {confirming && <Loader2 size={13} className="mr-1.5 animate-spin" />}
                {pending.confirmLabel}
              </Button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

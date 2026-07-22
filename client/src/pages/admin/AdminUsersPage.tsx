import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { Card, Badge, Input } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/store/authStore";
import { roleLabel } from "@/lib/rolePaths";
import { formatDate } from "@/lib/utils";
import { toast } from "sonner";
import { ArrowLeft, Search, ShieldAlert, Crown } from "lucide-react";
import type { User, Role } from "@/types";

const ROLE_FILTERS: (Role | "ALL")[] = ["ALL", "DEVELOPER", "CP", "BUYER", "AMBASSADOR", "VERIFIER", "ADMIN"];

export default function AdminUsersPage() {
  const me = useAuthStore((s) => s.user);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<Role | "ALL">("ALL");

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

  async function setDisabled(u: User, disabled: boolean) {
    if (!window.confirm(`${disabled ? "Remove (deactivate)" : "Restore"} ${u.name}? ${disabled ? "They will no longer be able to log in." : "They will be able to log in again."}`)) return;
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

  async function setApproval(u: User, approvalStatus: "APPROVED" | "REJECTED") {
    const verb = approvalStatus === "APPROVED" ? "Approve" : "Reject";
    if (!window.confirm(`${verb} ${u.name}? ${approvalStatus === "REJECTED" ? "They won't be able to log in until approved." : "They'll be able to log in."}`)) return;
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

  async function cancelSubscription(u: User) {
    if (!window.confirm(`Cancel ${u.name}'s subscription? Their active/pending plans will be cancelled and premium removed.`)) return;
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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users.filter((u) => {
      if (roleFilter !== "ALL" && u.role !== roleFilter) return false;
      if (!q) return true;
      return u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || (u.phone || "").includes(q);
    });
  }, [users, query, roleFilter]);

  const counts = useMemo(() => ({
    total: users.length,
    active: users.filter((u) => !u.disabled).length,
    subscribers: users.filter((u) => u.subscription?.active).length,
    pending: users.filter((u) => u.approvalStatus === "PENDING").length,
  }), [users]);

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

      {/* Controls */}
      <div className="mt-6 flex flex-wrap items-center gap-3">
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
        {filtered.length === 0 && <p className="text-sm text-muted-foreground">No users match your filters.</p>}
        {filtered.map((u) => {
          const isSelf = u._id === me?._id;
          const isAdmin = u.role === "ADMIN";
          const sub = u.subscription;
          const hasSubscription = Boolean(sub?.active);
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
                    {u.approvalStatus === "REJECTED" && <Badge className="border-rose-500/30 bg-rose-500/10 text-[11px] text-rose-300">Rejected</Badge>}
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
                    <Button
                      size="sm"
                      disabled={busyId === u._id || u.approvalStatus === "APPROVED"}
                      onClick={() => setApproval(u, "APPROVED")}
                      className={u.approvalStatus === "APPROVED" ? "bg-emerald-600/40 text-emerald-100" : "bg-emerald-600 text-white hover:bg-emerald-500"}
                    >
                      {u.approvalStatus === "APPROVED" ? "Approved" : "Approve"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busyId === u._id || u.approvalStatus === "REJECTED"}
                      onClick={() => setApproval(u, "REJECTED")}
                      className={u.approvalStatus === "REJECTED" ? "border-rose-500 bg-rose-900/40 text-rose-200" : "border-rose-700 text-rose-300 hover:bg-rose-900/20"}
                    >
                      {u.approvalStatus === "REJECTED" ? "Rejected" : "Reject"}
                    </Button>
                    {hasSubscription && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busyId === u._id}
                        onClick={() => cancelSubscription(u)}
                      >
                        Cancel subscription
                      </Button>
                    )}
                    {u.disabled ? (
                      <Button size="sm" disabled={busyId === u._id} onClick={() => setDisabled(u, false)}>
                        Restore
                      </Button>
                    ) : (
                      <Button size="sm" variant="destructive" disabled={busyId === u._id} onClick={() => setDisabled(u, true)}>
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
    </main>
  );
}

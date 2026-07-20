import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { useSocketEvent } from "@/lib/socket";
import { useAuthStore } from "@/store/authStore";
import { formatINR, formatCompactINR, nameOf } from "@/lib/utils";
import { StatCard } from "@/components/ui/stat";
import { Badge } from "@/components/ui/primitives";
import {
  ArrowLeft, CalendarCheck2, ChevronDown, ChevronUp, CircleCheck, CircleDashed,
  FileText, IndianRupee, RefreshCw, Landmark,
} from "lucide-react";
import type { Commission } from "@/types";
import UserMenu from "@/components/UserMenu";

/**
 * Booking Timeline — every confirmed booking (commission record) with its
 * milestone release journey. Role-scoped by the server: CPs see their own,
 * developers see their projects', admin sees all. Live via commission:update.
 */

const STATUS_VARIANT: Record<Commission["status"], "success" | "warning" | "info" | "default"> = {
  PAID: "success",
  MILESTONE_DUE: "warning",
  INVOICED: "info",
  PENDING: "default",
};

export default function BookingsPage() {
  const user = useAuthStore((s) => s.user);
  const [rows, setRows] = useState<Commission[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [releasing, setReleasing] = useState<string | null>(null);

  async function load() {
    try {
      const res = await api.get("/commissions");
      setRows(res.data.commissions ?? []);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to load bookings");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  // Live: milestone releases / new bookings pushed from the server.
  useSocketEvent<Commission>("commission:update", (c) => {
    setRows((prev) => {
      const idx = prev.findIndex((r) => r._id === c._id);
      if (idx === -1) return prev;
      const next = [...prev];
      next[idx] = { ...next[idx], ...c };
      return next;
    });
  });

  const totals = useMemo(() => {
    const gmv = rows.reduce((s, r) => s + r.bookingValue, 0);
    const commission = rows.reduce((s, r) => s + r.cpCommissionAmount, 0);
    const released = rows.reduce(
      (s, r) => s + r.milestones.filter((m) => m.isReleased).reduce((x, m) => x + m.amount, 0),
      0,
    );
    return { gmv, commission, released, paid: rows.filter((r) => r.status === "PAID").length };
  }, [rows]);

  async function releaseMilestone(commissionId: string, milestoneId: string) {
    setReleasing(milestoneId);
    try {
      const res = await api.patch(`/commissions/${commissionId}/milestones`, { milestoneId });
      setRows((prev) => prev.map((r) => (r._id === commissionId ? { ...r, ...res.data.commission } : r)));
      toast.success("Milestone released");
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to release milestone");
    } finally {
      setReleasing(null);
    }
  }

  return (
    <main className="min-h-screen p-6 text-white md:p-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            to={user?.role === "CP" ? "/cp/dashboard" : user?.role === "DEVELOPER" ? "/developer/dashboard" : "/admin/dashboard"}
            className="text-muted-foreground transition-colors hover:text-white"
          >
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold">
              <CalendarCheck2 size={22} className="text-emerald-400" /> Booking Timeline
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">Every booking's journey from confirmation to full payout — live.</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={load} className="rounded-full border border-white/10 bg-white/5 p-2 text-white/70 transition hover:bg-white/10" title="Refresh">
            <RefreshCw size={14} />
          </button>
          <UserMenu />
        </div>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Bookings" value={rows.length} icon={<CalendarCheck2 size={16} />} tone="violet" delay={0} />
        <StatCard label="Booking Value (GMV)" value={totals.gmv} format={formatCompactINR} icon={<Landmark size={16} />} tone="sky" delay={60} />
        <StatCard label="CP Commission" value={totals.commission} format={formatCompactINR} icon={<IndianRupee size={16} />} tone="amber" delay={120} />
        <StatCard label="Released So Far" value={totals.released} format={formatCompactINR} icon={<CircleCheck size={16} />} tone="emerald" foot={`${totals.paid} fully paid`} delay={180} />
      </div>

      {loading ? (
        <div className="mt-6 space-y-3">{[0, 1, 2].map((i) => <div key={i} className="tv-skeleton h-20 rounded-2xl" />)}</div>
      ) : rows.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-white/10 glass p-10 text-center text-sm text-muted-foreground">
          No bookings yet. When a lead is marked Booked and a commission is generated, its timeline appears here.
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {rows.map((c) => {
            const lead = typeof c.leadId === "object" ? c.leadId : null;
            const open = openId === c._id;
            const releasedAmt = c.milestones.filter((m) => m.isReleased).reduce((s, m) => s + m.amount, 0);
            const pct = c.cpCommissionAmount > 0 ? Math.round((releasedAmt / c.cpCommissionAmount) * 100) : 0;
            return (
              <div key={c._id} className="tv-fade-up overflow-hidden rounded-2xl border border-white/10 glass">
                <button
                  onClick={() => setOpenId(open ? null : c._id)}
                  className="flex w-full flex-wrap items-center gap-4 p-4 text-left transition hover:bg-white/[0.03]"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-white">{lead?.clientName ?? "Booking"}</p>
                      <Badge variant={STATUS_VARIANT[c.status]}>{c.status.replace(/_/g, " ")}</Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      CP: {nameOf(c.cpId as any, "—")} · Booked {new Date(c.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-display text-sm font-semibold">{formatINR(c.bookingValue)}</p>
                    <p className="text-[11px] text-muted-foreground">commission {formatINR(c.cpCommissionAmount)}</p>
                  </div>
                  <div className="w-36">
                    <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                      <div className="h-full rounded-full bg-emerald-400 transition-all duration-500" style={{ width: `${pct}%` }} />
                    </div>
                    <p className="mt-1 text-right text-[10px] text-muted-foreground">{pct}% released</p>
                  </div>
                  {open ? <ChevronUp size={16} className="text-white/40" /> : <ChevronDown size={16} className="text-white/40" />}
                </button>

                {open && (
                  <div className="border-t border-white/10 px-5 py-4">
                    {/* Timeline */}
                    <ol className="relative ml-2 space-y-4 border-l border-white/15 pl-5">
                      <li>
                        <span className="absolute -left-[7px] grid h-3.5 w-3.5 place-items-center rounded-full bg-emerald-400" />
                        <p className="text-xs font-semibold text-white">Booking confirmed</p>
                        <p className="text-[11px] text-muted-foreground">
                          {new Date(c.createdAt).toLocaleString("en-IN")} · {formatINR(c.bookingValue)} at {c.commissionPercent}% commission
                          {c.tdsAmount > 0 && <> · TDS {formatINR(c.tdsAmount)}</>}
                        </p>
                      </li>
                      {c.milestones.map((m) => (
                        <li key={m._id}>
                          <span className={`absolute -left-[7px] grid h-3.5 w-3.5 place-items-center rounded-full ${m.isReleased ? "bg-emerald-400" : "bg-white/20"}`} />
                          <div className="flex flex-wrap items-center gap-2">
                            {m.isReleased ? <CircleCheck size={13} className="text-emerald-300" /> : <CircleDashed size={13} className="text-white/40" />}
                            <p className={`text-xs font-semibold ${m.isReleased ? "text-white" : "text-white/60"}`}>{m.label}</p>
                            <span className="text-[11px] text-muted-foreground">{formatINR(m.amount)} ({m.percentOfTotal}%)</span>
                            {m.isReleased && m.releasedAt && (
                              <span className="text-[10px] text-emerald-300/80">released {new Date(m.releasedAt).toLocaleDateString("en-IN")}</span>
                            )}
                            {!m.isReleased && user?.role === "ADMIN" && (
                              <button
                                onClick={() => releaseMilestone(c._id, m._id)}
                                disabled={releasing === m._id}
                                className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-medium text-emerald-300 transition hover:bg-emerald-500/20 disabled:opacity-50"
                              >
                                {releasing === m._id ? "Releasing…" : "Release now"}
                              </button>
                            )}
                          </div>
                        </li>
                      ))}
                      <li>
                        <span className={`absolute -left-[7px] grid h-3.5 w-3.5 place-items-center rounded-full ${c.status === "PAID" ? "bg-emerald-400" : "bg-white/20"}`} />
                        <p className={`text-xs font-semibold ${c.status === "PAID" ? "text-white" : "text-white/50"}`}>
                          {c.status === "PAID" ? "Fully paid out" : "Payout in progress"}
                        </p>
                      </li>
                    </ol>

                    {c.invoiceUrl && (
                      <a href={c.invoiceUrl} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-sky-300 transition hover:bg-white/10">
                        <FileText size={12} /> View invoice ↗
                      </a>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}

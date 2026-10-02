import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clock, XCircle, Receipt, Download, Search } from "lucide-react";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/primitives";
import { StatCard } from "@/components/ui/stat";

interface Payment {
  _id: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  planId: string;
  planLabel: string;
  category: string;
  amountPaise: number;
  gstPaise: number;
  currency: string;
  razorpayOrderId: string | null;
  razorpayPaymentId: string | null;
  status: "CREATED" | "PAID" | "FAILED";
  createdAt: string;
}

const inr = (paise: number) => "₹" + (paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 });
const STATUS_VARIANT: Record<Payment["status"], "success" | "warning" | "danger"> = {
  PAID: "success",
  CREATED: "warning",
  FAILED: "danger",
};

interface Subscription {
  _id: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  planLabel: string;
  interval: string | null;
  basePaise: number;
  gstPaise: number;
  razorpaySubscriptionId: string | null;
  status: "CREATED" | "ACTIVE" | "CANCELLED" | "COMPLETED" | "FAILED";
  createdAt: string;
}

const SUB_VARIANT: Record<Subscription["status"], "success" | "warning" | "danger" | "info"> = {
  ACTIVE: "success",
  CREATED: "warning",
  CANCELLED: "danger",
  COMPLETED: "info",
  FAILED: "danger",
};

type StatusFilter = "ALL" | Payment["status"];

export default function AdminPaymentsPage() {
  const [rows, setRows] = useState<Payment[]>([]);
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [query, setQuery] = useState("");

  useEffect(() => {
    api
      .get("/payments")
      .then((res) => {
        setRows(res.data.payments ?? []);
        setSubs(res.data.subscriptions ?? []);
      })
      .catch(() => {
        setRows([]);
        setSubs([]);
      })
      .finally(() => setLoading(false));
  }, []);

  const totals = useMemo(() => {
    const paid = rows.filter((r) => r.status === "PAID");
    return {
      paid: paid.length,
      pending: rows.filter((r) => r.status === "CREATED").length,
      failed: rows.filter((r) => r.status === "FAILED").length,
      gross: paid.reduce((s, r) => s + r.amountPaise + r.gstPaise, 0),
      gst: paid.reduce((s, r) => s + r.gstPaise, 0),
    };
  }, [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter !== "ALL" && r.status !== statusFilter) return false;
      if (!q) return true;
      return [r.customerName, r.customerEmail, r.customerPhone, r.planLabel, r.razorpayPaymentId ?? ""]
        .some((f) => f?.toLowerCase().includes(q));
    });
  }, [rows, statusFilter, query]);

  function exportCsv() {
    const header = ["Date", "Customer", "Email", "Phone", "Plan", "Category", "Amount", "GST", "Total", "Status", "Payment ID"];
    const lines = filtered.map((r) => [
      new Date(r.createdAt).toLocaleString("en-IN"), r.customerName, r.customerEmail, r.customerPhone,
      r.planLabel, r.category, String(r.amountPaise / 100), String(r.gstPaise / 100),
      String((r.amountPaise + r.gstPaise) / 100), r.status, r.razorpayPaymentId ?? "",
    ]);
    const csv = [header, ...lines].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `truvi-payments-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const TABS: { key: StatusFilter; label: string; count: number }[] = [
    { key: "ALL", label: "All", count: rows.length },
    { key: "PAID", label: "Successful", count: totals.paid },
    { key: "CREATED", label: "Pending", count: totals.pending },
    { key: "FAILED", label: "Failed", count: totals.failed },
  ];

  return (
    <main className="min-h-screen bg-background p-6 text-white md:p-10">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold">Payments</h1>
          <p className="mt-1 text-sm text-muted-foreground">Every Razorpay transaction, newest first.</p>
        </div>
        <button onClick={exportCsv} className="inline-flex items-center gap-2 self-start rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/80 transition hover:bg-white/10">
          <Download size={15} /> Export CSV
        </button>
      </div>

      {/* KPI strip */}
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Successful" value={totals.paid} icon={<CheckCircle2 size={16} />} tone="emerald" delay={0} />
        <StatCard label="Pending" value={totals.pending} icon={<Clock size={16} />} tone="amber" delay={60} />
        <StatCard label="Failed" value={totals.failed} icon={<XCircle size={16} />} tone="rose" delay={120} />
        <StatCard label="Gross Collected" value={totals.gross / 100} format={(n) => "₹" + Math.round(n).toLocaleString("en-IN")} icon={<Receipt size={16} />} tone="violet" foot="incl. GST" delay={180} />
        <StatCard label="GST Collected" value={totals.gst / 100} format={(n) => "₹" + Math.round(n).toLocaleString("en-IN")} icon={<Receipt size={16} />} tone="sky" delay={240} />
      </div>

      {/* Filters */}
      <div className="mt-6 flex flex-wrap items-center gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setStatusFilter(t.key)}
            className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition ${statusFilter === t.key ? "bg-violet-500 text-white" : "border border-white/10 text-white/60 hover:bg-white/10"}`}
          >
            {t.label} <span className="opacity-60">({t.count})</span>
          </button>
        ))}
        <div className="relative ml-auto">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search customer, plan, ID…"
            className="w-64 rounded-full border border-white/10 bg-white/5 py-1.5 pl-9 pr-3 text-xs text-white outline-none focus:border-violet-400/50"
          />
        </div>
      </div>

      <div className="mt-4 overflow-x-auto rounded-lg border border-white/10">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="glass text-muted-foreground">
            <tr>
              <th className="p-3 text-left">Date</th>
              <th className="p-3 text-left">Customer</th>
              <th className="p-3 text-left">Plan</th>
              <th className="p-3 text-left">Category</th>
              <th className="p-3 text-right">Amount</th>
              <th className="p-3 text-right">GST</th>
              <th className="p-3 text-right">Total</th>
              <th className="p-3 text-left">Method</th>
              <th className="p-3 text-left">Status</th>
              <th className="p-3 text-left">Payment ID</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={10} className="p-6 text-center text-muted-foreground">Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={10} className="p-6 text-center text-muted-foreground">No payments match this view.</td></tr>
            ) : (
              filtered.map((r) => (
                <tr key={r._id} className="border-t border-white/10 transition hover:bg-white/[0.03]">
                  <td className="p-3 whitespace-nowrap text-muted-foreground">{new Date(r.createdAt).toLocaleString("en-IN")}</td>
                  <td className="p-3">
                    <div className="font-medium text-white">{r.customerName}</div>
                    <div className="text-xs text-muted-foreground">{r.customerEmail} · {r.customerPhone}</div>
                  </td>
                  <td className="p-3">{r.planLabel}</td>
                  <td className="p-3"><span className="rounded-full bg-white/5 px-2 py-0.5 text-xs text-white/70">{r.category}</span></td>
                  <td className="p-3 text-right whitespace-nowrap tabular-nums">{inr(r.amountPaise)}</td>
                  <td className="p-3 text-right whitespace-nowrap tabular-nums text-muted-foreground">{inr(r.gstPaise)}</td>
                  <td className="p-3 text-right whitespace-nowrap font-medium tabular-nums">{inr(r.amountPaise + r.gstPaise)}</td>
                  <td className="p-3 text-muted-foreground">{r.razorpayPaymentId ? "Razorpay" : "—"}</td>
                  <td className="p-3"><Badge variant={STATUS_VARIANT[r.status]}>{r.status}</Badge></td>
                  <td className="p-3 font-mono text-xs text-muted-foreground">{r.razorpayPaymentId || "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Subscriptions */}
      <h2 className="mt-10 font-display text-xl font-semibold">Subscriptions</h2>
      <div className="mt-3 overflow-x-auto rounded-lg border border-white/10">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="glass text-muted-foreground">
            <tr>
              <th className="p-3 text-left">Date</th>
              <th className="p-3 text-left">Customer</th>
              <th className="p-3 text-left">Plan</th>
              <th className="p-3 text-right">Amount / cycle</th>
              <th className="p-3 text-left">Status</th>
              <th className="p-3 text-left">Subscription ID</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">Loading…</td></tr>
            ) : subs.length === 0 ? (
              <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">No subscriptions yet.</td></tr>
            ) : (
              subs.map((s) => (
                <tr key={s._id} className="border-t border-white/10 transition hover:bg-white/[0.03]">
                  <td className="p-3 whitespace-nowrap text-muted-foreground">{new Date(s.createdAt).toLocaleString("en-IN")}</td>
                  <td className="p-3">
                    <div className="font-medium text-white">{s.customerName}</div>
                    <div className="text-xs text-muted-foreground">{s.customerEmail} · {s.customerPhone}</div>
                  </td>
                  <td className="p-3">{s.planLabel} <span className="text-xs text-muted-foreground">/{s.interval ?? ""}</span></td>
                  <td className="p-3 text-right whitespace-nowrap tabular-nums">{inr(s.basePaise + s.gstPaise)}</td>
                  <td className="p-3"><Badge variant={SUB_VARIANT[s.status]}>{s.status}</Badge></td>
                  <td className="p-3 font-mono text-xs text-muted-foreground">{s.razorpaySubscriptionId || "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}

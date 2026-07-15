import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { Card, Badge } from "@/components/ui/primitives";

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

export default function AdminPaymentsPage() {
  const [rows, setRows] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get("/payments")
      .then((res) => setRows(res.data.payments ?? []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, []);

  const totals = useMemo(() => {
    const paid = rows.filter((r) => r.status === "PAID");
    const gross = paid.reduce((s, r) => s + r.amountPaise + r.gstPaise, 0);
    return { count: paid.length, gross };
  }, [rows]);

  return (
    <main className="min-h-screen bg-background p-6 text-white md:p-10">
      <h1 className="font-display text-2xl font-semibold">Payments</h1>
      <p className="mt-1 text-sm text-muted-foreground">Every Razorpay transaction, newest first.</p>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <Card className="border-white/10 glass">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Successful payments</p>
          <p className="mt-1 font-display text-2xl font-semibold">{totals.count}</p>
        </Card>
        <Card className="border-white/10 glass">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Gross collected (incl. GST)</p>
          <p className="mt-1 font-display text-2xl font-semibold">{inr(totals.gross)}</p>
        </Card>
        <Card className="border-white/10 glass">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Total records</p>
          <p className="mt-1 font-display text-2xl font-semibold">{rows.length}</p>
        </Card>
      </div>

      <div className="mt-6 overflow-x-auto rounded-lg border border-white/10">
        <table className="w-full text-sm">
          <thead className="glass text-muted-foreground">
            <tr>
              <th className="p-3 text-left">Date</th>
              <th className="p-3 text-left">Customer</th>
              <th className="p-3 text-left">Plan</th>
              <th className="p-3 text-right">Amount</th>
              <th className="p-3 text-left">Status</th>
              <th className="p-3 text-left">Payment ID</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">No payments yet.</td></tr>
            ) : (
              rows.map((r) => (
                <tr key={r._id} className="border-t border-white/10">
                  <td className="p-3 whitespace-nowrap text-muted-foreground">{new Date(r.createdAt).toLocaleString("en-IN")}</td>
                  <td className="p-3">
                    <div className="font-medium text-white">{r.customerName}</div>
                    <div className="text-xs text-muted-foreground">{r.customerEmail} · {r.customerPhone}</div>
                  </td>
                  <td className="p-3">{r.planLabel}</td>
                  <td className="p-3 text-right whitespace-nowrap">{inr(r.amountPaise + r.gstPaise)}</td>
                  <td className="p-3"><Badge variant={STATUS_VARIANT[r.status]}>{r.status}</Badge></td>
                  <td className="p-3 font-mono text-xs text-muted-foreground">{r.razorpayPaymentId || "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}

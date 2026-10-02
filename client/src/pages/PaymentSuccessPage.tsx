import { Link, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { CheckCircle2, ArrowRight } from "lucide-react";
import { SiteNav } from "@/components/SiteNav";
import { Button } from "@/components/ui/button";

interface PaymentState {
  planLabel?: string;
  amountPaise?: number;
  paymentId?: string;
  email?: string;
}

const inr = (paise: number) => (paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 });

export default function PaymentSuccessPage() {
  const { state } = useLocation();
  const payment = (state as { payment?: PaymentState } | null)?.payment;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteNav />
      <main className="mx-auto grid max-w-lg place-items-center px-4 pt-32 pb-20 text-center">
        <motion.div initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 200, damping: 16 }}>
          <CheckCircle2 size={64} className="text-emerald-400" />
        </motion.div>
        <h1 className="mt-5 font-display text-3xl font-semibold">Payment successful</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Thank you! Your payment has been received and verified.
          {payment?.email && <> A confirmation has been sent to <span className="text-foreground">{payment.email}</span>.</>}
        </p>

        {payment && (
          <div className="mt-6 w-full rounded-2xl border border-white/10 glass p-5 text-left text-sm">
            {payment.planLabel && (
              <Row label="Item" value={payment.planLabel} />
            )}
            {typeof payment.amountPaise === "number" && (
              <Row label="Amount paid" value={`₹${inr(payment.amountPaise)} (incl. GST)`} />
            )}
            {payment.paymentId && <Row label="Payment ID" value={payment.paymentId} mono />}
          </div>
        )}

        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link to="/">
            <Button variant="outline">Back to home</Button>
          </Link>
          <Link to="/pricing">
            <Button>
              Explore more <ArrowRight size={15} className="ml-1" />
            </Button>
          </Link>
        </div>
      </main>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-white/5 py-2 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className={`text-right text-foreground ${mono ? "font-mono text-xs" : "font-medium"}`}>{value}</span>
    </div>
  );
}

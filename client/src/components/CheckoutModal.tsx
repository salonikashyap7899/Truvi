import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, Lock, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { Input, Label } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { loadRazorpay, openRazorpayCheckout, openRazorpaySubscription } from "@/lib/razorpay";
import { PaymentMethodsRow, RazorpayBadge } from "@/components/PaymentTrust";

export interface CheckoutConfig {
  kind: "order" | "subscription";
  title: string;
  /** one-time: the single plan; subscription: the monthly plan. */
  planId: string;
  priceLabel: string;
  /** subscription only: the yearly alternative. */
  yearlyPlanId?: string;
  yearlyPrice?: string;
}

/** Pre-checkout form → create order/subscription → Razorpay modal → verify → success. */
export default function CheckoutModal({ config, onClose }: { config: CheckoutConfig; onClose: () => void }) {
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", phone: "" });
  const [busy, setBusy] = useState(false);
  const [cycle, setCycle] = useState<"monthly" | "yearly">("monthly");
  const [coupon, setCoupon] = useState("");
  const [couponBusy, setCouponBusy] = useState(false);
  const [applied, setApplied] = useState<{ code: string; discountPaise: number; finalBasePaise: number; label: string } | null>(null);

  const isSub = config.kind === "subscription";
  const activePlanId = isSub && cycle === "yearly" && config.yearlyPlanId ? config.yearlyPlanId : config.planId;
  const activePrice = isSub && cycle === "yearly" && config.yearlyPrice ? config.yearlyPrice : config.priceLabel;
  const inr = (paise: number) => "₹" + (paise / 100).toLocaleString("en-IN");

  async function applyCoupon() {
    const code = coupon.trim();
    if (!code) return;
    setCouponBusy(true);
    try {
      const { data } = await api.post("/vouchers/validate", { code, planId: activePlanId });
      setApplied({ code: data.code, discountPaise: data.discountPaise, finalBasePaise: data.finalBasePaise, label: data.label });
      toast.success(`Voucher ${data.code} applied — you save ${inr(data.discountPaise)}`);
    } catch (err: any) {
      setApplied(null);
      toast.error(err?.response?.data?.error || "That code isn't valid.");
    } finally {
      setCouponBusy(false);
    }
  }

  function toSuccess(payment: unknown) {
    navigate("/payment-success", { state: { payment } });
  }
  function toFailed(reason: string) {
    navigate("/payment-failed", { state: { planTitle: config.title, reason } });
  }

  async function pay(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const ok = await loadRazorpay();
      if (!ok) {
        toast.error("Couldn't load the payment window. Check your connection and retry.");
        setBusy(false);
        return;
      }

      if (isSub) {
        const { data } = await api.post("/payments/create-subscription", { planId: activePlanId, ...form });
        openRazorpaySubscription({
          keyId: data.keyId,
          subscriptionId: data.subscriptionId,
          name: form.name,
          description: `${config.title} (${cycle})`,
          prefill: data.prefill,
          onSuccess: async (r) => {
            try {
              const verify = await api.post("/payments/verify-subscription", r);
              toSuccess(verify.data.payment);
            } catch {
              toFailed("verification");
            }
          },
          onDismiss: () => {
            setBusy(false);
            toast("Payment window closed.", { description: "You can retry any time." });
          },
        });
      } else {
        const { data } = await api.post("/payments/create-order", { planId: activePlanId, ...form, voucherCode: applied?.code });
        openRazorpayCheckout({
          keyId: data.keyId,
          orderId: data.orderId,
          amount: data.amount,
          name: form.name,
          description: config.title,
          prefill: data.prefill,
          onSuccess: async (r) => {
            try {
              const verify = await api.post("/payments/verify", r);
              toSuccess(verify.data.payment);
            } catch {
              toFailed("verification");
            }
          },
          onDismiss: () => {
            setBusy(false);
            toast("Payment window closed.", { description: "You can retry any time." });
          },
        });
      }
    } catch (err: any) {
      setBusy(false);
      toast.error(err?.response?.data?.error || "Could not start payment. Please try again.");
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] grid place-items-center bg-black/70 p-4 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, y: 16, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.98 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-md rounded-3xl border border-white/10 bg-[#0a0d14]/95 p-6 shadow-2xl shadow-black/60"
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{isSub ? "Subscribe" : "Checkout"}</p>
              <h3 className="mt-1 font-display text-xl font-semibold text-white">{config.title}</h3>
              <p className="mt-0.5 text-sm text-[var(--trust)]">
                {activePrice}
                {isSub && <span className="text-muted-foreground">/{cycle === "yearly" ? "year" : "month"}</span>}{" "}
                <span className="text-muted-foreground">+ 18% GST</span>
              </p>
            </div>
            <button onClick={onClose} aria-label="Close" className="grid size-9 place-items-center rounded-full border border-white/15 text-foreground/80 hover:bg-white/10">
              <X size={16} />
            </button>
          </div>

          {/* Billing cycle toggle (subscriptions with a yearly option) */}
          {isSub && config.yearlyPlanId && (
            <div className="mt-4 inline-flex w-full rounded-full border border-white/10 glass p-1">
              {(["monthly", "yearly"] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCycle(c)}
                  className={`flex-1 rounded-full py-1.5 text-sm font-medium capitalize transition-colors ${
                    cycle === c ? "bg-[var(--trust)] text-white" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          )}

          <form onSubmit={pay} className="mt-5 space-y-3">
            <div>
              <Label className="text-foreground/90">Full name</Label>
              <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="border-white/15 bg-card text-white" placeholder="Your name" />
            </div>
            <div>
              <Label className="text-foreground/90">Email</Label>
              <Input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="border-white/15 bg-card text-white" placeholder="you@email.com" />
            </div>
            <div>
              <Label className="text-foreground/90">Phone</Label>
              <Input required value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="border-white/15 bg-card text-white" placeholder="10-digit mobile" />
            </div>

            {/* Voucher / coupon code — one-time purchases only. The discount is
                validated and applied by the server; the client only previews. */}
            {!isSub && (
              <div>
                <Label className="text-foreground/90">Voucher code <span className="text-muted-foreground">(optional)</span></Label>
                {applied ? (
                  <div className="mt-1 flex items-center justify-between rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-sm">
                    <span className="text-emerald-200"><b>{applied.code}</b> applied · you save {inr(applied.discountPaise)}</span>
                    <button type="button" onClick={() => { setApplied(null); setCoupon(""); }} className="text-xs text-emerald-300/80 underline hover:text-emerald-200">Remove</button>
                  </div>
                ) : (
                  <div className="mt-1 flex gap-2">
                    <Input value={coupon} onChange={(e) => setCoupon(e.target.value.toUpperCase())} className="border-white/15 bg-card uppercase text-white" placeholder="Enter code" />
                    <Button type="button" variant="outline" onClick={applyCoupon} disabled={couponBusy || !coupon.trim()} className="shrink-0">
                      {couponBusy ? <Loader2 size={15} className="animate-spin" /> : "Apply"}
                    </Button>
                  </div>
                )}
              </div>
            )}

            {applied && (
              <p className="text-right text-sm text-foreground/80">
                <span className="text-muted-foreground line-through">{activePrice}</span>{" "}
                <span className="font-semibold text-emerald-300">{inr(applied.finalBasePaise)}</span>
                <span className="text-muted-foreground"> + 18% GST</span>
              </p>
            )}

            <Button type="submit" disabled={busy} className="mt-2 w-full" size="lg">
              {busy ? <Loader2 size={16} className="mr-2 animate-spin" /> : <Lock size={15} className="mr-2" />}
              {busy ? "Starting secure payment…" : isSub ? `Subscribe · ${activePrice}` : `Pay ${applied ? inr(applied.finalBasePaise) : activePrice}`}
            </Button>
          </form>

          {isSub && (
            <p className="mt-3 text-center text-[11px] text-muted-foreground">
              Auto-renews every {cycle === "yearly" ? "year" : "month"}. Cancel any time.
            </p>
          )}

          <div className="mt-4 flex flex-col items-center gap-2">
            <PaymentMethodsRow />
            <RazorpayBadge />
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

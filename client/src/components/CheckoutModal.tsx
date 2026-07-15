import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, Lock, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { Input, Label } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { loadRazorpay, openRazorpayCheckout } from "@/lib/razorpay";
import { PaymentMethodsRow, RazorpayBadge } from "@/components/PaymentTrust";

interface Props {
  planId: string;
  planTitle: string;
  priceLabel: string;
  onClose: () => void;
}

/** Pre-checkout form → create order → Razorpay modal → verify → success page. */
export default function CheckoutModal({ planId, planTitle, priceLabel, onClose }: Props) {
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", phone: "" });
  const [busy, setBusy] = useState(false);

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

      const { data } = await api.post("/payments/create-order", { planId, ...form });

      openRazorpayCheckout({
        keyId: data.keyId,
        orderId: data.orderId,
        amount: data.amount,
        name: form.name,
        description: planTitle,
        prefill: data.prefill,
        onSuccess: async (r) => {
          try {
            const verify = await api.post("/payments/verify", r);
            navigate("/payment-success", { state: { payment: verify.data.payment } });
          } catch {
            navigate("/payment-failed", { state: { planId, planTitle, reason: "verification" } });
          }
        },
        onDismiss: () => {
          setBusy(false);
          toast("Payment window closed.", { description: "You can retry any time." });
        },
      });
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
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Checkout</p>
              <h3 className="mt-1 font-display text-xl font-semibold text-white">{planTitle}</h3>
              <p className="mt-0.5 text-sm text-[var(--trust)]">{priceLabel} <span className="text-muted-foreground">+ 18% GST</span></p>
            </div>
            <button onClick={onClose} aria-label="Close" className="grid size-9 place-items-center rounded-full border border-white/15 text-foreground/80 hover:bg-white/10">
              <X size={16} />
            </button>
          </div>

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

            <Button type="submit" disabled={busy} className="mt-2 w-full" size="lg">
              {busy ? <Loader2 size={16} className="mr-2 animate-spin" /> : <Lock size={15} className="mr-2" />}
              {busy ? "Starting secure payment…" : `Pay ${priceLabel}`}
            </Button>
          </form>

          <div className="mt-4 flex flex-col items-center gap-2">
            <PaymentMethodsRow />
            <RazorpayBadge />
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

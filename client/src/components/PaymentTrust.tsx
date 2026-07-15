import { ShieldCheck } from "lucide-react";

/** Accepted payment methods, as lightweight text chips (no external images so
 *  the strict CSP / offline build stays self-contained). */
export function PaymentMethodsRow() {
  const methods = ["UPI", "Visa", "Mastercard", "RuPay", "Netbanking"];
  return (
    <div className="flex flex-wrap items-center justify-center gap-1.5">
      {methods.map((m) => (
        <span
          key={m}
          className="rounded-md border border-white/12 bg-white/5 px-2 py-1 text-[11px] font-medium tracking-wide text-foreground/75"
        >
          {m}
        </span>
      ))}
    </div>
  );
}

/** "Secured by Razorpay" trust badge shown near checkout. */
export function RazorpayBadge() {
  return (
    <p className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
      <ShieldCheck size={13} className="text-emerald-400" />
      256-bit secure payments · Secured by <span className="font-semibold text-foreground/80">Razorpay</span>
    </p>
  );
}

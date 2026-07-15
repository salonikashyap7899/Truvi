/** Loads the Razorpay Checkout script once and resolves when ready. */
let scriptPromise: Promise<boolean> | null = null;

export function loadRazorpay(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if ((window as any).Razorpay) return Promise.resolve(true);
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<boolean>((resolve) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(true);
    script.onerror = () => {
      scriptPromise = null;
      resolve(false);
    };
    document.body.appendChild(script);
  });
  return scriptPromise;
}

export interface RazorpayHandlerResponse {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

export interface OpenCheckoutOptions {
  keyId: string;
  orderId: string;
  amount: number; // paise
  name: string;
  description: string;
  prefill: { name: string; email: string; contact: string };
  onSuccess: (r: RazorpayHandlerResponse) => void;
  onDismiss: () => void;
}

/** Opens the Razorpay Standard Checkout modal. */
export function openRazorpayCheckout(opts: OpenCheckoutOptions) {
  const Razorpay = (window as any).Razorpay;
  const rzp = new Razorpay({
    key: opts.keyId,
    order_id: opts.orderId,
    amount: opts.amount,
    currency: "INR",
    name: "Truvi Ventures",
    description: opts.description,
    image: "/brand/icon.png",
    prefill: opts.prefill,
    theme: { color: "#3B82F6" },
    handler: opts.onSuccess,
    modal: { ondismiss: opts.onDismiss },
  });
  rzp.on("payment.failed", () => {
    // Surface a failed attempt to the caller as a dismissal so they can retry.
    opts.onDismiss();
  });
  rzp.open();
}

export interface OpenSubscriptionOptions {
  keyId: string;
  subscriptionId: string;
  name: string;
  description: string;
  prefill: { name: string; email: string; contact: string };
  onSuccess: (r: { razorpay_payment_id: string; razorpay_subscription_id: string; razorpay_signature: string }) => void;
  onDismiss: () => void;
}

/** Opens the Razorpay modal for a recurring subscription (subscription_id, no amount). */
export function openRazorpaySubscription(opts: OpenSubscriptionOptions) {
  const Razorpay = (window as any).Razorpay;
  const rzp = new Razorpay({
    key: opts.keyId,
    subscription_id: opts.subscriptionId,
    name: "Truvi Ventures",
    description: opts.description,
    image: "/brand/icon.png",
    prefill: opts.prefill,
    theme: { color: "#3B82F6" },
    handler: opts.onSuccess,
    modal: { ondismiss: opts.onDismiss },
  });
  rzp.on("payment.failed", () => opts.onDismiss());
  rzp.open();
}

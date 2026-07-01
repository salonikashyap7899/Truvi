import { useState } from "react";
import { Card, Badge } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { formatINR } from "@/lib/utils";
import { toast } from "sonner";
import { useAuthStore } from "@/store/authStore";

const LEAD_PRICES = { BASIC: 300, QUALIFIED: 1000, SITE_VISIT: 3000 } as const;
const CP_PREMIUM_MONTHLY_PRICE = 1999;

type LeadType = keyof typeof LEAD_PRICES;

export default function MarketplacePage() {
  const user = useAuthStore((s) => s.user);
  const [loading, setLoading] = useState<string | null>(null);
  const [premium, setPremium] = useState(user?.cpProfile?.isPremium || false);

  /**
   * Full Razorpay checkout flow: create order server-side, open Razorpay
   * Checkout, verify the signature server-side, then confirm the purchase.
   * If RAZORPAY_KEY_ID isn't configured on the backend, the order comes
   * back marked `simulated: true` and we skip straight to confirmation —
   * same graceful-degrade behavior as the rest of the revenue layer.
   */
  async function purchase(leadType: LeadType) {
    setLoading(leadType);
    try {
      const orderRes = await api.post("/marketplace/create-order", { leadType });
      const { order, keyId } = orderRes.data;

      if (order.simulated || !keyId) {
        await api.post("/marketplace/confirm", { leadType });
        toast.success("Lead purchased and assigned to you! (simulated payment — no live Razorpay keys configured)");
        setLoading(null);
        return;
      }

      // Live Razorpay checkout — requires the checkout.js script and real test-mode keys.
      const options = {
        key: keyId,
        amount: order.amount,
        currency: order.currency,
        order_id: order.id,
        name: "Truvi",
        description: `${leadType} lead purchase`,
        handler: async (response: any) => {
          await api.post("/marketplace/confirm", {
            leadType,
            razorpayOrderId: response.razorpay_order_id,
            razorpayPaymentId: response.razorpay_payment_id,
            razorpaySignature: response.razorpay_signature,
          });
          toast.success("Payment confirmed — lead assigned to you!");
        },
      };
      const rzp = new (window as any).Razorpay(options);
      rzp.open();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Purchase failed");
    } finally {
      setLoading(null);
    }
  }

  async function togglePremium() {
    setLoading("premium");
    try {
      if (premium) {
        await api.delete("/premium/subscribe");
        setPremium(false);
        toast.success("Premium cancelled");
      } else {
        await api.post("/premium/subscribe");
        setPremium(true);
        toast.success("Welcome to Premium!");
      }
    } catch {
      toast.error("Action failed");
    } finally {
      setLoading(null);
    }
  }

  return (
    <main className="min-h-screen bg-[#0B1220] p-6 text-white md:p-10">
      <h1 className="text-2xl font-semibold">Lead Marketplace</h1>
      <p className="mt-1 text-sm text-neutral-400">Purchase leads directly, or subscribe to Premium for priority access.</p>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {(Object.keys(LEAD_PRICES) as LeadType[]).map((type) => (
          <Card key={type} className="border-neutral-800 bg-[#121A2B] text-white">
            <Badge variant="info">{type.replace("_", " ")}</Badge>
            <p className="mt-2 text-2xl font-semibold">{formatINR(LEAD_PRICES[type])}</p>
            <p className="mt-1 text-xs text-neutral-500">Real Razorpay checkout if configured, simulated otherwise.</p>
            <Button className="mt-4 w-full" disabled={loading === type} onClick={() => purchase(type)}>
              {loading === type ? "Processing…" : "Purchase"}
            </Button>
          </Card>
        ))}
      </div>

      <section className="mt-10">
        <h2 className="text-lg font-medium">CP Premium Membership</h2>
        <Card className="mt-3 max-w-md border-neutral-800 bg-[#121A2B] text-white">
          <p className="text-2xl font-semibold">{formatINR(CP_PREMIUM_MONTHLY_PRICE)}<span className="text-sm text-neutral-400">/month</span></p>
          <ul className="mt-3 space-y-1 text-sm text-neutral-400">
            <li>· Priority badge on the leaderboard</li>
            <li>· Priority placement in lead-assignment queue</li>
            <li>· Premium tag on your profile</li>
          </ul>
          <Button className="mt-4 w-full" variant={premium ? "outline" : "primary"} disabled={loading === "premium"} onClick={togglePremium}>
            {loading === "premium" ? "…" : premium ? "Cancel Premium" : "Subscribe to Premium"}
          </Button>
        </Card>
      </section>
    </main>
  );
}

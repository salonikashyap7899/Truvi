import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/primitives";
import { CreditCard } from "lucide-react";

interface Plan {
  _id: string;
  kind: "one_time" | "subscription";
  label: string;
  category: string;
  amountPaise: number;
  status: string;
  interval: string | null;
  purchasedAt: string;
  expiresAt: string | null;
}

/**
 * "My Plans" — the signed-in user's purchases and subscriptions with their buy
 * date and expiry date. Renders nothing until there's at least one plan, so it
 * stays invisible on dashboards for users who haven't bought anything.
 */
export function MyPlans() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    api
      .get("/payments/mine")
      .then((res) => setPlans(res.data.plans || []))
      .catch(() => setPlans([]))
      .finally(() => setLoaded(true));
  }, []);

  if (!loaded || plans.length === 0) return null;

  return (
    <section className="mt-10">
      <h2 className="flex items-center gap-2 text-lg font-medium">
        <CreditCard size={18} /> My plans &amp; subscriptions
      </h2>
      <div className="mt-3 overflow-x-auto rounded-xl border border-white/10 glass">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-muted-foreground">
            <tr className="border-b border-white/10">
              <th className="px-4 py-3">Plan</th>
              <th className="px-4 py-3">Amount</th>
              <th className="px-4 py-3">Purchased</th>
              <th className="px-4 py-3">Expires</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {plans.map((p) => {
              const expired = p.expiresAt ? new Date(p.expiresAt).getTime() < Date.now() : false;
              return (
                <tr key={p._id} className="border-b border-white/5 last:border-0">
                  <td className="px-4 py-3">
                    <p className="font-medium text-white">{p.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {p.kind === "subscription" ? "Subscription" : "One-time"}
                      {p.interval ? ` · ${p.interval}` : ""}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-white">
                    ₹{(p.amountPaise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{formatDate(p.purchasedAt)}</td>
                  <td className="px-4 py-3">
                    {p.expiresAt ? (
                      <span className={expired ? "text-red-400" : "text-muted-foreground"}>
                        {formatDate(p.expiresAt)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={expired ? "danger" : p.status === "ACTIVE" || p.status === "PAID" ? "success" : "warning"}>
                      {expired ? "EXPIRED" : p.status}
                    </Badge>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

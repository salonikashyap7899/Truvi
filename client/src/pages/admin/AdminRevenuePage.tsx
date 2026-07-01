import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card, CardTitle, CardValue } from "@/components/ui/primitives";
import { formatINR } from "@/lib/utils";

interface RevenueData {
  platformFeeRevenue: number;
  leadServiceRevenue: number;
  leadPurchaseCount: number;
  premiumRevenue: number;
  premiumCount: number;
  featuredRevenueEstimate: number;
  featuredCount: number;
  totalRevenue: number;
  target: { platformFee: number; featuredListings: number; leadAsAService: number; premiumMembership: number; referralOther: number };
}

export default function AdminRevenuePage() {
  const [data, setData] = useState<RevenueData | null>(null);

  useEffect(() => {
    api.get("/revenue").then((res) => setData(res.data));
  }, []);

  if (!data) return <div className="min-h-screen bg-[#0B1220] p-10 text-white">Loading…</div>;

  const rows = [
    { label: "Developer Commission-Linked Platform Fee", actual: data.platformFeeRevenue, target: data.target.platformFee },
    { label: "Featured Listings", actual: data.featuredRevenueEstimate, target: data.target.featuredListings },
    { label: "Lead-as-a-Service", actual: data.leadServiceRevenue, target: data.target.leadAsAService },
    { label: "Premium Membership", actual: data.premiumRevenue, target: data.target.premiumMembership },
  ];

  return (
    <main className="min-h-screen bg-[#0B1220] p-6 text-white md:p-10">
      <h1 className="text-2xl font-semibold">Revenue Dashboard</h1>
      <p className="mt-1 text-sm text-neutral-400">Founder&apos;s command center — ecosystem revenue, computed live from the database.</p>

      <Card className="mt-6 border-neutral-800 bg-[#121A2B] text-white">
        <CardTitle className="text-neutral-400">Total Platform Revenue (live)</CardTitle>
        <CardValue className="text-3xl">{formatINR(data.totalRevenue)}</CardValue>
      </Card>

      <div className="mt-6 space-y-4">
        {rows.map((r) => {
          const pct = data.totalRevenue > 0 ? Math.round((r.actual / data.totalRevenue) * 100) : 0;
          return (
            <Card key={r.label} className="border-neutral-800 bg-[#121A2B] text-white">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">{r.label}</p>
                <p className="text-sm text-neutral-400">target {r.target}%</p>
              </div>
              <p className="mt-1 text-xl font-semibold">{formatINR(r.actual)}</p>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-neutral-800">
                <div className="h-full bg-blue-500" style={{ width: `${Math.min(pct, 100)}%` }} />
              </div>
              <p className="mt-1 text-xs text-neutral-500">{pct}% of current total</p>
            </Card>
          );
        })}
        <Card className="border-neutral-800 bg-[#121A2B] text-white opacity-60">
          <p className="text-sm font-medium">Referral/Other (Home Loan & Insurance)</p>
          <p className="mt-1 text-xs text-neutral-500">Target {data.target.referralOther}% — not yet active, placeholder line only</p>
        </Card>
      </div>

      <p className="mt-8 text-xs text-neutral-500">{data.leadPurchaseCount} leads purchased to date · {data.premiumCount} Premium CPs · {data.featuredCount} Featured projects</p>
    </main>
  );
}

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { Card, CardTitle, CardValue } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { NotificationBell } from "@/components/NotificationBell";
import UserMenu from "@/components/UserMenu";
import { formatINR, nameOf } from "@/lib/utils";
import { toast } from "sonner";
import type { Project } from "@/types";

interface InvestorMetrics {
  totalBuyers: number;
  totalDevelopers: number;
  totalCPs: number;
  activeUsers: number;
  newUsers30d: number;
  mrrPaise: number;
  arrPaise: number;
  totalRevenuePaise: number;
  ltvPaise: number;
  cacPaise: number;
  churnPercent: number;
  conversionPercent: number;
  payingUsers: number;
  gmvPaise: number;
}

const paise = (p: number) => formatINR(Math.round(p / 100));

export default function AdminDashboardPage() {
  const [pendingProjects, setPendingProjects] = useState<Project[]>([]);
  const [stats, setStats] = useState({ totalUsers: 0, totalProjects: 0, platformFees: 0, cpCommissions: 0 });
  const [investor, setInvestor] = useState<InvestorMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    const [projectsRes, revenueRes, allUsersRes, allProjectsRes] = await Promise.all([
      api.get("/admin/projects", { params: { approvalStatus: "PENDING" } }),
      api.get("/revenue"),
      api.get("/admin/users"),
      api.get("/admin/projects"),
    ]);
    setPendingProjects(projectsRes.data.projects);
    setStats({
      totalUsers: allUsersRes.data.users.length,
      totalProjects: allProjectsRes.data.projects.length,
      platformFees: revenueRes.data.platformFeeRevenue,
      cpCommissions: revenueRes.data.leadServiceRevenue,
    });
    api.get("/admin/investor-metrics").then((res) => setInvestor(res.data.metrics)).catch(() => {});
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function approveProject(projectId: string, approvalStatus: "APPROVED" | "REJECTED") {
    await api.patch("/admin/projects", { projectId, approvalStatus });
    toast.success(`Project ${approvalStatus.toLowerCase()}`);
    load();
  }

  if (loading) return <div className="min-h-screen p-10 text-white">Loading…</div>;

  return (
    <main className="min-h-screen p-6 text-white md:p-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Admin Command Center</h1>
          <p className="mt-1 text-sm text-muted-foreground">Platform-wide oversight: listings, verification, revenue.</p>
        </div>
        <div className="flex items-center gap-3">
          <NotificationBell />
          <UserMenu />
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-white/10 glass text-white">
          <CardTitle className="text-muted-foreground">Total Users</CardTitle>
          <CardValue>{stats.totalUsers}</CardValue>
        </Card>
        <Card className="border-white/10 glass text-white">
          <CardTitle className="text-muted-foreground">Total Projects</CardTitle>
          <CardValue>{stats.totalProjects}</CardValue>
        </Card>
        <Card className="border-white/10 glass text-white">
          <CardTitle className="text-muted-foreground">Platform Fee Revenue</CardTitle>
          <CardValue>{formatINR(stats.platformFees)}</CardValue>
        </Card>
        <Card className="border-white/10 glass text-white">
          <CardTitle className="text-muted-foreground">Lead Marketplace Revenue</CardTitle>
          <CardValue>{formatINR(stats.cpCommissions)}</CardValue>
        </Card>
      </div>

      {/* Investor metrics — the live valuation-driving numbers */}
      {investor && (
        <section className="mt-10">
          <h2 className="text-lg font-medium">Investor metrics <span className="text-xs text-muted-foreground">— live SaaS + marketplace numbers</span></h2>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Card className="border-white/10 glass"><CardTitle>Total Buyers</CardTitle><CardValue className="text-lg">{investor.totalBuyers}</CardValue></Card>
            <Card className="border-white/10 glass"><CardTitle>Total Developers</CardTitle><CardValue className="text-lg">{investor.totalDevelopers}</CardValue></Card>
            <Card className="border-white/10 glass"><CardTitle>Total CPs</CardTitle><CardValue className="text-lg">{investor.totalCPs}</CardValue></Card>
            <Card className="border-white/10 glass"><CardTitle>Active Users</CardTitle><CardValue className="text-lg">{investor.activeUsers}</CardValue></Card>
            <Card className="border-white/10 glass"><CardTitle>Paying Users</CardTitle><CardValue className="text-lg">{investor.payingUsers}</CardValue></Card>
            <Card className="border-white/10 glass"><CardTitle>New Users (30d)</CardTitle><CardValue className="text-lg">{investor.newUsers30d}</CardValue></Card>
            <Card className="border-emerald-500/30 glass"><CardTitle>MRR</CardTitle><CardValue className="text-lg text-emerald-400">{paise(investor.mrrPaise)}</CardValue></Card>
            <Card className="border-emerald-500/30 glass"><CardTitle>ARR</CardTitle><CardValue className="text-lg text-emerald-400">{paise(investor.arrPaise)}</CardValue></Card>
            <Card className="border-white/10 glass"><CardTitle>Total Revenue</CardTitle><CardValue className="text-lg">{paise(investor.totalRevenuePaise)}</CardValue></Card>
            <Card className="border-white/10 glass"><CardTitle>LTV / CAC</CardTitle><CardValue className="text-lg">{paise(investor.ltvPaise)} / {paise(investor.cacPaise)}</CardValue></Card>
            <Card className="border-white/10 glass"><CardTitle>Churn</CardTitle><CardValue className="text-lg">{investor.churnPercent}%</CardValue></Card>
            <Card className="border-white/10 glass"><CardTitle>Conversion Rate</CardTitle><CardValue className="text-lg">{investor.conversionPercent}%</CardValue></Card>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">GMV (booking value routed through Truvi): {paise(investor.gmvPaise)}</p>
        </section>
      )}

      <section className="mt-10">
        <h2 className="text-lg font-medium">Pending project approvals ({pendingProjects.length})</h2>
        <div className="mt-3 space-y-3">
          {pendingProjects.length === 0 && <p className="text-sm text-muted-foreground">Nothing pending.</p>}
          {pendingProjects.map((p) => (
            <Card key={p._id} className="flex flex-wrap items-center justify-between gap-3 border-white/10 glass text-white">
              <div className="min-w-0">
                <p className="font-medium">{p.name}</p>
                <p className="text-sm text-muted-foreground">{p.city} · by {nameOf(p.developerId)}</p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => approveProject(p._id, "APPROVED")}>Approve</Button>
                <Button size="sm" variant="destructive" onClick={() => approveProject(p._id, "REJECTED")}>Reject</Button>
              </div>
            </Card>
          ))}
        </div>
      </section>

      <div className="mt-10 flex flex-wrap gap-4 text-sm">
        <Link to="/admin/listings" className="text-blue-400 hover:underline">Manage inventory listings →</Link>
        <Link to="/admin/enquiries" className="text-blue-400 hover:underline">Enquiry inbox →</Link>
        <Link to="/admin/kyc" className="text-blue-400 hover:underline">CP identity verification →</Link>
        <Link to="/admin/revenue" className="text-blue-400 hover:underline">Revenue dashboard →</Link>
        <Link to="/admin/ambassador-tasks" className="text-blue-400 hover:underline">Ambassador tasks →</Link>
        <Link to="/admin/settings" className="text-blue-400 hover:underline">Platform settings →</Link>
      </div>
    </main>
  );
}

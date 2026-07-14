import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { Card, CardTitle, CardValue } from "@/components/ui/primitives";
import { NotificationBell } from "@/components/NotificationBell";
import UserMenu from "@/components/UserMenu";
import { formatINR } from "@/lib/utils";
import { toast } from "sonner";

interface FounderStats {
  totalUsers: number;
  totalProjects: number;
  platformFeeRevenue: number;
  leadServiceRevenue: number;
}

export default function FounderDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<FounderStats>({
    totalUsers: 0,
    totalProjects: 0,
    platformFeeRevenue: 0,
    leadServiceRevenue: 0,
  });

  async function load() {
    try {
      const [adminUsersRes, adminProjectsRes, revenueRes] = await Promise.all([
        api.get("/admin/users"),
        api.get("/admin/projects"),
        api.get("/revenue"),
      ]);
      setStats({
        totalUsers: adminUsersRes.data.users.length,
        totalProjects: adminProjectsRes.data.projects.length,
        platformFeeRevenue: revenueRes.data.platformFeeRevenue,
        leadServiceRevenue: revenueRes.data.leadServiceRevenue,
      });
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to load founder dashboard");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  if (loading) return <div className="min-h-screen p-10 text-white">Loading founder dashboard…</div>;

  return (
    <main className="min-h-screen p-6 text-white md:p-10">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Founder Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Welcome back to Truvi&apos;s founder command center.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <NotificationBell />
          <UserMenu />
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-white/10 glass text-white">
          <CardTitle className="text-muted-foreground">Total Active Users</CardTitle>
          <CardValue>{stats.totalUsers}</CardValue>
        </Card>
        <Card className="border-white/10 glass text-white">
          <CardTitle className="text-muted-foreground">Total Approved Projects</CardTitle>
          <CardValue>{stats.totalProjects}</CardValue>
        </Card>
        <Card className="border-white/10 glass text-white">
          <CardTitle className="text-muted-foreground">Platform Fee Revenue</CardTitle>
          <CardValue>{formatINR(stats.platformFeeRevenue)}</CardValue>
        </Card>
        <Card className="border-white/10 glass text-white">
          <CardTitle className="text-muted-foreground">Lead Service Revenue</CardTitle>
          <CardValue>{formatINR(stats.leadServiceRevenue)}</CardValue>
        </Card>
      </div>

      <section className="mt-10">
        <h2 className="text-lg font-medium">Founder shortcuts</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Link
            to="/admin/dashboard"
            className="rounded-3xl border border-white/10 bg-white/5 p-5 text-left transition hover:border-white/20 hover:bg-white/10"
          >
            <p className="text-sm font-semibold">Admin overview</p>
            <p className="mt-2 text-xs text-muted-foreground">See platform approvals, users, projects and key metrics.</p>
          </Link>
          <Link
            to="/admin/revenue"
            className="rounded-3xl border border-white/10 bg-white/5 p-5 text-left transition hover:border-white/20 hover:bg-white/10"
          >
            <p className="text-sm font-semibold">Revenue command center</p>
            <p className="mt-2 text-xs text-muted-foreground">View the latest platform revenue and growth signals.</p>
          </Link>
          <Link
            to="/admin/listings"
            className="rounded-3xl border border-white/10 bg-white/5 p-5 text-left transition hover:border-white/20 hover:bg-white/10"
          >
            <p className="text-sm font-semibold">Project listings</p>
            <p className="mt-2 text-xs text-muted-foreground">Manage featured, verified and prime inventory listings.</p>
          </Link>
          <Link
            to="/admin/enquiries"
            className="rounded-3xl border border-white/10 bg-white/5 p-5 text-left transition hover:border-white/20 hover:bg-white/10"
          >
            <p className="text-sm font-semibold">Enquiry inbox</p>
            <p className="mt-2 text-xs text-muted-foreground">Review all incoming buyer and partner enquiries.</p>
          </Link>
          <Link
            to="/admin/settings"
            className="rounded-3xl border border-white/10 bg-white/5 p-5 text-left transition hover:border-white/20 hover:bg-white/10"
          >
            <p className="text-sm font-semibold">Platform settings</p>
            <p className="mt-2 text-xs text-muted-foreground">Adjust fees and configuration at the platform level.</p>
          </Link>
        </div>
      </section>
    </main>
  );
}

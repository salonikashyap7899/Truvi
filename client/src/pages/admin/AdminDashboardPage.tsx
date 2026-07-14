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

export default function AdminDashboardPage() {
  const [pendingProjects, setPendingProjects] = useState<Project[]>([]);
  const [stats, setStats] = useState({ totalUsers: 0, totalProjects: 0, platformFees: 0, cpCommissions: 0 });
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
        <Link to="/admin/revenue" className="text-blue-400 hover:underline">Revenue dashboard →</Link>
        <Link to="/admin/ambassador-tasks" className="text-blue-400 hover:underline">Ambassador tasks →</Link>
        <Link to="/admin/settings" className="text-blue-400 hover:underline">Platform settings →</Link>
      </div>
    </main>
  );
}

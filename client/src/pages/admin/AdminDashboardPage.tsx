import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { Card, CardTitle, CardValue, Badge } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { NotificationBell } from "@/components/NotificationBell";
import { formatINR, nameOf } from "@/lib/utils";
import { useSocketEvent } from "@/lib/socket";
import { toast } from "sonner";
import type { User, Project } from "@/types";

export default function AdminDashboardPage() {
  const [pendingUsers, setPendingUsers] = useState<User[]>([]);
  const [pendingProjects, setPendingProjects] = useState<Project[]>([]);
  const [stats, setStats] = useState({ totalUsers: 0, totalProjects: 0, platformFees: 0, cpCommissions: 0 });
  const [loading, setLoading] = useState(true);

  async function load() {
    const [usersRes, projectsRes, revenueRes, allUsersRes, allProjectsRes] = await Promise.all([
      api.get("/admin/users", { params: { approvalStatus: "PENDING" } }),
      api.get("/admin/projects", { params: { approvalStatus: "PENDING" } }),
      api.get("/revenue"),
      api.get("/admin/users"),
      api.get("/admin/projects"),
    ]);
    setPendingUsers(usersRes.data.users);
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

  // Real-time: new signup appears instantly in the pending list
  useSocketEvent<User>("user:pending", (newUser) => {
    setPendingUsers((prev) => {
      if (prev.some((u) => u._id === newUser._id)) return prev;
      return [newUser, ...prev];
    });
    setStats((s) => ({ ...s, totalUsers: s.totalUsers + 1 }));
    toast.info(`New account pending approval: ${newUser.name}`);
  });

  async function approveUser(userId: string, approvalStatus: "APPROVED" | "REJECTED") {
    await api.patch("/admin/users", { userId, approvalStatus });
    toast.success(`User ${approvalStatus.toLowerCase()}`);
    load();
  }

  async function approveProject(projectId: string, approvalStatus: "APPROVED" | "REJECTED") {
    await api.patch("/admin/projects", { projectId, approvalStatus });
    toast.success(`Project ${approvalStatus.toLowerCase()}`);
    load();
  }

  if (loading) return <div className="min-h-screen p-10 text-white">Loading…</div>;

  return (
    <main className="min-h-screen p-6 text-white md:p-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Admin Command Center</h1>
          <p className="mt-1 text-sm text-muted-foreground">Platform-wide oversight: approvals, listings, revenue.</p>
        </div>
        <NotificationBell />
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
        <h2 className="text-lg font-medium">Pending account approvals ({pendingUsers.length})</h2>
        <div className="mt-3 space-y-3">
          {pendingUsers.length === 0 && <p className="text-sm text-muted-foreground">Nothing pending.</p>}
          {pendingUsers.map((u) => (
            <Card key={u._id} className="flex items-center justify-between border-white/10 glass text-white">
              <div>
                <p className="font-medium">{u.name} <Badge variant="info">{u.role}</Badge></p>
                <p className="text-sm text-muted-foreground">{u.email} {u.developerProfile?.companyName ? `· ${u.developerProfile.companyName}` : ""}</p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => approveUser(u._id, "APPROVED")}>Approve</Button>
                <Button size="sm" variant="destructive" onClick={() => approveUser(u._id, "REJECTED")}>Reject</Button>
              </div>
            </Card>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-medium">Pending project approvals ({pendingProjects.length})</h2>
        <div className="mt-3 space-y-3">
          {pendingProjects.length === 0 && <p className="text-sm text-muted-foreground">Nothing pending.</p>}
          {pendingProjects.map((p) => (
            <Card key={p._id} className="flex items-center justify-between border-white/10 glass text-white">
              <div>
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
        <Link to="/admin/settings" className="text-blue-400 hover:underline">Platform settings →</Link>
      </div>
    </main>
  );
}

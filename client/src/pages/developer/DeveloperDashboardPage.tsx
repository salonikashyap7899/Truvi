import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { Card, CardTitle, CardValue, Badge } from "@/components/ui/primitives";
import { NotificationBell } from "@/components/NotificationBell";
import { formatINR } from "@/lib/utils";
import { useSocketEvent } from "@/lib/socket";
import type { Project, Lead, Unit } from "@/types";

const STAGES: Lead["stage"][] = ["GENERATED", "ASSIGNED", "CONTACTED", "SITE_VISIT", "NEGOTIATION", "BOOKING", "REGISTRATION", "LOST"];

export default function DeveloperDashboardPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    const projectsRes = await api.get("/projects");
    const myProjects: Project[] = projectsRes.data.projects;
    setProjects(myProjects);

    const [leadsRes, ...unitLists] = await Promise.all([
      api.get("/leads"),
      ...myProjects.map((p) => api.get("/units", { params: { projectId: p._id } })),
    ]);
    setLeads(leadsRes.data.leads);
    setUnits(unitLists.flatMap((r) => r.data.units));
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  // Real-time: inventory or lead updates elsewhere refresh this dashboard automatically.
  useSocketEvent("unit:update", () => load());
  useSocketEvent("lead:update", () => load());

  if (loading) return <div className="min-h-screen p-10 text-white">Loading…</div>;

  const totalRevenue = units.filter((u) => u.status === "SOLD").reduce((s, u) => s + u.price, 0);
  const unitsSold = units.filter((u) => u.status === "SOLD").length;
  const unitsAvailable = units.filter((u) => u.status === "AVAILABLE").length;

  const stageCount: Record<string, number> = {};
  leads.forEach((l) => (stageCount[l.stage] = (stageCount[l.stage] || 0) + 1));

  return (
    <main className="min-h-screen p-6 text-white md:p-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Developer Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">Live inventory and pipeline, updated in real time.</p>
        </div>
        <div className="flex items-center gap-3">
          <NotificationBell />
          <Link to="/developer/projects/new">
            <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium hover:bg-blue-700">+ New Project</button>
          </Link>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-white/10 glass text-white">
          <CardTitle className="text-muted-foreground">Total Revenue (Sold Units)</CardTitle>
          <CardValue>{formatINR(totalRevenue)}</CardValue>
        </Card>
        <Card className="border-white/10 glass text-white">
          <CardTitle className="text-muted-foreground">Active Projects</CardTitle>
          <CardValue>{projects.filter((p) => p.approvalStatus === "APPROVED").length}</CardValue>
        </Card>
        <Card className="border-white/10 glass text-white">
          <CardTitle className="text-muted-foreground">Units Sold / Available</CardTitle>
          <CardValue>{unitsSold} / {unitsAvailable}</CardValue>
        </Card>
        <Card className="border-white/10 glass text-white">
          <CardTitle className="text-muted-foreground">Total Leads</CardTitle>
          <CardValue>{leads.length}</CardValue>
        </Card>
      </div>

      <section className="mt-10">
        <h2 className="text-lg font-medium">Booking pipeline</h2>
        <div className="mt-3 flex flex-wrap gap-3">
          {STAGES.map((stage) => (
            <div key={stage} className="rounded-lg border border-white/10 glass px-4 py-2 text-center">
              <p className="text-xs text-muted-foreground">{stage.replace("_", " ")}</p>
              <p className="text-lg font-semibold">{stageCount[stage] || 0}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-medium">My projects</h2>
        <div className="mt-3 space-y-3">
          {projects.length === 0 && <p className="text-sm text-muted-foreground">No projects yet — create your first one.</p>}
          {projects.map((p) => (
            <Link key={p._id} to={`/developer/projects/${p._id}`}>
              <Card className="flex items-center justify-between border-white/10 glass text-white hover:border-blue-600">
                <div>
                  <p className="font-medium">
                    {p.name}{" "}
                    <Badge variant={p.approvalStatus === "APPROVED" ? "success" : p.approvalStatus === "PENDING" ? "warning" : "danger"}>
                      {p.approvalStatus}
                    </Badge>
                  </p>
                  <p className="text-sm text-muted-foreground">{p.city} · {p.unitCount ?? 0} units · {p.leadCount ?? 0} leads</p>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}

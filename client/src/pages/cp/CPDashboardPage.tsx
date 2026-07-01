import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { Card, CardTitle, CardValue, Badge, Input, Label } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { NotificationBell } from "@/components/NotificationBell";
import { formatINR, nameOf } from "@/lib/utils";
import { useSocketEvent } from "@/lib/socket";
import { useAuthStore } from "@/store/authStore";
import { toast } from "sonner";
import type { Project, Unit, Lead, Commission, User } from "@/types";

export default function CPDashboardPage() {
  const user = useAuthStore((s) => s.user);
  const [projects, setProjects] = useState<Project[]>([]);
  const [unitsByProject, setUnitsByProject] = useState<Record<string, Unit[]>>({});
  const [leads, setLeads] = useState<Lead[]>([]);
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [leaderboard, setLeaderboard] = useState<User[]>([]);
  const [leadFormOpenFor, setLeadFormOpenFor] = useState<string | null>(null);
  const [leadForm, setLeadForm] = useState({ clientName: "", clientPhone: "" });
  const [loading, setLoading] = useState(true);

  async function load() {
    const [projectsRes, leadsRes, commissionsRes, leaderboardRes] = await Promise.all([
      api.get("/projects"),
      api.get("/leads"),
      api.get("/commissions"),
      api.get("/leaderboard"),
    ]);

    const projectList: Project[] = projectsRes.data.projects;
    setProjects(projectList);
    setLeads(leadsRes.data.leads);
    setCommissions(commissionsRes.data.commissions);
    setLeaderboard(leaderboardRes.data.leaderboard);

    const unitLists = await Promise.all(projectList.map((p) => api.get("/units", { params: { projectId: p._id } })));
    const map: Record<string, Unit[]> = {};
    projectList.forEach((p, i) => (map[p._id] = unitLists[i].data.units));
    setUnitsByProject(map);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  // Real-time: another CP locking a unit reflects here instantly — this is
  // exactly the "Developers and CPs must see literally the same live data"
  // requirement, now push-based instead of poll-on-every-page-load.
  useSocketEvent<{ projectId: string; unit: Unit }>("unit:update", (payload) => {
    setUnitsByProject((prev) => {
      const list = prev[payload.projectId] || [];
      const exists = list.some((u) => u._id === payload.unit._id);
      const updated = exists ? list.map((u) => (u._id === payload.unit._id ? payload.unit : u)) : [...list, payload.unit];
      return { ...prev, [payload.projectId]: updated };
    });
  });

  useSocketEvent<Commission>("commission:update", () => load());

  async function lockUnit(unitId: string) {
    try {
      await api.post(`/units/${unitId}/lock`);
      toast.success("Unit locked for 30 minutes");
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to lock unit");
    }
  }

  async function submitLead(projectId: string, confirmDuplicate = false) {
    try {
      await api.post("/leads", { projectId, ...leadForm, source: "CP", confirmDuplicate });
      toast.success("Lead submitted");
      setLeadFormOpenFor(null);
      setLeadForm({ clientName: "", clientPhone: "" });
      load();
    } catch (err: any) {
      if (err?.response?.status === 409 && err.response.data.warning === "DUPLICATE_DETECTED") {
        if (confirm(err.response.data.message + "\n\nSubmit anyway?")) submitLead(projectId, true);
        return;
      }
      toast.error(err?.response?.data?.error || "Failed to submit lead");
    }
  }

  if (loading || !user) return <div className="min-h-screen bg-[#0B1220] p-10 text-white">Loading…</div>;

  const earned = commissions.reduce((s, c) => s + c.cpCommissionAmount, 0);
  const paid = commissions.reduce((s, c) => s + c.milestones.filter((m) => m.isReleased).reduce((a, m) => a + m.amount, 0), 0);
  const pending = earned - paid;
  const myRank = leaderboard.findIndex((l) => l._id === user._id) + 1;

  const STATUS_VARIANT: Record<string, "success" | "warning" | "info" | "danger"> = {
    AVAILABLE: "success",
    LOCKED: "warning",
    RESERVED: "info",
    SOLD: "danger",
  };

  return (
    <main className="min-h-screen bg-[#0B1220] p-6 text-white md:p-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">
            CP Dashboard <Badge variant={(user.cpTier || "silver").toLowerCase()}>{user.cpTier || "SILVER"}</Badge>
          </h1>
          <p className="mt-1 text-sm text-neutral-400">
            Welcome back, {user.name} {user.cpProfile?.isPremium && <Badge variant="featured" className="ml-2">Premium</Badge>}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <NotificationBell />
          <Link to="/cp/marketplace" className="text-sm text-blue-400 hover:underline">Lead marketplace →</Link>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-neutral-800 bg-[#121A2B] text-white">
          <CardTitle className="text-neutral-400">Earned</CardTitle>
          <CardValue>{formatINR(earned)}</CardValue>
        </Card>
        <Card className="border-neutral-800 bg-[#121A2B] text-white">
          <CardTitle className="text-neutral-400">Paid</CardTitle>
          <CardValue>{formatINR(paid)}</CardValue>
        </Card>
        <Card className="border-neutral-800 bg-[#121A2B] text-white">
          <CardTitle className="text-neutral-400">Pending</CardTitle>
          <CardValue>{formatINR(pending)}</CardValue>
        </Card>
        <Card className="border-neutral-800 bg-[#121A2B] text-white">
          <CardTitle className="text-neutral-400">Leaderboard rank</CardTitle>
          <CardValue>{myRank > 0 ? `#${myRank}` : "—"}</CardValue>
        </Card>
      </div>

      <p className="mt-4 rounded-lg border border-green-900 bg-green-950/50 p-3 text-sm text-green-400">
        100% of your commission is yours — Truvi never deducts from CP earnings.
      </p>

      <section className="mt-10">
        <h2 className="text-lg font-medium">
          Discover projects <span className="text-xs text-neutral-500">— live inventory, updates in real time</span>
        </h2>
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => {
            const units = unitsByProject[p._id] || [];
            const available = units.filter((u) => u.status === "AVAILABLE");
            return (
              <Card key={p._id} className="border-neutral-800 bg-[#121A2B] text-white">
                <div className="flex items-start justify-between">
                  <p className="font-medium">{p.name}</p>
                  {p.listingTier === "FEATURED" && <Badge variant="featured">Featured</Badge>}
                </div>
                <p className="mt-1 text-sm text-neutral-400">{p.location}, {p.city} · {nameOf(p.developerId)}</p>
                <p className="mt-2 text-xs text-neutral-500">{available.length} units available · Commission {p.commissionPercent}%</p>

                <div className="mt-3">
                  {leadFormOpenFor === p._id ? (
                    <div className="space-y-2 rounded-lg border border-neutral-700 bg-neutral-900 p-3">
                      <div>
                        <Label className="text-xs text-neutral-300">Client name</Label>
                        <Input value={leadForm.clientName} onChange={(e) => setLeadForm({ ...leadForm, clientName: e.target.value })} className="h-8 border-neutral-700 bg-neutral-800 text-xs text-white" />
                      </div>
                      <div>
                        <Label className="text-xs text-neutral-300">Phone (10 digits)</Label>
                        <Input value={leadForm.clientPhone} onChange={(e) => setLeadForm({ ...leadForm, clientPhone: e.target.value })} className="h-8 border-neutral-700 bg-neutral-800 text-xs text-white" />
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => submitLead(p._id)}>Submit</Button>
                        <Button size="sm" variant="ghost" onClick={() => setLeadFormOpenFor(null)}>Cancel</Button>
                      </div>
                    </div>
                  ) : (
                    <Button size="sm" onClick={() => setLeadFormOpenFor(p._id)}>Submit Lead</Button>
                  )}
                </div>

                {units.length > 0 && (
                  <div className="mt-3 space-y-1 border-t border-neutral-800 pt-2">
                    {units.slice(0, 5).map((u) => (
                      <div key={u._id} className="flex items-center justify-between text-xs">
                        <span>{u.unitNumber} · {u.type} · {formatINR(u.price)}</span>
                        <div className="flex items-center gap-2">
                          <Badge variant={STATUS_VARIANT[u.status]}>{u.status}</Badge>
                          {u.status === "AVAILABLE" && (
                            <Button size="sm" variant="outline" className="h-6 border-neutral-700 px-2 text-xs" onClick={() => lockUnit(u._id)}>Lock</Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-medium">My leads</h2>
        <div className="mt-3 space-y-2">
          {leads.map((l) => (
            <Card key={l._id} className="flex items-center justify-between border-neutral-800 bg-[#121A2B] text-white">
              <div>
                <p className="font-medium">{l.clientName}</p>
                <p className="text-sm text-neutral-400">{nameOf(l.projectId)} · {l.clientPhone}</p>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant="info">{l.stage}</Badge>
                <a
                  href={`https://wa.me/91${l.clientPhone}?text=${encodeURIComponent(`Hi ${l.clientName}, following up on your interest.`)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-green-400 hover:underline"
                >
                  WhatsApp
                </a>
              </div>
            </Card>
          ))}
          {leads.length === 0 && <p className="text-sm text-neutral-500">No leads yet — submit one from a project above.</p>}
        </div>
      </section>

      {leaderboard.length > 0 && (
        <section className="mt-10">
          <h2 className="text-lg font-medium">Leaderboard</h2>
          <div className="mt-3 space-y-2">
            {leaderboard.slice(0, 5).map((cp, i) => (
              <Card key={cp._id} className={`flex items-center justify-between border-neutral-800 bg-[#121A2B] text-white ${cp._id === user._id ? "ring-1 ring-blue-500" : ""}`}>
                <p>#{i + 1} {cp.name} <Badge variant={(cp.cpTier || "silver").toLowerCase()}>{cp.cpTier}</Badge></p>
                <p className="text-sm text-neutral-400">{cp.cpProfile?.totalBookings || 0} bookings</p>
              </Card>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

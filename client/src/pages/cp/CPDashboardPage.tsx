import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { Card, CardTitle, CardValue, Badge, Input, Label } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { NotificationBell } from "@/components/NotificationBell";
import { MyPlans } from "@/components/MyPlans";
import UserMenu from "@/components/UserMenu";
import { formatINR, nameOf } from "@/lib/utils";
import { useSocketEvent } from "@/lib/socket";
import { useAuthStore } from "@/store/authStore";
import { toast } from "sonner";
import { BookOpen, Users, Star, Receipt } from "lucide-react";
import type { Project, Unit, Lead, Commission, User } from "@/types";

export default function CPDashboardPage({ title = "CP Dashboard" }: { title?: string }) {
  const user = useAuthStore((s) => s.user);
  const [projects, setProjects] = useState<Project[]>([]);
  const [unitsByProject, setUnitsByProject] = useState<Record<string, Unit[]>>({});
  const [leads, setLeads] = useState<Lead[]>([]);
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [leaderboard, setLeaderboard] = useState<User[]>([]);
  const [leadFormOpenFor, setLeadFormOpenFor] = useState<string | null>(null);
  const [leadForm, setLeadForm] = useState({ clientName: "", clientPhone: "" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
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
    } catch (err: any) {
      setError(err?.response?.data?.error || "Failed to load dashboard data");
    } finally {
      setLoading(false);
    }
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

  if (loading || !user) return <div className="min-h-screen p-10 text-white">Loading…</div>;
  if (error) return <div className="min-h-screen p-10 text-white"><p className="text-red-400">{error}</p></div>;

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
    <main className="min-h-screen p-6 text-white md:p-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">
            {title} <Badge variant={(user.cpTier || "silver").toLowerCase()}>{user.cpTier || "SILVER"}</Badge>
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Welcome back, {user.name} {user.cpProfile?.isPremium && <Badge variant="featured" className="ml-2">Premium</Badge>}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <NotificationBell />
          <UserMenu />
          <Link to="/cp/marketplace" className="text-sm text-blue-400 hover:underline">Lead marketplace →</Link>
        </div>
      </div>

      {/* Quick links to new features */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Link to="/cp/academy" className="flex items-center gap-2 rounded-xl border border-blue-900 bg-blue-950/30 px-4 py-3 text-sm text-blue-300 hover:bg-blue-950/60 transition-colors">
          <BookOpen size={16} /> Learning Academy
        </Link>
        <Link to="/cp/connect" className="flex items-center gap-2 rounded-xl border border-purple-900 bg-purple-950/30 px-4 py-3 text-sm text-purple-300 hover:bg-purple-950/60 transition-colors">
          <Users size={16} /> Truvi Connect
        </Link>
        <Link to="/cp/marketplace" className="flex items-center gap-2 rounded-xl border border-green-900 bg-green-950/30 px-4 py-3 text-sm text-green-300 hover:bg-green-950/60 transition-colors">
          <Star size={16} /> Lead Marketplace
        </Link>
        <button className="flex items-center gap-2 rounded-xl border border-yellow-900 bg-yellow-950/30 px-4 py-3 text-sm text-yellow-300 hover:bg-yellow-950/60 transition-colors" onClick={() => document.getElementById('commissions-section')?.scrollIntoView({ behavior: 'smooth' })}>
          <Receipt size={16} /> My Commissions
        </button>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-white/10 glass text-white">
          <CardTitle className="text-muted-foreground">Earned</CardTitle>
          <CardValue>{formatINR(earned)}</CardValue>
        </Card>
        <Card className="border-white/10 glass text-white">
          <CardTitle className="text-muted-foreground">Paid</CardTitle>
          <CardValue>{formatINR(paid)}</CardValue>
        </Card>
        <Card className="border-white/10 glass text-white">
          <CardTitle className="text-muted-foreground">Pending</CardTitle>
          <CardValue>{formatINR(pending)}</CardValue>
        </Card>
        <Card className="border-white/10 glass text-white">
          <CardTitle className="text-muted-foreground">Leaderboard rank</CardTitle>
          <CardValue>{myRank > 0 ? `#${myRank}` : "—"}</CardValue>
        </Card>
      </div>

      <p className="mt-4 rounded-lg border border-green-900 bg-green-950/50 p-3 text-sm text-green-400">
        100% of your commission is yours — Truvi never deducts from CP earnings.
      </p>

      {/* AI Recommendations */}
      {projects.length > 0 && (() => {
        const recommended = [...projects]
          .sort((a, b) => {
            const aUnits = (unitsByProject[a._id] || []).filter((u) => u.status === "AVAILABLE").length;
            const bUnits = (unitsByProject[b._id] || []).filter((u) => u.status === "AVAILABLE").length;
            const aScore = b.commissionPercent * 10 + (b.listingTier === "FEATURED" ? 5 : 0) + bUnits;
            const bScore = a.commissionPercent * 10 + (a.listingTier === "FEATURED" ? 5 : 0) + aUnits;
            return aScore - bScore;
          })
          .slice(0, 3);

        if (recommended.length === 0) return null;
        return (
          <section className="mt-8">
            <h2 className="text-lg font-medium flex items-center gap-2">
              <Star size={16} className="text-yellow-400" />
              AI Recommended for You
              <span className="text-xs text-muted-foreground">— top opportunities based on commission & availability</span>
            </h2>
            <div className="mt-3 flex gap-3 overflow-x-auto pb-2">
              {recommended.map((p) => {
                const avail = (unitsByProject[p._id] || []).filter((u) => u.status === "AVAILABLE").length;
                return (
                  <div key={p._id} className="shrink-0 w-60 rounded-xl border border-yellow-900/40 bg-yellow-950/10 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium text-white leading-snug">{p.name}</p>
                      {p.listingTier === "FEATURED" && <Badge variant="featured" className="shrink-0">Featured</Badge>}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{p.city}</p>
                    <div className="mt-3 space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Commission</span>
                        <span className="text-green-400 font-medium">{p.commissionPercent}%</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Available units</span>
                        <span className="text-white">{avail}</span>
                      </div>
                    </div>
                    <Button size="sm" className="mt-3 w-full" onClick={() => setLeadFormOpenFor(p._id)}>Submit Lead</Button>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })()}

      <section className="mt-10">
        <h2 className="text-lg font-medium">
          Discover projects <span className="text-xs text-muted-foreground">— live inventory, updates in real time</span>
        </h2>
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => {
            const units = unitsByProject[p._id] || [];
            const available = units.filter((u) => u.status === "AVAILABLE");
            return (
              <Card key={p._id} className="border-white/10 glass text-white">
                <div className="flex items-start justify-between">
                  <p className="font-medium">{p.name}</p>
                  {p.listingTier === "FEATURED" && <Badge variant="featured">Featured</Badge>}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{p.location}, {p.city} · {nameOf(p.developerId)}</p>
                <p className="mt-2 text-xs text-muted-foreground">{available.length} units available · Commission {p.commissionPercent}%</p>

                <div className="mt-3">
                  {leadFormOpenFor === p._id ? (
                    <div className="space-y-2 rounded-lg border border-white/15 bg-card p-3">
                      <div>
                        <Label className="text-xs text-foreground/90">Client name</Label>
                        <Input value={leadForm.clientName} onChange={(e) => setLeadForm({ ...leadForm, clientName: e.target.value })} className="h-8 border-white/15 bg-white/10 text-xs text-white" />
                      </div>
                      <div>
                        <Label className="text-xs text-foreground/90">Phone (10 digits)</Label>
                        <Input value={leadForm.clientPhone} onChange={(e) => setLeadForm({ ...leadForm, clientPhone: e.target.value })} className="h-8 border-white/15 bg-white/10 text-xs text-white" />
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
                  <div className="mt-3 space-y-1 border-t border-white/10 pt-2">
                    {units.slice(0, 5).map((u) => (
                      <div key={u._id} className="flex items-center justify-between text-xs">
                        <span>{u.unitNumber} · {u.type} · {formatINR(u.price)}</span>
                        <div className="flex items-center gap-2">
                          <Badge variant={STATUS_VARIANT[u.status]}>{u.status}</Badge>
                          {u.status === "AVAILABLE" && (
                            <Button size="sm" variant="outline" className="h-6 border-white/15 px-2 text-xs" onClick={() => lockUnit(u._id)}>Lock</Button>
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
            <Card key={l._id} className="flex flex-wrap items-center justify-between gap-3 border-white/10 glass text-white">
              <div>
                <p className="font-medium">{l.clientName}</p>
                <p className="text-sm text-muted-foreground">{nameOf(l.projectId)} · {l.clientPhone}</p>
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
          {leads.length === 0 && <p className="text-sm text-muted-foreground">No leads yet — submit one from a project above.</p>}
        </div>
      </section>

      {/* Commissions with TDS breakdown + invoice upload */}
      {commissions.length > 0 && (
        <section id="commissions-section" className="mt-10">
          <h2 className="text-lg font-medium flex items-center gap-2">
            <Receipt size={16} className="text-yellow-400" />
            My Commissions
          </h2>
          <div className="mt-3 space-y-3">
            {commissions.map((c) => {
              const tds = c.tdsAmount || 0;
              const net = c.cpCommissionAmount - tds;
              const releasedAmt = c.milestones.filter((m) => m.isReleased).reduce((s, m) => s + m.amount, 0);
              return (
                <Card key={c._id} className="border-white/10 glass text-white">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-sm">{typeof c.leadId === "object" && c.leadId !== null ? (c.leadId as Lead).clientName : "Lead"} commission</p>
                      <Badge variant="info" className="mt-1">{c.status}</Badge>
                    </div>
                    <div className="text-right text-xs space-y-0.5">
                      <p className="text-muted-foreground">Gross: <span className="text-white">{formatINR(c.cpCommissionAmount)}</span></p>
                      <p className="text-muted-foreground">TDS ({5}%): <span className="text-rose-400">− {formatINR(tds)}</span></p>
                      <p className="text-muted-foreground">Net payable: <span className="text-green-400 font-semibold">{formatINR(net)}</span></p>
                      <p className="text-muted-foreground">Released: {formatINR(releasedAmt)}</p>
                    </div>
                  </div>

                  {/* Milestones */}
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {c.milestones.map((m) => (
                      <div key={String(m._id)} className={`rounded-lg border px-2 py-1.5 text-center text-xs ${m.isReleased ? "border-green-800 bg-green-950/30 text-green-300" : "border-white/10 text-muted-foreground"}`}>
                        <p className="font-medium">{m.label}</p>
                        <p>{formatINR(m.amount)}</p>
                        <p className="text-[10px] mt-0.5">{m.isReleased ? "✓ Released" : "Pending"}</p>
                      </div>
                    ))}
                  </div>

                  {/* Invoice upload */}
                  <div className="mt-3 border-t border-white/10 pt-3 flex items-center gap-3 text-xs">
                    {c.invoiceUrl ? (
                      <a href={c.invoiceUrl} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">View Invoice ↗</a>
                    ) : (
                      <label className="cursor-pointer text-muted-foreground hover:text-white transition-colors flex items-center gap-1.5">
                        <Receipt size={12} />
                        Upload Invoice
                        <input
                          type="file"
                          accept="application/pdf,image/*"
                          className="hidden"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            const form = new FormData();
                            form.append("file", file);
                            try {
                              const upRes = await api.post("/uploads", form, { headers: { "Content-Type": "multipart/form-data" } });
                              const invoiceUrl = upRes.data.url as string;
                              await api.patch(`/commissions/${c._id}/invoice`, { invoiceUrl });
                              toast.success("Invoice uploaded!");
                              load();
                            } catch {
                              toast.error("Upload failed");
                            }
                          }}
                        />
                      </label>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        </section>
      )}

      {leaderboard.length > 0 && (
        <section className="mt-10">
          <h2 className="text-lg font-medium">Leaderboard</h2>
          <div className="mt-3 space-y-2">
            {leaderboard.slice(0, 5).map((cp, i) => (
              <Card key={cp._id} className={`flex items-center justify-between border-white/10 glass text-white ${cp._id === user._id ? "ring-1 ring-blue-500" : ""}`}>
                <p>#{i + 1} {cp.name} <Badge variant={(cp.cpTier || "silver").toLowerCase()}>{cp.cpTier}</Badge></p>
                <p className="text-sm text-muted-foreground">{cp.cpProfile?.totalBookings || 0} bookings</p>
              </Card>
            ))}
          </div>
        </section>
      )}

      <MyPlans />
    </main>
  );
}

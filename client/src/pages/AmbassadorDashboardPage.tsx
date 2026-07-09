import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { formatINR, nameOf } from "@/lib/utils";
import { Card, Badge } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/store/authStore";
import { AmbassadorOnboarding } from "@/components/AmbassadorOnboarding";
import { AmbassadorQRCode } from "@/components/AmbassadorQRCode";
import { MapPin, ShieldCheck, Lock, CheckCircle2, QrCode } from "lucide-react";
import type { Project, Unit } from "@/types";

export default function AmbassadorDashboardPage() {
  const user = useAuthStore((s) => s.user);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [unitsByProject, setUnitsByProject] = useState<Record<string, Unit[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lockLoading, setLockLoading] = useState<string | null>(null);
  const [showQRCode, setShowQRCode] = useState(false);

  useEffect(() => {
    if (!user) return;
    if (!user.onboardingVerified) {
      setProjects([]);
      setLoading(false);
      setSelectedProjectId(null);
      return;
    }

    async function loadProjects() {
      setError(null);
      setLoading(true);
      try {
        const res = await api.get("/projects");
        setProjects(res.data.projects);
      } catch (err: any) {
        setError(err?.response?.data?.error || "Failed to load ambassador tasks");
      } finally {
        setLoading(false);
      }
    }
    loadProjects();
  }, [user]);

  const selectedProject = useMemo(
    () => projects.find((project) => project._id === selectedProjectId) || null,
    [projects, selectedProjectId],
  );

  async function loadUnits(projectId: string) {
    try {
      const res = await api.get("/units", { params: { projectId } });
      setUnitsByProject((prev) => ({ ...prev, [projectId]: res.data.units }));
    } catch (err: any) {
      setError(err?.response?.data?.error || "Failed to load units");
    }
  }

  async function lockUnit(unitId: string, projectId: string) {
    setLockLoading(unitId);
    try {
      const res = await api.post(`/units/${unitId}/lock`);
      setUnitsByProject((prev) => {
        const list = prev[projectId] ?? [];
        return {
          ...prev,
          [projectId]: list.map((unit) => (unit._id === unitId ? res.data.unit : unit)),
        };
      });
    } catch (err: any) {
      setError(err?.response?.data?.error || "Failed to lock task");
    } finally {
      setLockLoading(null);
    }
  }

  useEffect(() => {
    if (!selectedProjectId) return;
    if (unitsByProject[selectedProjectId]) return;
    loadUnits(selectedProjectId);
  }, [selectedProjectId, unitsByProject]);

  if (!user) {
    return <div className="min-h-screen p-10 text-white">Loading ambassador workspace…</div>;
  }

  return (
    <main className="min-h-screen p-6 text-white md:p-10">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Ambassador Dashboard</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Browse live verification tasks from Truvi’s inventory. Every available project and unit reflects current backend data — no dummy listings.
          </p>
        </div>
        <div className="space-y-1 text-right">
          <p className="text-sm text-muted-foreground">Logged in as</p>
          <p className="text-base font-medium">{user.name}</p>          <button
            onClick={() => setShowQRCode(true)}
            className="mt-3 inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/5 px-4 py-2 text-sm font-medium text-blue-300 hover:bg-white/10 transition"
          >
            <QrCode size={16} />
            Share Access QR
          </button>        </div>
      </div>

      <AmbassadorOnboarding />

      {!user.onboardingVerified ? (
        <div className="mt-8 rounded-3xl border border-amber-500/20 bg-amber-950/20 p-6 text-sm text-amber-100">
          <p className="text-base font-semibold">Verification required</p>
          <p className="mt-2">Complete phone, email, and Aadhaar verification to unlock project details and verification tasks.</p>
        </div>
      ) : (
        <div className="mt-8 grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <section className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold">Available verification tasks</h2>
              <p className="text-sm text-muted-foreground">
                Select a project to view live units, lock a task, and verify property details.
              </p>
            </div>
            <div className="space-y-1 text-sm text-muted-foreground">
              <p>{projects.length} project{projects.length === 1 ? "" : "s"} available</p>
              <p>{projects.filter((project) => project.isVerified).length} verified projects</p>
            </div>
          </div>

          {loading ? (
            <div className="rounded-3xl border border-white/10 bg-white/5 p-8 text-center text-muted-foreground">Loading tasks…</div>
          ) : error ? (
            <div className="rounded-3xl border border-rose-500/20 bg-rose-950/20 p-6 text-sm text-rose-200">{error}</div>
          ) : projects.length === 0 ? (
            <div className="rounded-3xl border border-white/10 bg-white/5 p-8 text-center text-muted-foreground">No live tasks available right now.</div>
          ) : (
            <div className="grid gap-4">
              {projects.map((project) => {
                const availableUnits = (unitsByProject[project._id] ?? []).filter((unit) => unit.status === "AVAILABLE").length;
                return (
                  <Card key={project._id} className="border-white/10 glass p-5">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant={project.isVerified ? "success" : "outline"}>{project.approvalStatus}</Badge>
                          {project.listingTier === "FEATURED" && <Badge variant="featured">Featured</Badge>}
                          {project.isPrimeListing && <Badge variant="info">Prime</Badge>}
                        </div>
                        <div>
                          <p className="text-lg font-semibold text-white">{project.name}</p>
                          <p className="text-sm text-muted-foreground">{project.location}, {project.city}</p>
                        </div>
                      </div>
                      <div className="flex flex-col items-start gap-2 sm:items-end">
                        <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm text-muted-foreground">
                          <MapPin size={14} />
                          {availableUnits} available unit{availableUnits === 1 ? "" : "s"}
                        </div>
                        <Button
                          variant={selectedProjectId === project._id ? "secondary" : "outline"}
                          onClick={() => setSelectedProjectId(project._id)}
                        >
                          {selectedProjectId === project._id ? "Viewing" : "View"} project
                        </Button>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-3">
                      <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Units</p>
                        <p className="mt-2 text-2xl font-semibold text-white">{project.unitCount ?? 0}</p>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Commission</p>
                        <p className="mt-2 text-2xl font-semibold text-white">{project.commissionPercent}%</p>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Developer</p>
                        <p className="mt-2 text-sm text-white">{nameOf(project.developerId) || "Unknown"}</p>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </section>

        <section className="space-y-4">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-white">Selected project</p>
                <p className="mt-1 text-xs text-muted-foreground">Choose a project to inspect units and accept a verification task.</p>
              </div>
              <Badge variant="info">Live data</Badge>
            </div>

            {!selectedProject ? (
              <div className="mt-6 rounded-3xl border border-dashed border-white/10 bg-white/5 p-6 text-sm text-muted-foreground">
                Select a project from the list to load its live units and verification status.
              </div>
            ) : (
              <div className="mt-6 space-y-4">
                <div className="space-y-2 rounded-2xl border border-white/10 bg-[#06090f]/90 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-base font-semibold text-white">{selectedProject.name}</p>
                      <p className="text-sm text-muted-foreground">{selectedProject.location}, {selectedProject.city}</p>
                    </div>
                    <Badge variant={selectedProject.isVerified ? "success" : "warning"}>
                      {selectedProject.isVerified ? "Verified" : "Needs review"}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-3">{selectedProject.description}</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Min rate</p>
                      <p className="mt-2 text-lg font-semibold text-white">
                        {selectedProject.minRate ? formatINR(selectedProject.minRate) : "—"}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Available units</p>
                      <p className="mt-2 text-lg font-semibold text-white">
                        {(unitsByProject[selectedProject._id] ?? []).filter((unit) => unit.status === "AVAILABLE").length}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-3 rounded-3xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Live units</p>
                  {(unitsByProject[selectedProject._id] ?? []).length === 0 ? (
                    <div className="rounded-2xl border border-white/10 bg-[#06111d]/80 p-5 text-sm text-muted-foreground">
                      No units loaded yet. Select a project and refresh if necessary.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {unitsByProject[selectedProject._id].map((unit) => (
                        <div key={unit._id} className="rounded-2xl border border-white/10 bg-[#060b14]/80 p-4">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <p className="text-sm font-semibold text-white">Unit {unit.unitNumber}</p>
                              <p className="text-xs text-muted-foreground">{unit.type} · {formatINR(unit.price)} · {unit.areaSqft} sqft</p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant={unit.status === "AVAILABLE" ? "success" : unit.status === "LOCKED" ? "warning" : "danger"}>
                                {unit.status}
                              </Badge>
                              {unit.status === "AVAILABLE" ? (
                                <Button
                                  size="sm"
                                  variant="primary"
                                  disabled={Boolean(lockLoading)}
                                  onClick={() => lockUnit(unit._id, selectedProject._id)}
                                >
                                  {lockLoading === unit._id ? "Locking…" : "Accept task"}
                                </Button>
                              ) : unit.status === "LOCKED" ? (
                                <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs text-muted-foreground">
                                  <Lock size={12} /> Locked
                                </div>
                              ) : (
                                <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs text-muted-foreground">
                                  <CheckCircle2 size={12} /> {unit.status}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="rounded-3xl border border-white/10 bg-white/5 p-4 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2 text-white">
                    <ShieldCheck size={16} />
                    Live verification tasks are sourced from every approved project with available units in Truvi inventory.
                  </div>
                  <p className="mt-2">Locking a unit gives you an exclusive 6-hour window to complete the verification task before it returns to the pool.</p>
                </div>
              </div>
            )}
          </div>
          </section>
        </div>
      )}

      {showQRCode && <AmbassadorQRCode onClose={() => setShowQRCode(false)} />}
    </main>
  );
}

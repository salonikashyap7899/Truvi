import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";

type Project = { id: string; name: string; city: string };
type Category = { _id: string; name: string; enabled: boolean };
type Invitation = { _id: string; code: string; campaign: string | null; createdAt: string };
type Summary = {
  project: Project;
  bookingCounts: Record<string, number>;
  payments: { status: string; count: number; amountPaise: number }[];
  categories: Category[];
  invitations: Invitation[];
};

function errorMessage(error: unknown) {
  if (typeof error === "object" && error !== null && "response" in error) {
    const response = (error as { response?: { data?: { error?: string } } }).response;
    if (response?.data?.error) return response.data.error;
  }
  return "Habitat developer action failed";
}

const field = "mt-1 w-full rounded-xl border border-white/10 bg-slate-950/70 px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-400";

export default function HabitatDeveloperPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [campaign, setCampaign] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function loadProjects() {
    setLoading(true);
    try {
      const response = await api.get("/habitat/developer/projects");
      const rows = response.data.projects as Project[];
      setProjects(rows);
      const selectedId = rows.some((project) => project.id === projectId) ? projectId : rows[0]?.id ?? "";
      setProjectId(selectedId);
      if (selectedId) {
        const result = await api.get(`/habitat/developer/projects/${selectedId}/summary`);
        setSummary(result.data);
      } else {
        setSummary(null);
      }
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  async function loadProject(project: Project) {
    setProjectId(project.id);
    setLoading(true);
    try {
      const response = await api.get(`/habitat/developer/projects/${project.id}/summary`);
      setSummary(response.data);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadProjects();
  }, []);

  async function updateCategory(category: Category) {
    if (!summary) return;
    const enabled = !category.enabled;
    try {
      await api.patch(`/habitat/developer/projects/${summary.project.id}/categories/${category._id}`, { enabled });
      setSummary((current) => current ? {
        ...current,
        categories: current.categories.map((entry) => entry._id === category._id ? { ...entry, enabled } : entry),
      } : current);
      toast.success(`${category.name} ${enabled ? "enabled" : "disabled"} for this project`);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  async function createInvitation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!summary) return;
    setSaving(true);
    try {
      await api.post(`/habitat/developer/projects/${summary.project.id}/invitations`, { campaign });
      setCampaign("");
      toast.success("Project invitation created");
      await loadProjects();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  function invitationUrl(code: string) {
    return `${window.location.origin}/habitat/invite/${encodeURIComponent(code)}`;
  }

  return (
    <main className="min-h-screen px-4 py-7 pb-28 text-white sm:px-6 md:px-10">
      <div className="mx-auto max-w-6xl">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-300">Project tools · Habitat</p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold">Habitat project dashboard</h1>
            <p className="mt-1 text-sm text-white/50">Manage service categories, invite residents, and review project-scoped activity.</p>
          </div>
          <Button variant="secondary" onClick={() => void loadProjects()} disabled={loading}>Refresh</Button>
        </div>

        {projects.length > 1 && (
          <label className="mt-6 block max-w-md text-sm text-white/65">
            Authorized project
            <select value={projectId} onChange={(event) => {
              const project = projects.find((entry) => entry.id === event.target.value);
              if (project) void loadProject(project);
            }} className={field}>
              {projects.map((project) => <option key={project.id} value={project.id}>{project.name} · {project.city}</option>)}
            </select>
          </label>
        )}

        {loading ? <p className="mt-8 text-sm text-white/50">Loading authorized Habitat project…</p> : !summary ? (
          <section className="mt-7 rounded-2xl border border-amber-300/20 bg-amber-300/5 p-5">
            <h2 className="font-medium text-amber-100">No approved Habitat project access</h2>
            <p className="mt-1 text-sm text-white/60">An administrator must approve this account for a specific project before these tools become available.</p>
          </section>
        ) : (
          <>
            <section className="mt-7 rounded-2xl border border-white/10 bg-white/[0.035] p-5">
              <h2 className="text-xl font-semibold">{summary.project.name}</h2>
              <p className="mt-1 text-sm text-white/50">{summary.project.city}</p>
              <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Metric label="Total bookings" value={Object.values(summary.bookingCounts).reduce((total, count) => total + count, 0)} />
                <Metric label="Completed" value={summary.bookingCounts.COMPLETED ?? 0} />
                <Metric label="Cancelled" value={summary.bookingCounts.CANCELLED ?? 0} />
                <Metric label="Open disputes" value={summary.bookingCounts.DISPUTED ?? 0} />
              </div>
              <h3 className="mt-6 font-medium">Payment activity</h3>
              {summary.payments.length ? (
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {summary.payments.map((payment) => (
                    <div key={payment.status} className="rounded-xl border border-white/10 px-3 py-2 text-sm">
                      <span className="text-white/70">{payment.status.replaceAll("_", " ")}</span>
                      <span className="float-right">{payment.count} · ₹{(payment.amountPaise / 100).toLocaleString("en-IN")}</span>
                    </div>
                  ))}
                </div>
              ) : <p className="mt-2 text-sm text-white/45">No payment activity yet.</p>}
            </section>

            <div className="mt-5 grid gap-5 xl:grid-cols-2">
              <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
                <h2 className="text-lg font-semibold">Service categories</h2>
                <p className="mt-1 text-xs text-white/50">If no category choices are saved, all active categories remain available to residents.</p>
                <div className="mt-4 space-y-2">
                  {summary.categories.map((category) => (
                    <div key={category._id} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 px-3 py-2">
                      <span className="text-sm">{category.name}</span>
                      <button
                        type="button"
                        onClick={() => void updateCategory(category)}
                        className={`rounded-lg px-3 py-2 text-xs ${category.enabled ? "bg-emerald-300/10 text-emerald-200" : "border border-white/10 text-white/55"}`}
                      >
                        {category.enabled ? "Enabled" : "Disabled"}
                      </button>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
                <h2 className="text-lg font-semibold">Resident invitations</h2>
                <form onSubmit={createInvitation} className="mt-4 flex flex-wrap items-end gap-3">
                  <label className="min-w-48 flex-1 text-xs text-white/65">Campaign/source (optional)
                    <input maxLength={120} value={campaign} onChange={(event) => setCampaign(event.target.value)} className={field} />
                  </label>
                  <Button type="submit" disabled={saving}>{saving ? "Creating…" : "Create invite"}</Button>
                </form>
                <div className="mt-4 space-y-2">
                  {summary.invitations.map((invitation) => (
                    <div key={invitation._id} className="rounded-xl border border-white/10 p-3">
                      <p className="text-xs text-white/50">{invitation.campaign || "No campaign"} · {new Date(invitation.createdAt).toLocaleDateString()}</p>
                      <a href={invitationUrl(invitation.code)} className="mt-1 block break-all text-xs text-emerald-300">{invitationUrl(invitation.code)}</a>
                    </div>
                  ))}
                  {!summary.invitations.length && <p className="text-sm text-white/45">No invitations created for this project yet.</p>}
                </div>
              </section>
            </div>
          </>
        )}
      </div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="rounded-xl border border-white/10 px-3 py-3"><p className="text-xs text-white/45">{label}</p><p className="mt-1 text-xl font-semibold">{value}</p></div>;
}

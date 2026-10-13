import { useEffect, useState, type FormEvent } from "react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";

type Category = { _id: string; name: string; active: boolean };
type Project = { id: string; name: string; city: string; habitatEnabled: boolean };
type Overview = {
  attributedBuyers: number;
  activeServices: number;
  providers: Record<string, number>;
  bookings: Record<string, number>;
};
type Provider = {
  _id: string;
  businessName: string;
  description: string;
  categoryIds: string[];
  serviceAreas: string[];
  experienceYears: number;
  status: string;
  reviewNote: string | null;
  owner: { ownerName: string; ownerEmail: string; ownerPhone: string | null };
};
type Service = { _id: string; categoryId: string; title: string; active: boolean; pricingModel: string; pricePaise: number | null; categoryName: string };
type Booking = {
  _id: string;
  reference: string;
  serviceId: string;
  providerId: string | null;
  status: string;
  serviceTitle: string;
  buyerName: string;
  buyerPhone: string | null;
  preferredAt: string;
  serviceAddress: { street: string; locality: string; city: string; postalCode: string };
  providerName: string | null;
};
type Invitation = { _id: string; code: string; projectName: string; city: string; registrations: number; revoked: boolean; expiresAt: string | null };

function errorMessage(error: unknown) {
  if (typeof error === "object" && error !== null && "response" in error) {
    const response = (error as { response?: { data?: { error?: string } } }).response;
    if (response?.data?.error) return response.data.error;
  }
  return "Habitat admin action failed";
}

const field =
  "mt-1 w-full rounded-xl border border-white/10 bg-slate-950/70 px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-400";

export default function HabitatAdminPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [projectId, setProjectId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priceModel, setPriceModel] = useState<"FIXED" | "STARTING_PRICE" | "QUOTE">("QUOTE");
  const [priceRupees, setPriceRupees] = useState("");
  const [cancellationPolicy, setCancellationPolicy] = useState("Contact Truvi support to request a change or cancellation.");
  const [categoryName, setCategoryName] = useState("");
  const [campaign, setCampaign] = useState("");
  const [providerNotes, setProviderNotes] = useState<Record<string, string>>({});
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newInvitation, setNewInvitation] = useState<Invitation | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [overviewRes, projectRes, categoryRes, providerRes, bookingRes, serviceRes, invitationRes] = await Promise.all([
        api.get("/habitat/admin/overview"),
        api.get("/habitat/admin/projects"),
        api.get("/habitat/admin/categories"),
        api.get("/habitat/admin/providers"),
        api.get("/habitat/admin/bookings"),
        api.get("/habitat/admin/services"),
        api.get("/habitat/admin/invitations"),
      ]);
      setOverview(overviewRes.data);
      setProjects(projectRes.data.projects);
      setCategories(categoryRes.data.categories);
      setProviders(providerRes.data.providers);
      setBookings(bookingRes.data.bookings);
      setServices(serviceRes.data.services);
      setInvitations(invitationRes.data.invitations);
      setProjectId((current) => projectRes.data.projects.some((project: Project) => project.id === current && project.habitatEnabled)
        ? current
        : projectRes.data.projects.find((project: Project) => project.habitatEnabled)?.id ?? "");
      setCategoryId((current) => categoryRes.data.categories.some((category: Category) => category._id === current && category.active)
        ? current
        : categoryRes.data.categories.find((category: Category) => category.active)?._id ?? "");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function createInvitation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await api.post("/habitat/admin/invitations", { projectId, campaign });
      const project = projects.find((entry) => entry.id === projectId);
      const invitation = {
        ...response.data.invitation,
        projectName: project?.name ?? "Project",
        city: project?.city ?? "",
        registrations: 0,
        revoked: false,
      };
      setNewInvitation(invitation);
      toast.success("Invitation created");
      await load();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function createService(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      const rupees = priceRupees ? Number(priceRupees) : null;
      if (priceModel !== "QUOTE" && (rupees === null || !Number.isSafeInteger(rupees) || rupees <= 0)) {
        toast.error("Enter a positive whole-rupee price");
        setSaving(false);
        return;
      }
      await api.post("/habitat/admin/services", {
        categoryId,
        title,
        description,
        pricingModel: priceModel,
        pricePaise: priceModel === "QUOTE" ? null : rupees! * 100,
        durationMinutes: null,
        includes: [],
        excludes: [],
        cancellationPolicy,
      });
      toast.success("Service added to the Habitat catalog");
      setTitle("");
      setDescription("");
      setPriceRupees("");
      await load();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function addCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await api.post("/habitat/admin/categories", { name: categoryName });
      setCategoryName("");
      toast.success("Category added");
      await load();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  async function setProviderStatus(providerId: string, status: "APPROVED" | "REJECTED" | "SUSPENDED") {
    const reviewNote = providerNotes[providerId]?.trim() || (status === "APPROVED" ? "Approved by Truvi operations." : "");
    if (reviewNote.length < 3) {
      toast.error("Enter a review note before rejecting or suspending a provider");
      return;
    }
    try {
      await api.patch(`/habitat/admin/providers/${providerId}`, { status, reviewNote });
      toast.success(`Provider ${status.toLowerCase()}`);
      await load();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  async function assign(bookingId: string) {
    const providerId = assignments[bookingId];
    if (!providerId) return;
    try {
      await api.patch(`/habitat/admin/bookings/${bookingId}/assign`, { providerId });
      toast.success("Approved provider assigned");
      await load();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  async function toggleService(service: Service) {
    try {
      await api.patch(`/habitat/admin/services/${service._id}`, { active: !service.active });
      await load();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  async function revokeInvitation(invitation: Invitation) {
    try {
      await api.patch(`/habitat/admin/invitations/${invitation._id}/revoke`, {});
      toast.success("Invitation revoked");
      await load();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  async function toggleProject(project: Project) {
    try {
      await api.patch(`/habitat/admin/projects/${project.id}/habitat`, { enabled: !project.habitatEnabled });
      toast.success(`Habitat ${project.habitatEnabled ? "disabled" : "enabled"} for ${project.name}`);
      await load();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  function invitationUrl(code: string) {
    return `${window.location.origin}/habitat/invite/${encodeURIComponent(code)}`;
  }

  const eligibleProviders = (booking: Booking) => {
    const service = services.find((entry) => entry._id === booking.serviceId);
    return providers.filter((provider) =>
      provider.status === "APPROVED" &&
      Boolean(service && provider.categoryIds.includes(service.categoryId)) &&
      provider.serviceAreas.some((area) =>
        area.toLocaleLowerCase().includes(booking.serviceAddress.city.toLocaleLowerCase()) ||
        booking.serviceAddress.city.toLocaleLowerCase().includes(area.toLocaleLowerCase()),
      ),
    );
  };

  return (
    <main className="min-h-screen px-4 py-7 pb-28 text-white sm:px-6 md:px-10">
      <div className="mx-auto max-w-7xl">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-300">Operations · Home services</p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold">Truvi Habitat</h1>
            <p className="mt-1 text-sm text-white/50">Provider applications, service catalog, invitations, and manual booking assignment.</p>
          </div>
          <Button variant="secondary" onClick={() => void load()} disabled={loading}>Refresh</Button>
        </div>

        {loading ? <p className="mt-8 text-sm text-white/50">Loading Habitat operations…</p> : (
          <>
            <section className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
              <Metric label="Attributed buyers" value={overview?.attributedBuyers ?? 0} />
              <Metric label="Active services" value={overview?.activeServices ?? 0} />
              <Metric label="Pending providers" value={overview?.providers?.PENDING ?? 0} />
              <Metric label="Approved providers" value={overview?.providers?.APPROVED ?? 0} />
              <Metric label="Open requests" value={(overview?.bookings?.REQUESTED ?? 0) + (overview?.bookings?.PROVIDER_ASSIGNED ?? 0)} />
              <Metric label="Completed" value={overview?.bookings?.COMPLETED ?? 0} />
            </section>

            <div className="mt-7 grid gap-5 xl:grid-cols-2">
              <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
                <h2 className="text-lg font-semibold">Create a project invitation</h2>
                <p className="mt-1 text-xs text-white/50">The invitation code, not a client-supplied project ID, determines project attribution.</p>
                <form onSubmit={createInvitation} className="mt-4 grid gap-3 sm:grid-cols-2">
                  <label className="text-xs text-white/65">Approved project
                    <select required value={projectId} onChange={(event) => setProjectId(event.target.value)} className={field}>
                      {projects.filter((project) => project.habitatEnabled).map((project) => <option key={project.id} value={project.id}>{project.name} · {project.city}</option>)}
                    </select>
                  </label>
                  <label className="text-xs text-white/65">Campaign/source (optional)
                    <input maxLength={120} value={campaign} onChange={(event) => setCampaign(event.target.value)} className={field} />
                  </label>
                  <Button className="sm:col-span-2" type="submit" disabled={!projectId || !projects.some((project) => project.id === projectId && project.habitatEnabled) || saving}>{saving ? "Creating…" : "Generate invitation"}</Button>
                </form>
                {!projects.some((project) => project.habitatEnabled) && <p className="mt-3 text-xs text-amber-200">Enable Habitat for an approved project below before generating invitations.</p>}
                {newInvitation && (
                  <div className="mt-4 flex flex-wrap items-center gap-4 rounded-xl border border-emerald-300/20 bg-emerald-300/5 p-4">
                    <QRCodeSVG value={invitationUrl(newInvitation.code)} size={100} bgColor="transparent" fgColor="#d1fae5" />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{newInvitation.projectName}</p>
                      <p className="mt-1 break-all text-xs text-white/55">{invitationUrl(newInvitation.code)}</p>
                      <button
                        className="mt-2 text-xs text-emerald-300"
                        onClick={() => navigator.clipboard.writeText(invitationUrl(newInvitation.code)).then(() => toast.success("Invitation link copied")).catch(() => toast.error("Could not copy invitation link"))}
                      >
                        Copy invitation link
                      </button>
                    </div>
                  </div>
                )}
              </section>

              <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
                <h2 className="text-lg font-semibold">Add a service category</h2>
                <form onSubmit={addCategory} className="mt-4 flex gap-2">
                  <input required minLength={2} maxLength={80} value={categoryName} onChange={(event) => setCategoryName(event.target.value)} placeholder="e.g. Home automation" className={field} />
                  <Button type="submit" disabled={!categoryName.trim()}>Add</Button>
                </form>
                <div className="mt-4 flex flex-wrap gap-2">
                  {categories.map((category) => (
                    <button
                      key={category._id}
                      onClick={async () => {
                        try {
                          await api.patch(`/habitat/admin/categories/${category._id}`, { active: !category.active });
                          await load();
                        } catch (error) {
                          toast.error(errorMessage(error));
                        }
                      }}
                      className={`rounded-full border px-3 py-1.5 text-xs ${category.active ? "border-emerald-300/20 bg-emerald-300/10 text-emerald-100" : "border-white/10 text-white/40"}`}
                    >
                      {category.name} · {category.active ? "Active" : "Off"}
                    </button>
                  ))}
                </div>
              </section>
            </div>

            <section className="mt-5 rounded-2xl border border-white/10 bg-white/[0.035] p-5">
              <h2 className="text-lg font-semibold">Eligible projects</h2>
              <p className="mt-1 text-xs text-white/50">Habitat remains off for existing property listings until an administrator explicitly enables it.</p>
              <div className="mt-3 space-y-2">
                {projects.map((project) => (
                  <div key={project.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 px-3 py-3">
                    <div><p className="text-sm font-medium">{project.name}</p><p className="text-xs text-white/45">{project.city} · Approved property project</p></div>
                    <button onClick={() => void toggleProject(project)} className={`rounded-lg px-3 py-2 text-xs ${project.habitatEnabled ? "bg-emerald-300/10 text-emerald-200" : "border border-white/10 text-white/55"}`}>
                      {project.habitatEnabled ? "Habitat enabled · Turn off" : "Enable Habitat"}
                    </button>
                  </div>
                ))}
              </div>
            </section>

            <section className="mt-5 rounded-2xl border border-white/10 bg-white/[0.035] p-5">
              <h2 className="text-lg font-semibold">Publish a service</h2>
              <p className="mt-1 text-xs text-white/50">Quote-based services are shown without a fabricated fixed price. Prices are stored in paise.</p>
              <form onSubmit={createService} className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                <label className="text-xs text-white/65">Category
                  <select required value={categoryId} onChange={(event) => setCategoryId(event.target.value)} className={field}>
                    {categories.filter((category) => category.active).map((category) => <option key={category._id} value={category._id}>{category.name}</option>)}
                  </select>
                </label>
                <label className="text-xs text-white/65">Service title
                  <input required minLength={3} maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} className={field} />
                </label>
                <label className="text-xs text-white/65">Pricing model
                  <select value={priceModel} onChange={(event) => setPriceModel(event.target.value as typeof priceModel)} className={field}>
                    <option value="QUOTE">Inspection / quote</option>
                    <option value="FIXED">Fixed price</option>
                    <option value="STARTING_PRICE">Starting price</option>
                  </select>
                </label>
                {priceModel !== "QUOTE" && (
                  <label className="text-xs text-white/65">Price in rupees
                    <input type="number" min={1} step={1} required value={priceRupees} onChange={(event) => setPriceRupees(event.target.value)} className={field} />
                  </label>
                )}
                <label className="text-xs text-white/65 md:col-span-2">Description
                  <textarea required minLength={20} maxLength={3000} rows={2} value={description} onChange={(event) => setDescription(event.target.value)} className={field} />
                </label>
                <label className="text-xs text-white/65 md:col-span-2">Cancellation policy
                  <input required minLength={10} maxLength={1000} value={cancellationPolicy} onChange={(event) => setCancellationPolicy(event.target.value)} className={field} />
                </label>
                <div className="self-end"><Button type="submit" disabled={saving || !categoryId}>{saving ? "Saving…" : "Publish service"}</Button></div>
              </form>
              <div className="mt-4 space-y-2">
                {services.map((service) => (
                  <div key={service._id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 px-3 py-2.5">
                    <div><p className="text-sm font-medium">{service.title}</p><p className="text-xs text-white/45">{service.categoryName} · {service.pricingModel.replaceAll("_", " ")}</p></div>
                    <button onClick={() => void toggleService(service)} className="text-xs text-emerald-300">{service.active ? "Deactivate" : "Activate"}</button>
                  </div>
                ))}
              </div>
            </section>

            <section className="mt-5 rounded-2xl border border-white/10 bg-white/[0.035] p-5">
              <h2 className="text-lg font-semibold">Provider applications</h2>
              {providers.length === 0 ? <p className="mt-3 text-sm text-white/50">No provider applications yet.</p> : (
                <div className="mt-3 space-y-3">
                  {providers.map((provider) => (
                    <article key={provider._id} className="rounded-xl border border-white/10 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h3 className="font-medium">{provider.businessName}</h3>
                          <p className="mt-1 text-xs text-white/50">{provider.owner.ownerName} · {provider.owner.ownerEmail} · {provider.owner.ownerPhone || "No phone"} · {provider.serviceAreas.join(", ")}</p>
                          <p className="mt-1 text-xs text-white/50">{provider.categoryIds.map((id) => categories.find((category) => category._id === id)?.name).filter(Boolean).join(", ")} · {provider.experienceYears} years</p>
                          <p className="mt-2 max-w-3xl text-sm text-white/60">{provider.description}</p>
                        </div>
                        <span className="rounded-full bg-white/5 px-3 py-1 text-xs text-white/65">{provider.status}</span>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <input
                          aria-label={`Review note for ${provider.businessName}`}
                          placeholder="Review note (required to reject)"
                          value={providerNotes[provider._id] ?? provider.reviewNote ?? ""}
                          onChange={(event) => setProviderNotes((current) => ({ ...current, [provider._id]: event.target.value }))}
                          className="min-w-56 flex-1 rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-xs text-white"
                        />
                        {provider.status !== "APPROVED" && <button onClick={() => void setProviderStatus(provider._id, "APPROVED")} className="rounded-lg bg-emerald-300 px-3 py-2 text-xs font-semibold text-slate-950">Approve</button>}
                        {provider.status !== "REJECTED" && <button onClick={() => void setProviderStatus(provider._id, "REJECTED")} className="rounded-lg border border-rose-300/20 px-3 py-2 text-xs text-rose-200">Reject</button>}
                        {provider.status === "APPROVED" && <button onClick={() => void setProviderStatus(provider._id, "SUSPENDED")} className="rounded-lg border border-amber-300/20 px-3 py-2 text-xs text-amber-200">Suspend</button>}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>

            <section className="mt-5 rounded-2xl border border-white/10 bg-white/[0.035] p-5">
              <h2 className="text-lg font-semibold">Bookings & manual assignment</h2>
              {bookings.length === 0 ? <p className="mt-3 text-sm text-white/50">No booking requests yet.</p> : (
                <div className="mt-3 space-y-3">
                  {bookings.map((booking) => {
                    const candidates = eligibleProviders(booking);
                    return (
                      <article key={booking._id} className="rounded-xl border border-white/10 p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <h3 className="font-medium">{booking.serviceTitle} · {booking.reference}</h3>
                            <p className="mt-1 text-xs text-white/50">{booking.buyerName} · {booking.buyerPhone || "No phone"} · {new Date(booking.preferredAt).toLocaleString()}</p>
                            <p className="mt-1 text-xs text-white/50">{booking.serviceAddress.street}, {booking.serviceAddress.locality}, {booking.serviceAddress.city} {booking.serviceAddress.postalCode}</p>
                          </div>
                          <span className="rounded-full bg-white/5 px-3 py-1 text-xs text-white/65">{booking.status.replaceAll("_", " ")}</span>
                        </div>
                        {["REQUESTED", "REJECTED"].includes(booking.status) && (
                          <div className="mt-3 flex flex-wrap gap-2">
                            <select
                              value={assignments[booking._id] ?? ""}
                              onChange={(event) => setAssignments((current) => ({ ...current, [booking._id]: event.target.value }))}
                              className="min-w-56 rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-xs text-white"
                            >
                              <option value="">Choose an eligible approved provider</option>
                              {candidates.map((provider) => <option key={provider._id} value={provider._id}>{provider.businessName}</option>)}
                            </select>
                            <button disabled={!assignments[booking._id]} onClick={() => void assign(booking._id)} className="rounded-lg bg-emerald-300 px-3 py-2 text-xs font-semibold text-slate-950 disabled:opacity-40">Assign provider</button>
                          </div>
                        )}
                        {booking.providerName && <p className="mt-2 text-xs text-emerald-200">Assigned: {booking.providerName}</p>}
                      </article>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="mt-5 rounded-2xl border border-white/10 bg-white/[0.035] p-5">
              <h2 className="text-lg font-semibold">Project invitations</h2>
              <div className="mt-3 space-y-2">
                {invitations.map((invitation) => (
                  <div key={invitation._id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 px-3 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{invitation.projectName} · {invitation.city}</p>
                      <p className="mt-1 text-xs text-white/45">{invitation.registrations} registrations · {invitation.revoked ? "Revoked" : "Active"}</p>
                    </div>
                    <div className="flex gap-3">
                      <button onClick={() => navigator.clipboard.writeText(invitationUrl(invitation.code)).then(() => toast.success("Invitation link copied")).catch(() => toast.error("Could not copy invitation link"))} className="text-xs text-emerald-300">Copy link</button>
                      {!invitation.revoked && <button onClick={() => void revokeInvitation(invitation)} className="text-xs text-rose-300">Revoke</button>}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4"><p className="text-xs text-white/50">{label}</p><p className="mt-2 text-2xl font-semibold">{value}</p></div>;
}

import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";

type Category = { _id: string; name: string };
type Provider = {
  _id: string;
  businessName: string;
  description: string;
  categoryIds: string[];
  serviceAreas: string[];
  experienceYears: number;
  status: "PENDING" | "APPROVED" | "REJECTED" | "SUSPENDED";
  reviewNote: string | null;
};
type Booking = {
  _id: string;
  reference: string;
  status: string;
  serviceTitle: string;
  preferredAt: string;
  requestDetails: string | null;
  serviceAddress: { label: string; street: string; locality: string; city: string; postalCode: string; instructions?: string };
};

function getError(error: unknown) {
  if (typeof error === "object" && error !== null && "response" in error) {
    const response = (error as { response?: { data?: { error?: string } } }).response;
    if (response?.data?.error) return response.data.error;
  }
  return "Please try again.";
}

const inputClass = "mt-1 w-full rounded-xl border border-white/10 bg-slate-950/70 px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-400";

export default function HabitatProviderPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [provider, setProvider] = useState<Provider | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [businessName, setBusinessName] = useState("");
  const [description, setDescription] = useState("");
  const [serviceAreas, setServiceAreas] = useState("Lucknow");
  const [experienceYears, setExperienceYears] = useState(1);
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [categoryResponse, profileResponse] = await Promise.all([
        api.get("/habitat/categories"),
        api.get("/habitat/provider/me"),
      ]);
      setCategories(categoryResponse.data.categories);
      const current = profileResponse.data.provider as Provider | null;
      setProvider(current);
      if (current) {
        setBusinessName(current.businessName);
        setDescription(current.description);
        setServiceAreas(current.serviceAreas.join(", "));
        setExperienceYears(current.experienceYears);
        setCategoryIds(current.categoryIds);
        if (current.status === "APPROVED") {
          const bookingResponse = await api.get("/habitat/provider/bookings");
          setBookings(bookingResponse.data.bookings);
        } else {
          setBookings([]);
        }
      }
    } catch (error) {
      toast.error(getError(error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      await api.post("/habitat/providers/apply", {
        businessName,
        description,
        categoryIds,
        serviceAreas: serviceAreas.split(",").map((area) => area.trim()).filter(Boolean),
        experienceYears,
      });
      toast.success("Application submitted for Truvi review");
      await load();
    } catch (error) {
      toast.error(getError(error));
    } finally {
      setSaving(false);
    }
  }

  async function updateBooking(booking: Booking, status: "ACCEPTED" | "REJECTED" | "IN_PROGRESS" | "COMPLETION_SUBMITTED") {
    try {
      await api.patch(`/habitat/bookings/${booking._id}/provider-status`, { status });
      toast.success(status === "COMPLETION_SUBMITTED" ? "Completion sent to the buyer for confirmation" : `Booking ${status.toLowerCase()}`);
      await load();
    } catch (error) {
      toast.error(getError(error));
    }
  }

  const canEdit = !provider || provider.status === "REJECTED";

  return (
    <main className="min-h-screen px-4 py-8 pb-28 text-white sm:px-6 md:px-10">
      <div className="mx-auto max-w-5xl">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-300">Truvi Habitat · Provider</p>
        <h1 className="mt-2 text-3xl font-semibold">Grow your home-services business</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-white/55">
          Submit your service profile for review. Only approved providers can receive manually assigned Habitat requests.
        </p>

        {loading ? (
          <p className="mt-8 text-sm text-white/50">Loading provider workspace…</p>
        ) : canEdit ? (
          <form onSubmit={apply} className="mt-7 max-w-2xl rounded-2xl border border-white/10 bg-white/[0.035] p-5 sm:p-7">
            <h2 className="text-lg font-semibold">{provider ? "Update your application" : "Provider application"}</h2>
            {provider?.reviewNote && <p className="mt-2 rounded-xl bg-rose-400/10 p-3 text-sm text-rose-200">Review note: {provider.reviewNote}</p>}
            <label className="mt-4 block text-xs text-white/65">Business or professional name
              <input required minLength={2} maxLength={120} value={businessName} onChange={(event) => setBusinessName(event.target.value)} className={inputClass} />
            </label>
            <label className="mt-4 block text-xs text-white/65">About your experience and service quality
              <textarea required minLength={20} maxLength={2000} rows={4} value={description} onChange={(event) => setDescription(event.target.value)} className={inputClass} />
            </label>
            <label className="mt-4 block text-xs text-white/65">Service areas (comma-separated city/locality names)
              <input required value={serviceAreas} onChange={(event) => setServiceAreas(event.target.value)} placeholder="Gomti Nagar, Lucknow" className={inputClass} />
            </label>
            <label className="mt-4 block max-w-xs text-xs text-white/65">Years of experience
              <input type="number" required min={0} max={60} value={experienceYears} onChange={(event) => setExperienceYears(Number(event.target.value))} className={inputClass} />
            </label>
            <fieldset className="mt-5">
              <legend className="text-xs text-white/65">Services you can provide</legend>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {categories.map((category) => (
                  <label key={category._id} className="flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2.5 text-sm text-white/75">
                    <input
                      type="checkbox"
                      checked={categoryIds.includes(category._id)}
                      onChange={(event) => setCategoryIds((current) =>
                        event.target.checked
                          ? [...current, category._id]
                          : current.filter((id) => id !== category._id),
                      )}
                      className="accent-emerald-300"
                    />
                    {category.name}
                  </label>
                ))}
              </div>
            </fieldset>
            <p className="mt-4 text-xs leading-5 text-white/45">
              This initial application does not collect identity documents or payout details. Truvi operations will request any required verification securely during review.
            </p>
            <Button className="mt-5" type="submit" disabled={saving || categoryIds.length === 0}>
              {saving ? "Submitting…" : "Submit for review"}
            </Button>
          </form>
        ) : (
          <section className="mt-7 rounded-2xl border border-white/10 bg-white/[0.035] p-5 sm:p-7">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">{provider?.businessName}</h2>
                <p className="mt-1 text-sm text-white/55">{provider?.serviceAreas.join(" · ")}</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs ${provider?.status === "APPROVED" ? "bg-emerald-300/10 text-emerald-200" : "bg-amber-300/10 text-amber-100"}`}>
                {provider?.status}
              </span>
            </div>
            {provider?.reviewNote && <p className="mt-3 text-sm text-white/55">{provider.reviewNote}</p>}
            {provider?.status === "APPROVED" && (
              <div className="mt-7">
                <h3 className="font-semibold">Assigned service requests</h3>
                {bookings.length === 0 ? (
                  <p className="mt-3 text-sm text-white/50">No bookings have been assigned to you yet.</p>
                ) : (
                  <div className="mt-3 space-y-3">
                    {bookings.map((booking) => (
                      <article key={booking._id} className="rounded-xl border border-white/10 p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <h4 className="font-medium">{booking.serviceTitle}</h4>
                            <p className="mt-1 text-xs text-white/50">{booking.reference} · {new Date(booking.preferredAt).toLocaleString()}</p>
                            <p className="mt-1 text-xs text-white/60">
                              {booking.serviceAddress.label}: {booking.serviceAddress.street}, {booking.serviceAddress.locality}, {booking.serviceAddress.city} {booking.serviceAddress.postalCode}
                            </p>
                            {booking.requestDetails && <p className="mt-2 text-sm text-white/55">{booking.requestDetails}</p>}
                            {booking.serviceAddress.instructions && <p className="mt-1 text-xs text-white/45">Instructions: {booking.serviceAddress.instructions}</p>}
                          </div>
                          <span className="rounded-full bg-white/5 px-3 py-1 text-xs text-white/65">{booking.status.replaceAll("_", " ")}</span>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-3">
                          {booking.status === "PROVIDER_ASSIGNED" && (
                            <>
                              <button className="text-xs text-emerald-300" onClick={() => void updateBooking(booking, "ACCEPTED")}>Accept</button>
                              <button className="text-xs text-rose-300" onClick={() => void updateBooking(booking, "REJECTED")}>Decline</button>
                            </>
                          )}
                          {booking.status === "ACCEPTED" && <button className="text-xs text-emerald-300" onClick={() => void updateBooking(booking, "IN_PROGRESS")}>Start service</button>}
                          {booking.status === "IN_PROGRESS" && <button className="text-xs text-emerald-300" onClick={() => void updateBooking(booking, "COMPLETION_SUBMITTED")}>Submit completion</button>}
                          {booking.status === "COMPLETION_SUBMITTED" && <p className="text-xs text-amber-200">Waiting for the buyer to confirm completion.</p>}
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  );
}

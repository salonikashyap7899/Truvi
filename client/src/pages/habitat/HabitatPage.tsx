import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { loadRazorpay, openRazorpayCheckout } from "@/lib/razorpay";

type Category = { _id: string; name: string; slug: string; icon: string | null };
type Membership = { projectId: string; projectName: string; city: string };
type Service = {
  _id: string;
  categoryId: string;
  title: string;
  description: string;
  pricingModel: "FIXED" | "STARTING_PRICE" | "QUOTE";
  pricePaise: number | null;
  durationMinutes: number | null;
  includes: string[];
  excludes: string[];
  cancellationPolicy: string;
  availableProviderCount: number;
  availableProviders: { id: string; businessName: string; description: string; serviceAreas: string[]; experienceYears: number }[];
  averageRating: number | null;
  reviewCount: number;
  category: { name: string; slug: string; icon: string | null };
};
type Booking = {
  _id: string;
  reference: string;
  status: string;
  serviceTitle: string;
  providerName: string | null;
  estimatedAmountPaise: number | null;
  finalAmountPaise: number | null;
  preferredAt: string;
  serviceAddress: { label: string; locality: string; city: string };
  hasReview: string | null;
};

function displayPrice(paise: number | null, model: Service["pricingModel"]) {
  if (model === "QUOTE" || paise === null) return "Price after inspection";
  const formatted = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 })
    .format(paise / 100);
  return model === "STARTING_PRICE" ? `Starting at ${formatted}` : formatted;
}

function apiError(error: unknown, fallback: string) {
  if (typeof error === "object" && error !== null && "response" in error) {
    const response = (error as { response?: { data?: { error?: string } } }).response;
    if (response?.data?.error) return response.data.error;
  }
  return fallback;
}

const fieldClass =
  "mt-1 w-full rounded-xl border border-white/10 bg-slate-950/70 px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-400";

export default function HabitatPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [quotesByBooking, setQuotesByBooking] = useState<Record<string, {
    _id: string;
    amountPaise: number;
    workDescription: string;
    status: string;
    expiresAt: string;
  }[]>>({});
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [projectId, setProjectId] = useState("");
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [reviewRating, setReviewRating] = useState(5);
  const [address, setAddress] = useState({
    label: "Home",
    street: "",
    locality: "",
    city: "Lucknow",
    postalCode: "",
    instructions: "",
  });
  const [preferredDateTime, setPreferredDateTime] = useState("");
  const [requestDetails, setRequestDetails] = useState("");

  async function load() {
    setLoading(true);
    try {
      const [categoryResponse, membershipResponse, bookingResponse] = await Promise.all([
        api.get("/habitat/categories"),
        api.get("/habitat/memberships"),
        api.get("/habitat/bookings"),
      ]);
      setCategories(categoryResponse.data.categories);
      setMemberships(membershipResponse.data.memberships);
      setBookings(bookingResponse.data.bookings);
      const selectedMembership = membershipResponse.data.memberships.find((membership: Membership) => membership.projectId === projectId)
        ?? membershipResponse.data.memberships[0];
      setProjectId(
        selectedMembership?.projectId ?? "",
      );
      const serviceResponse = selectedMembership
        ? await api.get("/habitat/services", { params: { city: selectedMembership.city, projectId: selectedMembership.projectId } })
        : null;
      setServices(serviceResponse?.data.services ?? []);
      if (selectedMembership && address.city !== selectedMembership.city) {
        setAddress((current) => ({ ...current, city: selectedMembership.city }));
      }
    } catch (error) {
      toast.error(apiError(error, "Habitat could not be loaded. Please retry."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const visibleServices = useMemo(
    () => services.filter((service) => categoryFilter === "all" || service.categoryId === categoryFilter),
    [services, categoryFilter],
  );

  async function createBooking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedService || !projectId || !preferredDateTime) return;
    setSaving(true);
    try {
      await api.post("/habitat/bookings", {
        projectId,
        serviceId: selectedService._id,
        address,
        preferredAt: new Date(preferredDateTime).toISOString(),
        requestDetails,
        termsAccepted,
        idempotencyKey,
      });
      toast.success("Booking request sent. Truvi will assign an approved provider.");
      setSelectedService(null);
      setIdempotencyKey("");
      setTermsAccepted(false);
      setRequestDetails("");
      await load();
    } catch (error) {
      toast.error(apiError(error, "Booking request failed"));
    } finally {
      setSaving(false);
    }
  }

  async function loadQuotes(bookingId: string) {
    try {
      const response = await api.get(`/habitat/bookings/${bookingId}/quotes`);
      setQuotesByBooking((current) => ({ ...current, [bookingId]: response.data.quotes }));
    } catch (error) {
      toast.error(apiError(error, "Could not load provider quotes"));
    }
  }

  async function acceptQuote(bookingId: string, quoteId: string) {
    try {
      await api.post(`/habitat/bookings/${bookingId}/quotes/${quoteId}/accept`, {});
      toast.success("Quote approved. Payment is now due.");
      await load();
    } catch (error) {
      toast.error(apiError(error, "Quote could not be approved"));
    }
  }

  async function payBooking(booking: Booking) {
    setSaving(true);
    try {
      const orderResponse = await api.post(`/habitat/bookings/${booking._id}/payments/order`, {
        idempotencyKey: crypto.randomUUID(),
      });
      const ready = await loadRazorpay();
      if (!ready) throw new Error("Razorpay Checkout could not be loaded. Check your connection and retry.");
      openRazorpayCheckout({
        keyId: orderResponse.data.keyId,
        orderId: orderResponse.data.orderId,
        amount: orderResponse.data.amountPaise,
        name: "Truvi Habitat",
        description: `Home service ${booking.reference}`,
        prefill: orderResponse.data.prefill,
        onSuccess: async (payment) => {
          try {
            const verification = await api.post(`/habitat/bookings/${booking._id}/payments/verify`, payment);
            toast.success(verification.data.requiresRefund
              ? "Payment arrived after cancellation; the refund is being processed."
              : "Payment confirmed securely.");
            await load();
          } catch (error) {
            toast.error(apiError(error, "Payment confirmation is pending. Refresh before retrying payment."));
            await load();
          }
        },
        onDismiss: () => toast.info("Checkout closed. You can retry payment from this booking."),
      });
    } catch (error) {
      toast.error(apiError(error, "Checkout could not be started"));
    } finally {
      setSaving(false);
    }
  }

  async function cancelBooking(booking: Booking) {
    const reason = window.prompt("Why are you cancelling this service?");
    if (!reason || reason.trim().length < 3) return;
    try {
      const result = await api.post(`/habitat/bookings/${booking._id}/cancel`, {
        reason: reason.trim(),
        idempotencyKey: crypto.randomUUID(),
      });
      toast.success(result.data.refund
        ? `Cancellation recorded. Refund status: ${result.data.refund.status}.`
        : "Booking cancelled.");
      await load();
    } catch (error) {
      toast.error(apiError(error, "Booking could not be cancelled"));
    }
  }

  async function completeBooking(booking: Booking) {
    try {
      await api.post(`/habitat/bookings/${booking._id}/complete`, {});
      toast.success("Service confirmed complete");
      await load();
    } catch (error) {
      toast.error(apiError(error, "Completion could not be confirmed"));
    }
  }

  async function disputeBooking(booking: Booking) {
    const reason = window.prompt("Describe the issue (at least 10 characters).");
    if (!reason || reason.trim().length < 10) return;
    try {
      await api.post(`/habitat/bookings/${booking._id}/disputes`, { reason: reason.trim() });
      toast.success("Dispute opened. Provider payout is on hold while Truvi reviews it.");
      await load();
    } catch (error) {
      toast.error(apiError(error, "Dispute could not be opened"));
    }
  }

  async function submitReview(booking: Booking) {
    try {
      await api.post(`/habitat/bookings/${booking._id}/reviews`, {
        rating: reviewRating,
        comment: "",
      });
      toast.success("Thank you for reviewing the service");
      await load();
    } catch (error) {
      toast.error(apiError(error, "Review could not be submitted"));
    }
  }

  return (
    <main className="min-h-screen px-4 py-8 pb-28 text-white sm:px-6 md:px-10">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-300">Truvi Habitat</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">A better home, taken care of.</h1>
            <p className="mt-2 max-w-2xl text-sm text-white/60">
              Find reviewed home services from your project invitation. Booking requests are confirmed by the Truvi operations team.
            </p>
          </div>
          <Link to="/habitat/provider" className="text-sm text-emerald-300 hover:text-emerald-200">
            Become a service provider
          </Link>
        </div>

        {memberships.length === 0 ? (
          <div className="mt-7 rounded-2xl border border-amber-300/20 bg-amber-300/5 p-5">
            <h2 className="font-medium text-amber-100">Project invitation required</h2>
            <p className="mt-1 text-sm text-white/60">
              Use the unique Habitat invitation shared by your developer to connect this account to an eligible project.
            </p>
            <InviteCodeForm />
          </div>
        ) : (
          <label className="mt-7 block max-w-md text-sm text-white/65">
            Your project
            <select
              value={projectId}
              onChange={(event) => {
                const membership = memberships.find((entry) => entry.projectId === event.target.value);
                setProjectId(event.target.value);
                if (membership) {
                  setAddress((current) => ({ ...current, city: membership.city }));
                  api.get("/habitat/services", { params: { city: membership.city, projectId: membership.projectId } })
                    .then((response) => setServices(response.data.services))
                    .catch((error) => toast.error(apiError(error, "Could not check services for this project")));
                }
              }}
              className={fieldClass}
            >
              {memberships.map((membership) => <option key={membership.projectId} value={membership.projectId}>{membership.projectName} · {membership.city}</option>)}
            </select>
          </label>
        )}

        <section className="mt-8">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">Services for your home</h2>
              <p className="mt-1 text-sm text-white/50">Availability and price are verified again when your request is submitted.</p>
            </div>
            <select
              aria-label="Filter services by category"
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
              className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white"
            >
              <option value="all">All categories</option>
              {categories.map((category) => <option key={category._id} value={category._id}>{category.name}</option>)}
            </select>
          </div>
          {loading ? (
            <p className="py-10 text-sm text-white/50">Loading Habitat services…</p>
          ) : memberships.length === 0 ? (
            <p className="mt-4 text-sm text-white/50">Join an eligible project to browse services available near your home.</p>
          ) : visibleServices.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-sm text-white/55">
              No active services are available yet. Please check again soon.
            </div>
          ) : (
            <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {visibleServices.map((service) => (
                <article key={service._id} className="flex flex-col rounded-2xl border border-white/10 bg-white/[0.035] p-5">
                  <div className="text-xs uppercase tracking-wider text-emerald-300">{service.category.name}</div>
                  <h3 className="mt-2 text-lg font-semibold">{service.title}</h3>
                  <p className="mt-2 line-clamp-3 min-h-12 text-sm leading-6 text-white/55">{service.description}</p>
                  <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/45">
                    <span>{displayPrice(service.pricePaise, service.pricingModel)}</span>
                    {service.durationMinutes && <span>About {service.durationMinutes} min</span>}
                    <span>{service.availableProviderCount} approved {service.availableProviderCount === 1 ? "provider" : "providers"}</span>
                    {service.averageRating !== null && <span>★ {service.averageRating} ({service.reviewCount})</span>}
                  </div>
                  {service.availableProviders.length > 0 && (
                    <div className="mt-3 border-t border-white/5 pt-3">
                      <p className="text-[11px] uppercase tracking-wider text-white/40">Approved local providers</p>
                      {service.availableProviders.slice(0, 2).map((provider) => (
                        <p key={provider.id} className="mt-1 text-xs text-white/65">
                          {provider.businessName} · {provider.experienceYears} yrs experience
                        </p>
                      ))}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedService(service);
                      setIdempotencyKey(crypto.randomUUID());
                      setTermsAccepted(false);
                    }}
                    disabled={memberships.length === 0}
                    className="mt-5 rounded-xl bg-emerald-300 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Request service
                  </button>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="mt-10">
          <h2 className="text-xl font-semibold">Your Habitat bookings</h2>
          {bookings.length === 0 ? (
            <p className="mt-3 text-sm text-white/50">Your booking requests and their progress will appear here.</p>
          ) : (
            <div className="mt-4 space-y-3">
              {bookings.map((booking) => (
                <article key={booking._id} className="rounded-2xl border border-white/10 bg-white/[0.035] p-4 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold">{booking.serviceTitle}</h3>
                      <p className="mt-1 text-xs text-white/50">{booking.reference} · {new Date(booking.preferredAt).toLocaleString()}</p>
                      <p className="mt-1 text-xs text-white/50">{booking.serviceAddress.label} · {booking.serviceAddress.locality}, {booking.serviceAddress.city}</p>
                      {booking.providerName && <p className="mt-1 text-xs text-white/50">Provider: {booking.providerName}</p>}
                    </div>
                    <span className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1 text-xs text-emerald-200">
                      {booking.status.replaceAll("_", " ")}
                    </span>
                  </div>
                  <p className="mt-3 text-sm text-white/60">
                    {booking.estimatedAmountPaise === null
                      ? "Final price will be shared after an inspection."
                      : `Estimated price: ${displayPrice(booking.estimatedAmountPaise, "FIXED")}`}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {["REQUESTED", "PROVIDER_ASSIGNED", "ACCEPTED", "QUOTE_PROVIDED", "PAYMENT_PENDING", "PAID"].includes(booking.status) && (
                      <button className="text-xs text-rose-300 hover:text-rose-200" onClick={() => void cancelBooking(booking)}>Cancel booking</button>
                    )}
                    {booking.status === "QUOTE_PROVIDED" && (
                      <button className="text-xs text-emerald-300 hover:text-emerald-200" onClick={() => void loadQuotes(booking._id)}>Review provider quote</button>
                    )}
                    {["ACCEPTED", "PAYMENT_PENDING"].includes(booking.status) && (
                      <button disabled={saving} className="text-xs text-emerald-300 hover:text-emerald-200 disabled:opacity-50" onClick={() => void payBooking(booking)}>
                        {saving ? "Opening checkout…" : "Pay securely"}
                      </button>
                    )}
                    {booking.status === "COMPLETION_SUBMITTED" && (
                      <>
                        <button className="text-xs text-emerald-300 hover:text-emerald-200" onClick={() => void completeBooking(booking)}>Confirm completion</button>
                        <button className="text-xs text-rose-300 hover:text-rose-200" onClick={() => void disputeBooking(booking)}>Report an issue</button>
                      </>
                    )}
                    {booking.status === "COMPLETED" && !booking.hasReview && (
                      <>
                        <label className="flex items-center gap-2 text-xs text-white/60">
                          Rate service
                          <select value={reviewRating} onChange={(event) => setReviewRating(Number(event.target.value))} className="rounded-lg border border-white/10 bg-slate-950 px-2 py-1 text-white">
                            {[5, 4, 3, 2, 1].map((rating) => <option key={rating} value={rating}>{rating} stars</option>)}
                          </select>
                        </label>
                        <button className="text-xs text-emerald-300 hover:text-emerald-200" onClick={() => void submitReview(booking)}>Submit review</button>
                      </>
                    )}
                  </div>
                  {quotesByBooking[booking._id]?.map((quote) => (
                    <div key={quote._id} className="mt-3 rounded-xl border border-emerald-300/15 bg-emerald-300/5 p-3">
                      <p className="text-sm font-medium">Provider quote: {displayPrice(quote.amountPaise, "FIXED")}</p>
                      <p className="mt-1 text-xs leading-5 text-white/60">{quote.workDescription}</p>
                      <p className="mt-1 text-[11px] text-white/40">Expires {new Date(quote.expiresAt).toLocaleString()}</p>
                      {quote.status === "PROPOSED" && booking.status === "QUOTE_PROVIDED" && (
                        <button className="mt-2 text-xs font-medium text-emerald-300" onClick={() => void acceptQuote(booking._id, quote._id)}>
                          Approve quote and continue to payment
                        </button>
                      )}
                    </div>
                  ))}
                </article>
              ))}
            </div>
          )}
        </section>
      </div>

      {selectedService && (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-black/75 p-4" role="dialog" aria-modal="true" aria-labelledby="habitat-book-title">
          <form onSubmit={createBooking} className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-3xl border border-white/10 bg-slate-950 p-5 shadow-2xl sm:p-7">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-wider text-emerald-300">{selectedService.category.name}</p>
                <h2 id="habitat-book-title" className="mt-1 text-xl font-semibold">{selectedService.title}</h2>
              </div>
              <button type="button" onClick={() => setSelectedService(null)} aria-label="Close booking form" className="text-2xl leading-none text-white/50 hover:text-white">×</button>
            </div>
            <p className="mt-3 text-sm leading-6 text-white/60">{selectedService.description}</p>
            {selectedService.includes.length > 0 && <p className="mt-3 text-xs text-white/55">Includes: {selectedService.includes.join(", ")}</p>}
            {selectedService.excludes.length > 0 && <p className="mt-1 text-xs text-white/55">Not included: {selectedService.excludes.join(", ")}</p>}
            <p className="mt-3 rounded-xl bg-white/5 p-3 text-xs leading-5 text-white/60">
              Cancellation policy: {selectedService.cancellationPolicy}
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Field label="Address label"><input required maxLength={60} value={address.label} onChange={(e) => setAddress({ ...address, label: e.target.value })} className={fieldClass} /></Field>
              <Field label="Street address"><input required maxLength={200} value={address.street} onChange={(e) => setAddress({ ...address, street: e.target.value })} className={fieldClass} /></Field>
              <Field label="Locality"><input required maxLength={120} value={address.locality} onChange={(e) => setAddress({ ...address, locality: e.target.value })} className={fieldClass} /></Field>
              <Field label="City"><input required maxLength={100} value={address.city} onChange={(e) => setAddress({ ...address, city: e.target.value })} className={fieldClass} /></Field>
              <Field label="PIN code"><input required inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={address.postalCode} onChange={(e) => setAddress({ ...address, postalCode: e.target.value })} className={fieldClass} /></Field>
              <Field label="Preferred date & time"><input required type="datetime-local" value={preferredDateTime} onChange={(e) => setPreferredDateTime(e.target.value)} className={fieldClass} /></Field>
            </div>
            <Field label="Instructions for the service team (optional)">
              <textarea rows={2} maxLength={500} value={address.instructions} onChange={(e) => setAddress({ ...address, instructions: e.target.value })} className={fieldClass} />
            </Field>
            <Field label="What should the provider know? (optional)">
              <textarea rows={3} maxLength={1500} value={requestDetails} onChange={(e) => setRequestDetails(e.target.value)} className={fieldClass} />
            </Field>
            <p className="mt-3 text-xs text-white/45">
              {displayPrice(selectedService.pricePaise, selectedService.pricingModel)} · This is a request, not a payment. A provider and final price will be confirmed before work begins.
            </p>
            <label className="mt-4 flex items-start gap-2 text-xs leading-5 text-white/65">
              <input required type="checkbox" checked={termsAccepted} onChange={(event) => setTermsAccepted(event.target.checked)} className="mt-0.5 accent-emerald-300" />
              I accept the cancellation policy and understand this request does not charge me.
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setSelectedService(null)}>Close</Button>
              <Button type="submit" disabled={saving || !projectId || !termsAccepted}>{saving ? "Sending…" : "Submit request"}</Button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="mt-3 block text-xs text-white/65">{label}{children}</label>;
}

function InviteCodeForm() {
  const [code, setCode] = useState("");
  return (
    <form
      className="mt-4 flex max-w-lg gap-2"
      onSubmit={(event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (code.trim()) window.location.assign(`/habitat/invite/${encodeURIComponent(code.trim())}`);
      }}
    >
      <input value={code} onChange={(event) => setCode(event.target.value)} placeholder="Invitation code" className={fieldClass} />
      <Button type="submit" disabled={!code.trim()}>Continue</Button>
    </form>
  );
}

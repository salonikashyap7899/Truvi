import { useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/primitives";
import { toast } from "sonner";
import { Loader2, Save, Plus, Trash2, Building2, MapPin } from "lucide-react";
import { lazy, Suspense } from "react";
import type { PaymentPlan, Project } from "@/types";
import { geocodeAddress, isGeocodingConfigured } from "@/lib/googleMaps";

// Lazy so Leaflet only downloads when a project editor is actually opened.
const MapPinPicker = lazy(() => import("@/components/MapPinPicker"));

/**
 * Developer-facing editor for the project's commercial details: name,
 * location, RERA number, possession date, sales contact, and payment
 * plans / offers. Everything saves through PATCH /api/projects/:id and
 * shows up on the public presentation page immediately.
 */
export default function ProjectDetailsEditor({
  project,
  onUpdated,
}: {
  project: Project;
  onUpdated: (p: Project) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState(project.name);
  const [city, setCity] = useState(project.city);
  const [location, setLocation] = useState(project.location);
  const [reraNumber, setReraNumber] = useState(project.reraNumber ?? "");
  const [possessionDate, setPossessionDate] = useState(
    project.possessionDate ? project.possessionDate.slice(0, 10) : ""
  );
  const [contactName, setContactName] = useState(project.salesContact?.name ?? "");
  const [contactPhone, setContactPhone] = useState(project.salesContact?.phone ?? "");
  const [contactEmail, setContactEmail] = useState(project.salesContact?.email ?? "");
  const [plans, setPlans] = useState<PaymentPlan[]>(project.paymentPlans ?? []);
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(
    typeof project.lat === "number" && typeof project.lng === "number"
      ? { lat: project.lat, lng: project.lng }
      : null
  );
  const [locating, setLocating] = useState(false);

  async function autoLocate() {
    if (!isGeocodingConfigured()) {
      toast.error("Map auto-locate isn't set up yet. Drop the pin on the map manually for now.");
      return;
    }
    const q = [location.trim(), city.trim(), "India"].filter(Boolean).join(", ");
    if (q.length < 5) {
      toast.error("Enter the location/area and city first");
      return;
    }
    setLocating(true);
    try {
      const r = await geocodeAddress(q);
      setPin({ lat: r.lat, lng: r.lng });
      toast.success(`Located: ${r.formattedAddress}`);
    } catch (err: any) {
      const reason = String(err?.message || "");
      const hint =
        reason === "ZERO_RESULTS" ? "No match for that address — add a landmark, or drop the pin manually."
        : reason === "REQUEST_DENIED" ? "Google denied the request — check the API key's billing & restrictions."
        : reason === "OVER_QUERY_LIMIT" ? "Google quota exceeded — check billing on the Maps key."
        : reason ? `Auto-locate failed (${reason}) — drop the pin manually.`
        : "Could not locate this address — drop the pin manually.";
      toast.error(hint);
    } finally {
      setLocating(false);
    }
  }

  function patchPlan(i: number, key: keyof PaymentPlan, value: string) {
    setPlans((prev) => prev.map((p, idx) => (idx === i ? { ...p, [key]: value } : p)));
  }

  async function save() {
    if (name.trim().length < 2 || city.trim().length < 2 || location.trim().length < 2) {
      toast.error("Name, city and location are required");
      return;
    }
    setSaving(true);
    try {
      const res = await api.patch(`/projects/${project._id}`, {
        name: name.trim(),
        city: city.trim(),
        location: location.trim(),
        reraNumber: reraNumber.trim(),
        possessionDate: possessionDate ? new Date(possessionDate).toISOString() : null,
        salesContact:
          contactName || contactPhone || contactEmail
            ? { name: contactName || undefined, phone: contactPhone || undefined, email: contactEmail || "" }
            : null,
        paymentPlans: plans.filter((p) => p.name.trim()).length
          ? plans.filter((p) => p.name.trim())
          : null,
        lat: pin?.lat ?? null,
        lng: pin?.lng ?? null,
      });
      onUpdated(res.data.project);
      toast.success("Project details saved");
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to save project details");
    } finally {
      setSaving(false);
    }
  }

  const inputCls = "border-white/15 bg-card text-white";

  return (
    <section className="mt-8">
      <h2 className="flex items-center gap-2 text-lg font-medium">
        <Building2 size={17} className="text-[var(--trust)]" /> Project Details
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Name, location, RERA, possession date, sales contact and payment plans — all shown to buyers.
      </p>

      <div className="mt-4 rounded-lg border border-white/10 glass p-4 space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <Label className="text-foreground/90">Project name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
          </div>
          <div>
            <Label className="text-foreground/90">City</Label>
            <Input value={city} onChange={(e) => setCity(e.target.value)} className={inputCls} />
          </div>
          <div>
            <Label className="text-foreground/90">Location / area</Label>
            <Input value={location} onChange={(e) => setLocation(e.target.value)} className={inputCls} />
          </div>
          <div>
            <Label className="text-foreground/90">RERA number</Label>
            <Input value={reraNumber} onChange={(e) => setReraNumber(e.target.value)} placeholder="UPRERAPRJ…" className={inputCls} />
          </div>
          <div>
            <Label className="text-foreground/90">Possession date</Label>
            <Input type="date" value={possessionDate} onChange={(e) => setPossessionDate(e.target.value)} className={inputCls} />
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-300">Sales contact (shown to buyers)</p>
          <div className="mt-2 grid gap-3 sm:grid-cols-3">
            <div>
              <Label className="text-foreground/90">Contact name</Label>
              <Input value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="Sales office" className={inputCls} />
            </div>
            <div>
              <Label className="text-foreground/90">Phone</Label>
              <Input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="98765 43210" className={inputCls} />
            </div>
            <div>
              <Label className="text-foreground/90">Email</Label>
              <Input value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="sales@…" className={inputCls} />
            </div>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-300">Payment plans &amp; offers</p>
            <Button size="sm" variant="secondary" onClick={() => setPlans((p) => [...p, { name: "", description: "" }])}>
              <Plus size={13} className="mr-1" /> Add plan
            </Button>
          </div>
          {plans.length === 0 && (
            <p className="mt-2 text-sm text-muted-foreground">No payment plans yet — e.g. “20:80 plan”, “No EMI till possession”.</p>
          )}
          <div className="mt-2 space-y-2">
            {plans.map((plan, i) => (
              <div key={i} className="flex flex-col gap-2 sm:flex-row">
                <Input
                  value={plan.name}
                  onChange={(e) => patchPlan(i, "name", e.target.value)}
                  placeholder="Plan / offer name (e.g. 20:80 Payment Plan)"
                  className={`${inputCls} sm:w-64`}
                />
                <Input
                  value={plan.description ?? ""}
                  onChange={(e) => patchPlan(i, "description", e.target.value)}
                  placeholder="Details (e.g. 20% on booking, 80% on possession)"
                  className={`${inputCls} flex-1`}
                />
                <button
                  onClick={() => setPlans((prev) => prev.filter((_, idx) => idx !== i))}
                  title="Remove plan"
                  className="self-center text-red-400/70 hover:text-red-400"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-300">Map location (shown on the Truvi project map)</p>
            <Button size="sm" variant="secondary" onClick={autoLocate} disabled={locating}>
              {locating ? <Loader2 size={13} className="mr-1.5 animate-spin" /> : <MapPin size={13} className="mr-1.5" />}
              Auto-locate from address
            </Button>
          </div>
          <div className="mt-2">
            <Suspense fallback={<div className="tv-skeleton h-[280px] rounded-xl" />}>
              <MapPinPicker value={pin} onChange={setPin} />
            </Suspense>
          </div>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            Click <b>Auto-locate</b> to place the pin from the city/area above, or click the map to set it manually.
          </p>
        </div>

        <Button size="sm" onClick={save} disabled={saving}>
          {saving ? <Loader2 size={13} className="mr-1.5 animate-spin" /> : <Save size={13} className="mr-1.5" />}
          Save Project Details
        </Button>
      </div>
    </section>
  );
}

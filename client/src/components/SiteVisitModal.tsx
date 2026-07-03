import { useState } from "react";
import { X } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/primitives";
import { toast } from "sonner";

interface SiteVisitModalProps {
  projectId: string;
  projectName: string;
  onClose: () => void;
  onSuccess?: () => void;
}

const TIME_SLOTS = [
  "Morning (9am – 12pm)",
  "Afternoon (12pm – 4pm)",
  "Evening (4pm – 7pm)",
];

function today() {
  return new Date().toISOString().split("T")[0];
}

export function SiteVisitModal({
  projectId,
  projectName,
  onClose,
  onSuccess,
}: SiteVisitModalProps) {
  const [form, setForm] = useState({
    preferredDate: "",
    timeSlot: "",
    contactNumber: "",
    notes: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  function set(field: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
    setErrors((e) => ({ ...e, [field]: "" }));
  }

  function validate() {
    const errs: Record<string, string> = {};
    if (!form.preferredDate) errs.preferredDate = "Please pick a date.";
    if (!form.timeSlot) errs.timeSlot = "Please select a time slot.";
    if (!form.contactNumber) {
      errs.contactNumber = "Contact number is required.";
    } else if (!/^[6-9]\d{9}$/.test(form.contactNumber)) {
      errs.contactNumber = "Enter a valid 10-digit Indian mobile number.";
    }
    return errs;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }

    setSubmitting(true);
    try {
      // Combine date + an approximate time from the slot for scheduledAt
      const scheduledAt = new Date(`${form.preferredDate}T09:00:00`).toISOString();
      await api.post("/site-visits", {
        projectId,
        scheduledAt,
        timeSlot: form.timeSlot,
        contactNumber: form.contactNumber,
        notes: form.notes || undefined,
      });
      toast.success("Site visit requested! We'll confirm your slot soon.");
      onSuccess?.();
      onClose();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to submit request");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md rounded-2xl border border-neutral-700 bg-[#0f1724] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-800 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-white">Request Site Visit</h2>
            <p className="mt-0.5 text-xs text-neutral-400 truncate max-w-[280px]">{projectName}</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-1.5 text-neutral-400 hover:bg-white/10 hover:text-white transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4 px-5 py-5">
          {/* Date */}
          <div>
            <Label htmlFor="sv-date">Preferred date</Label>
            <Input
              id="sv-date"
              type="date"
              min={today()}
              value={form.preferredDate}
              onChange={(e) => set("preferredDate", e.target.value)}
              className="text-white [color-scheme:dark]"
            />
            {errors.preferredDate && (
              <p className="mt-1 text-xs text-red-400">{errors.preferredDate}</p>
            )}
          </div>

          {/* Time slot */}
          <div>
            <Label htmlFor="sv-slot">Preferred time slot</Label>
            <select
              id="sv-slot"
              value={form.timeSlot}
              onChange={(e) => set("timeSlot", e.target.value)}
              className="h-10 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 text-sm text-white outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            >
              <option value="">Select a slot…</option>
              {TIME_SLOTS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            {errors.timeSlot && (
              <p className="mt-1 text-xs text-red-400">{errors.timeSlot}</p>
            )}
          </div>

          {/* Contact number */}
          <div>
            <Label htmlFor="sv-phone">Contact number</Label>
            <Input
              id="sv-phone"
              type="tel"
              placeholder="10-digit mobile number"
              maxLength={10}
              value={form.contactNumber}
              onChange={(e) => set("contactNumber", e.target.value.replace(/\D/g, ""))}
              className="text-white"
            />
            {errors.contactNumber && (
              <p className="mt-1 text-xs text-red-400">{errors.contactNumber}</p>
            )}
          </div>

          {/* Notes */}
          <div>
            <Label htmlFor="sv-notes">Notes <span className="text-neutral-500">(optional)</span></Label>
            <Textarea
              id="sv-notes"
              rows={3}
              placeholder="Any specific requirements or questions…"
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              className="text-white resize-none"
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-1">
            <Button type="button" variant="secondary" size="sm" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={submitting}>
              {submitting ? "Submitting…" : "Request Visit"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

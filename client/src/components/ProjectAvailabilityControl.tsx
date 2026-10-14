import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { Project, ProjectAvailabilityStatus } from "@/types";
import SoldOutBadge from "@/components/SoldOutBadge";

interface Props {
  project: Project;
  onUpdated: (project: Project) => void;
}

export default function ProjectAvailabilityControl({ project, onUpdated }: Props) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const isSoldOut = project.availabilityStatus === "SOLD_OUT";
  const nextStatus: ProjectAvailabilityStatus = isSoldOut ? "AVAILABLE" : "SOLD_OUT";

  async function updateAvailability() {
    setSaving(true);
    try {
      const response = await api.patch(`/projects/${project._id}`, { availabilityStatus: nextStatus });
      onUpdated(response.data.project);
      setDialogOpen(false);
      toast.success(isSoldOut ? "Project reopened" : "Project marked as sold out");
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Couldn't update project availability");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        {isSoldOut && <SoldOutBadge />}
        <button
          type="button"
          onClick={() => setDialogOpen(true)}
          className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
            isSoldOut
              ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20"
              : "border-red-400/40 bg-red-500/10 text-red-200 hover:bg-red-500/20"
          }`}
        >
          {isSoldOut ? "Mark as Available / Reopen Project" : "Mark Entire Project as Sold Out"}
        </button>
      </div>

      {dialogOpen && (
        <div className="fixed inset-0 z-[120] grid place-items-center bg-black/70 p-4 backdrop-blur-sm">
          <section
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="project-availability-title"
            className="w-full max-w-lg rounded-2xl border border-white/15 bg-[#0a0d14] p-6 text-white shadow-2xl"
          >
            <h2 id="project-availability-title" className="text-lg font-semibold">
              {isSoldOut ? "Reopen project?" : "Mark project as sold out?"}
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-white/75">
              {isSoldOut
                ? "Are you sure you want to reopen this project? Booking options will be restored only where other availability and approval rules allow them."
                : "Are you sure you want to mark this entire project as SOLD OUT? The project will remain visible on the website, but it will no longer accept new bookings."}
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                disabled={saving}
                onClick={() => setDialogOpen(false)}
                className="rounded-full border border-white/20 px-4 py-2 text-sm font-medium text-white/80 hover:bg-white/5 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={updateAvailability}
                className="inline-flex items-center gap-2 rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-50"
              >
                {saving && <Loader2 size={14} className="animate-spin" />}
                {isSoldOut ? "Reopen Project" : "Confirm Sold Out"}
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}

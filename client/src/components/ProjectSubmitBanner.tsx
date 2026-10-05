import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { CheckCircle2, Circle, FileClock, Loader2, Send } from "lucide-react";
import type { Project } from "@/types";

/**
 * Shown on the developer's project workspace while a listing is a DRAFT (or
 * was rejected): what it still needs, and a "Submit for approval" button that
 * sends it to the admin review queue. A draft is never reviewed or published
 * until it's submitted, so a half-finished listing is simply kept safe here.
 */
export default function ProjectSubmitBanner({
  project,
  unitCount,
  onSubmitted,
}: {
  project: Project;
  /** Re-check the list whenever the inventory changes. */
  unitCount: number;
  onSubmitted: (project: Project) => void;
}) {
  const [missing, setMissing] = useState<string[] | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const check = useCallback(() => {
    api
      .get(`/projects/${project._id}/submission`)
      .then((res) => setMissing(res.data.missing ?? []))
      .catch(() => setMissing(null));
  }, [project._id]);

  useEffect(() => {
    check();
  }, [check, unitCount, project.projectType, project.totalUnits]);

  // Photos and other assets are added in other panels on this page, so keep
  // the checklist fresh while something is still missing.
  const incomplete = missing === null || missing.length > 0;
  useEffect(() => {
    if (!incomplete) return;
    const t = window.setInterval(check, 10_000);
    window.addEventListener("focus", check);
    return () => {
      window.clearInterval(t);
      window.removeEventListener("focus", check);
    };
  }, [incomplete, check]);

  async function submit() {
    setSubmitting(true);
    try {
      const res = await api.post(`/projects/${project._id}/submit`);
      toast.success("Submitted for approval — our team will review it shortly.");
      onSubmitted(res.data.project);
    } catch (err: any) {
      const data = err?.response?.data;
      if (Array.isArray(data?.missing)) setMissing(data.missing);
      toast.error(data?.error || "Couldn't submit right now. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const rejected = project.approvalStatus === "REJECTED";
  const ready = missing !== null && missing.length === 0;
  const steps = [
    { label: "Project type", done: !missing?.includes("Project type") },
    { label: "At least one project photo", done: !missing?.includes("At least one project photo") },
    { label: "Inventory (units or total plots/units)", done: !missing?.some((m) => m.startsWith("Inventory")) },
  ];

  return (
    <section className="mt-6 rounded-2xl border border-amber-400/30 bg-amber-500/[0.06] p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-base font-semibold text-amber-200">
            <FileClock size={17} /> {rejected ? "Not approved — update and resubmit" : "Draft — saved, not yet submitted"}
          </p>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            {rejected
              ? "Fix what the review flagged, then submit the listing again."
              : "Your project is saved as a draft. It's only sent to the Truvi team for approval when you submit it. Finish the essentials below, then submit."}
          </p>
          {missing !== null && (
            <ul className="mt-3 space-y-1.5 text-sm">
              {steps.map((s) => (
                <li key={s.label} className={`flex items-center gap-2 ${s.done ? "text-emerald-300" : "text-foreground/85"}`}>
                  {s.done ? <CheckCircle2 size={15} /> : <Circle size={15} className="text-amber-300" />} {s.label}
                </li>
              ))}
            </ul>
          )}
        </div>
        <button
          type="button"
          onClick={submit}
          disabled={submitting}
          title={ready ? undefined : "Finish the items in the checklist first"}
          className="inline-flex shrink-0 items-center gap-2 rounded-full bg-gradient-to-r from-[var(--trust)] to-[#2563eb] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_10px_30px_-8px_rgba(59,130,246,0.7)] transition disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
          {submitting ? "Submitting…" : rejected ? "Resubmit for approval" : "Submit for approval"}
        </button>
      </div>
    </section>
  );
}

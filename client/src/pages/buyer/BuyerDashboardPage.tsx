import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, Badge } from "@/components/ui/primitives";
import { formatINR } from "@/lib/utils";
import { toast } from "sonner";
import type { Project } from "@/types";

export default function BuyerDashboardPage() {
  const [savedProjects, setSavedProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadSavedProjects() {
    setLoading(true);
    try {
      const res = await api.get("/buyer/dashboard");
      setSavedProjects(res.data.savedProjects || []);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to load saved projects");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSavedProjects();
  }, []);

  async function requestSiteVisit(projectId: string) {
    try {
      await api.post("/site-visits", {
        projectId,
        scheduledAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
        notes: "Buyer requested a site visit via Truvi",
      });
      toast.success("Site visit request submitted. The channel partner will follow up soon.");
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to request a site visit");
    }
  }

  return (
    <main className="min-h-screen bg-[#0B1220] p-6 text-white md:p-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Buyer Dashboard</h1>
          <p className="mt-1 text-sm text-neutral-400">A curated view of your saved projects, comparison shortlist, and upcoming visits.</p>
        </div>
      </div>

      <section className="mt-8 grid gap-4 lg:grid-cols-2">
        <Card className="border-neutral-800 bg-[#121A2B] text-white">
          <h2 className="text-lg font-medium">Saved Properties</h2>
          <div className="mt-4 space-y-4">
            {loading ? (
              <p className="text-sm text-neutral-500">Loading saved properties…</p>
            ) : savedProjects.length === 0 ? (
              <p className="text-sm text-neutral-500">No saved properties yet. Save a listing from the project page to begin.</p>
            ) : (
              savedProjects.map((project) => (
                <div key={project._id} className="rounded-2xl border border-neutral-800 bg-[#141d2f] p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <h3 className="text-base font-semibold">{project.name}</h3>
                      <p className="text-sm text-neutral-400">{project.location}, {project.city}</p>
                    </div>
                    <Badge variant={project.approvalStatus === "APPROVED" ? "success" : "warning"}>{project.approvalStatus}</Badge>
                  </div>
                  <p className="mt-3 text-sm text-neutral-300">{project.description}</p>
                  <div className="mt-4 flex flex-wrap gap-2 text-sm text-neutral-400">
                    <span>RERA: {project.reraNumber || "Not available"}</span>
                    <span>Price list: {project.priceListUrl ? "Available" : "Not uploaded"}</span>
                    <span>Commission: {project.commissionPercent}%</span>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => requestSiteVisit(project._id)}>Request Site Visit</Button>
                    {project.brochureUrl && (
                      <a href={project.brochureUrl} target="_blank" rel="noreferrer">
                        <Button size="sm" variant="secondary">View Brochure</Button>
                      </a>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>

        <Card className="border-neutral-800 bg-[#121A2B] text-white">
          <h2 className="text-lg font-medium">Buyer tools</h2>
          <div className="mt-4 grid gap-3">
            <div className="rounded-2xl border border-neutral-800 bg-[#141d2f] p-4">
              <p className="text-sm text-neutral-400">Save favorite properties to compare them later and make faster decisions.</p>
            </div>
            <div className="rounded-2xl border border-neutral-800 bg-[#141d2f] p-4">
              <p className="text-sm text-neutral-400">Track your loan eligibility and investment goals in one place.</p>
            </div>
            <div className="rounded-2xl border border-neutral-800 bg-[#141d2f] p-4">
              <p className="text-sm text-neutral-400">Request property visits directly from the dashboard. Your request will be routed to the assigned channel partner.</p>
            </div>
          </div>
        </Card>
      </section>
    </main>
  );
}

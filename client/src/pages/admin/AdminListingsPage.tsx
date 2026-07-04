import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card, Badge } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { nameOf } from "@/lib/utils";
import { toast } from "sonner";
import type { Project } from "@/types";

export default function AdminListingsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState<string | null>(null);

  async function load() {
    const res = await api.get("/admin/projects", { params: { approvalStatus: "APPROVED" } });
    setProjects(res.data.projects);
  }

  useEffect(() => {
    load();
  }, []);

  async function toggleFeatured(project: Project) {
    setLoading(project._id + "-featured");
    const isFeatured = project.listingTier === "FEATURED";
    const featuredUntil = new Date();
    featuredUntil.setMonth(featuredUntil.getMonth() + 1);

    await api.patch("/admin/projects", {
      projectId: project._id,
      listingTier: isFeatured ? "STANDARD" : "FEATURED",
      featuredUntil: isFeatured ? null : featuredUntil.toISOString(),
    });
    toast.success(isFeatured ? "Removed from Featured" : "Project is now Featured");
    setLoading(null);
    load();
  }

  async function toggleVerified(project: Project) {
    setLoading(project._id + "-verified");
    const nowVerified = !project.isVerified;
    await api.patch("/admin/projects", {
      projectId: project._id,
      isVerified: nowVerified,
    });
    toast.success(nowVerified ? "Project marked as Verified ✓" : "Verified badge removed");
    setLoading(null);
    load();
  }

  return (
    <main className="min-h-screen p-6 text-white md:p-10">
      <h1 className="text-2xl font-semibold">Listings Management</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Toggle Featured plans (₹10,000–₹50,000/month, display only) and Verified badges for approved projects.
      </p>

      <div className="mt-6 space-y-3">
        {projects.map((p) => (
          <Card key={p._id} className="flex flex-col gap-3 border-white/10 glass text-white sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-medium flex flex-wrap items-center gap-2">
                {p.name}
                {p.listingTier === "FEATURED" && <Badge variant="featured">Featured</Badge>}
                {p.isVerified && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-green-900/40 px-2 py-0.5 text-xs font-medium text-green-400 border border-green-800">
                    ✓ Verified
                  </span>
                )}
              </p>
              <p className="text-sm text-muted-foreground">{p.city} · {nameOf(p.developerId)}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant={p.listingTier === "FEATURED" ? "outline" : "primary"}
                disabled={loading === p._id + "-featured"}
                onClick={() => toggleFeatured(p)}
              >
                {p.listingTier === "FEATURED" ? "Remove Featured" : "Make Featured"}
              </Button>
              <Button
                size="sm"
                variant={p.isVerified ? "outline" : "primary"}
                disabled={loading === p._id + "-verified"}
                onClick={() => toggleVerified(p)}
                className={p.isVerified ? "border-green-700 text-green-400 hover:bg-green-900/20" : "bg-green-700 hover:bg-green-600 text-white"}
              >
                {p.isVerified ? "Remove Verified" : "Mark Verified ✓"}
              </Button>
            </div>
          </Card>
        ))}
        {projects.length === 0 && (
          <p className="text-center text-muted-foreground py-12">No approved projects yet.</p>
        )}
      </div>
    </main>
  );
}

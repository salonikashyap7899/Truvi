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
    setLoading(project._id);
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

  return (
    <main className="min-h-screen bg-[#0B1220] p-6 text-white md:p-10">
      <h1 className="text-2xl font-semibold">Featured Listings</h1>
      <p className="mt-1 text-sm text-neutral-400">
        Featured plans display at ₹10,000–₹50,000/month (display only, no payment gateway wired to this toggle).
      </p>

      <div className="mt-6 space-y-3">
        {projects.map((p) => (
          <Card key={p._id} className="flex items-center justify-between border-neutral-800 bg-[#121A2B] text-white">
            <div>
              <p className="font-medium">
                {p.name} {p.listingTier === "FEATURED" && <Badge variant="featured">Featured</Badge>}
              </p>
              <p className="text-sm text-neutral-400">{p.city} · {nameOf(p.developerId)}</p>
            </div>
            <Button
              size="sm"
              variant={p.listingTier === "FEATURED" ? "outline" : "primary"}
              disabled={loading === p._id}
              onClick={() => toggleFeatured(p)}
            >
              {p.listingTier === "FEATURED" ? "Remove Featured" : "Make Featured"}
            </Button>
          </Card>
        ))}
      </div>
    </main>
  );
}

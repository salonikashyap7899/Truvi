import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card, Badge } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { nameOf } from "@/lib/utils";
import { toast } from "sonner";
import { Star, ChevronDown, ChevronUp, ShieldCheck } from "lucide-react";
import type { Project } from "@/types";

interface VerificationDetails {
  reraVerified: boolean;
  titleClearance: boolean;
  encumbranceFree: boolean;
  constructionApproval: boolean;
  verificationSource: string;
  portfolioVerified: boolean;
  notes: string;
}

const DEFAULT_VD: VerificationDetails = {
  reraVerified: false,
  titleClearance: false,
  encumbranceFree: false,
  constructionApproval: false,
  verificationSource: "",
  portfolioVerified: false,
  notes: "",
};

export default function AdminListingsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [vdDraft, setVdDraft] = useState<Record<string, VerificationDetails>>({});

  async function load() {
    const res = await api.get("/admin/projects", { params: { approvalStatus: "APPROVED" } });
    setProjects(res.data.projects);
  }

  useEffect(() => { load(); }, []);

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
    await api.patch("/admin/projects", { projectId: project._id, isVerified: nowVerified });
    toast.success(nowVerified ? "Project marked as Verified ✓" : "Verified badge removed");
    setLoading(null);
    load();
  }

  async function togglePrime(project: Project) {
    setLoading(project._id + "-prime");
    const nowPrime = !project.isPrimeListing;
    await api.patch("/admin/projects", { projectId: project._id, isPrimeListing: nowPrime });
    toast.success(nowPrime ? "⭐ Set as Prime Listing" : "Removed from Prime Listing");
    setLoading(null);
    load();
  }

  async function saveVerification(project: Project) {
    const vd = vdDraft[project._id] ?? DEFAULT_VD;
    setLoading(project._id + "-vd");
    await api.patch("/admin/projects", {
      projectId: project._id,
      verificationDetails: {
        ...vd,
        lastVerifiedAt: new Date().toISOString(),
      },
    });
    toast.success("Verification details saved");
    setLoading(null);
    setExpandedId(null);
    load();
  }

  function getDraft(project: Project): VerificationDetails {
    if (vdDraft[project._id]) return vdDraft[project._id];
    const existing = project.verificationDetails;
    return existing ? {
      reraVerified: existing.reraVerified ?? false,
      titleClearance: existing.titleClearance ?? false,
      encumbranceFree: existing.encumbranceFree ?? false,
      constructionApproval: existing.constructionApproval ?? false,
      verificationSource: existing.verificationSource ?? "",
      portfolioVerified: existing.portfolioVerified ?? false,
      notes: existing.notes ?? "",
    } : DEFAULT_VD;
  }

  function patchDraft(id: string, key: keyof VerificationDetails, value: boolean | string) {
    setVdDraft((prev) => ({
      ...prev,
      [id]: { ...getDraftById(id, prev), [key]: value },
    }));
  }

  function getDraftById(id: string, prev: Record<string, VerificationDetails>): VerificationDetails {
    if (prev[id]) return prev[id];
    const p = projects.find((x) => x._id === id);
    if (!p) return DEFAULT_VD;
    const existing = p.verificationDetails;
    return existing ? {
      reraVerified: existing.reraVerified ?? false,
      titleClearance: existing.titleClearance ?? false,
      encumbranceFree: existing.encumbranceFree ?? false,
      constructionApproval: existing.constructionApproval ?? false,
      verificationSource: existing.verificationSource ?? "",
      portfolioVerified: existing.portfolioVerified ?? false,
      notes: existing.notes ?? "",
    } : DEFAULT_VD;
  }

  return (
    <main className="min-h-screen p-6 text-white md:p-10">
      <h1 className="text-2xl font-semibold">Listings Management</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Manage Featured, Verified, Prime Listing status and verification details for approved projects.
      </p>

      <div className="mt-6 space-y-3">
        {projects.map((p) => {
          const isPrime = !!p.isPrimeListing;
          const isExpanded = expandedId === p._id;
          const draft = getDraft(p);

          return (
            <Card key={p._id} className="flex flex-col gap-3 border-white/10 glass text-white">
              {/* Main row */}
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium flex flex-wrap items-center gap-2">
                    {p.name}
                    {isPrime && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-900/40 px-2 py-0.5 text-xs font-bold text-amber-400 border border-amber-700">
                        <Star size={10} fill="currentColor" /> Prime
                      </span>
                    )}
                    {p.listingTier === "FEATURED" && <Badge variant="featured">Featured</Badge>}
                    {p.isVerified && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-green-900/40 px-2 py-0.5 text-xs font-medium text-green-400 border border-green-800">
                        <ShieldCheck size={11} /> Verified
                      </span>
                    )}
                  </p>
                  <p className="text-sm text-muted-foreground">{p.city} · {nameOf(p.developerId)}</p>
                </div>

                <div className="flex flex-wrap gap-2 items-center">
                  {/* Prime Listing */}
                  <Button
                    size="sm"
                    variant={isPrime ? "outline" : "primary"}
                    disabled={loading === p._id + "-prime"}
                    onClick={() => togglePrime(p)}
                    className={isPrime ? "border-amber-700 text-amber-400 hover:bg-amber-900/20" : "bg-amber-600 hover:bg-amber-500 text-white"}
                  >
                    <Star size={12} className="mr-1" fill={isPrime ? "currentColor" : "none"} />
                    {isPrime ? "Remove Prime" : "Set Prime"}
                  </Button>

                  {/* Featured */}
                  <Button
                    size="sm"
                    variant={p.listingTier === "FEATURED" ? "outline" : "primary"}
                    disabled={loading === p._id + "-featured"}
                    onClick={() => toggleFeatured(p)}
                  >
                    {p.listingTier === "FEATURED" ? "Remove Featured" : "Make Featured"}
                  </Button>

                  {/* Verified */}
                  <Button
                    size="sm"
                    variant={p.isVerified ? "outline" : "primary"}
                    disabled={loading === p._id + "-verified"}
                    onClick={() => toggleVerified(p)}
                    className={p.isVerified ? "border-green-700 text-green-400 hover:bg-green-900/20" : "bg-green-700 hover:bg-green-600 text-white"}
                  >
                    {p.isVerified ? "Remove Verified" : "Mark Verified ✓"}
                  </Button>

                  {/* Verification details toggle */}
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setExpandedId(isExpanded ? null : p._id)}
                  >
                    Verify Details
                    {isExpanded ? <ChevronUp size={13} className="ml-1" /> : <ChevronDown size={13} className="ml-1" />}
                  </Button>
                </div>
              </div>

              {/* Expandable verification details panel */}
              {isExpanded && (
                <div className="border-t border-white/10 pt-4 space-y-4">
                  <p className="text-xs font-semibold text-blue-300 uppercase tracking-wide">Verification Details</p>

                  {/* Checkboxes */}
                  <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
                    {(
                      [
                        ["reraVerified", "RERA Verified"],
                        ["titleClearance", "Title Clearance"],
                        ["encumbranceFree", "Encumbrance Free"],
                        ["constructionApproval", "Construction Approval"],
                        ["portfolioVerified", "Developer Portfolio Verified"],
                      ] as [keyof VerificationDetails, string][]
                    ).map(([key, label]) => (
                      <label key={key} className="flex items-center gap-2 text-sm cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={!!draft[key]}
                          onChange={(e) => patchDraft(p._id, key, e.target.checked)}
                          className="accent-[var(--trust)] size-3.5"
                        />
                        <span className="text-foreground/90">{label}</span>
                      </label>
                    ))}
                  </div>

                  {/* Text fields */}
                  <div className="space-y-2">
                    <div>
                      <label className="text-xs text-muted-foreground">Verification Source</label>
                      <input
                        type="text"
                        placeholder="e.g. MahaRERA, Internal Review, Third-party Audit"
                        value={draft.verificationSource}
                        onChange={(e) => patchDraft(p._id, "verificationSource", e.target.value)}
                        className="mt-1 w-full rounded-lg border border-white/15 glass px-3 py-2 text-sm text-white placeholder:text-muted-foreground outline-none focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Notes (shown to buyers)</label>
                      <textarea
                        placeholder="Any additional notes about the verification…"
                        value={draft.notes}
                        onChange={(e) => patchDraft(p._id, "notes", e.target.value)}
                        rows={2}
                        className="mt-1 w-full rounded-lg border border-white/15 glass px-3 py-2 text-sm text-white placeholder:text-muted-foreground outline-none focus:border-blue-500 resize-none"
                      />
                    </div>
                  </div>

                  <div className="flex gap-2 pt-1">
                    <Button
                      size="sm"
                      onClick={() => saveVerification(p)}
                      disabled={loading === p._id + "-vd"}
                      className="bg-blue-600 hover:bg-blue-500 text-white"
                    >
                      {loading === p._id + "-vd" ? "Saving…" : "Save Verification Details"}
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => setExpandedId(null)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          );
        })}
        {projects.length === 0 && (
          <p className="text-center text-muted-foreground py-12">No approved projects yet.</p>
        )}
      </div>
    </main>
  );
}

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { Card, Badge } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { nameOf } from "@/lib/utils";
import { toast } from "sonner";
import { Star, ChevronDown, ChevronUp, ShieldCheck, Box, LayoutGrid, Clock, MapPin, CheckCircle2, XCircle, Trash2 } from "lucide-react";
import AdminLegalReview from "@/components/AdminLegalReview";
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
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [pending, setPending] = useState<Project[]>([]);
  const [loading, setLoading] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [vdDraft, setVdDraft] = useState<Record<string, VerificationDetails>>({});
  const [threeDDraft, setThreeDDraft] = useState<Record<string, string>>({});
  const [planDraft, setPlanDraft] = useState<Record<string, string>>({});

  async function load() {
    const [approved, pend] = await Promise.all([
      api.get("/admin/projects", { params: { approvalStatus: "APPROVED" } }),
      api.get("/admin/projects", { params: { approvalStatus: "PENDING" } }),
    ]);
    setProjects(approved.data.projects);
    setPending(pend.data.projects);
  }

  useEffect(() => { load(); }, []);

  async function approveProject(project: Project) {
    setLoading(project._id + "-approve");
    try {
      await api.patch("/admin/projects", { projectId: project._id, approvalStatus: "APPROVED" });
      toast.success(`"${project.name}" approved — now live in inventory`);
      await load();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Could not approve project");
    } finally {
      setLoading(null);
    }
  }

  async function rejectProject(project: Project) {
    setLoading(project._id + "-reject");
    try {
      await api.patch("/admin/projects", { projectId: project._id, approvalStatus: "REJECTED" });
      toast.success(`"${project.name}" rejected — hidden from inventory`);
      await load();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Could not reject project");
    } finally {
      setLoading(null);
    }
  }

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

  async function deleteProject(project: Project) {
    if (
      !window.confirm(
        `Permanently delete "${project.name}"?\n\nThis removes the project and all its units, leads, enquiries and documents. This cannot be undone.`
      )
    )
      return;
    setLoading(project._id + "-delete");
    try {
      await api.delete(`/admin/projects/${project._id}`);
      toast.success(`"${project.name}" deleted permanently`);
      await load();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Could not delete project");
    } finally {
      setLoading(null);
    }
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

  async function saveThreeD(project: Project) {
    const url = (threeDDraft[project._id] ?? project.threeDModelUrl ?? "").trim();
    setLoading(project._id + "-3d");
    try {
      await api.patch("/admin/projects", { projectId: project._id, threeDModelUrl: url });
      toast.success(url ? "3D model link saved — 'View in 3D' is now live on this listing" : "3D model link removed");
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Enter a valid URL (https://…)");
    } finally {
      setLoading(null);
    }
  }

  async function savePlan(project: Project) {
    const url = (planDraft[project._id] ?? project.masterPlanUrl ?? "").trim();
    setLoading(project._id + "-plan");
    try {
      await api.patch("/admin/projects", { projectId: project._id, masterPlanUrl: url });
      toast.success(url ? "Master-plan image saved — it now powers the 3D board" : "Master-plan image removed");
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Could not save master plan");
    } finally {
      setLoading(null);
    }
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
        Approve new developer submissions, then manage Featured, Verified, Prime Listing status and verification details.
      </p>

      {/* Pending developer submissions — approve to publish into public inventory */}
      {pending.length > 0 && (
        <section className="mt-6">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-amber-300">
            <Clock size={18} /> Pending approval
            <span className="rounded-full bg-amber-900/40 px-2 py-0.5 text-xs font-medium text-amber-300 border border-amber-700">
              {pending.length}
            </span>
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            New projects submitted by developers. They stay hidden from buyers and sellers until you approve them.
          </p>
          <div className="mt-4 space-y-3">
            {pending.map((p) => (
              <Card key={p._id} className="flex flex-col gap-3 border-amber-500/20 bg-amber-950/10 text-white">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 font-medium">
                      {p.name}
                      <Badge variant="warning">Pending</Badge>
                      {p.reraNumber && (
                        <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-muted-foreground">
                          RERA {p.reraNumber}
                        </span>
                      )}
                    </p>
                    <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                      <MapPin size={13} /> {[p.location, p.city].filter(Boolean).join(", ")} · {nameOf(p.developerId)}
                    </p>
                    {p.description && (
                      <p className="mt-1 line-clamp-2 max-w-2xl text-xs text-muted-foreground/80">{p.description}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      className="border-violet-700 text-violet-300 hover:bg-violet-900/20"
                      onClick={() => navigate(`/admin/listings/${p._id}`)}
                    >
                      <LayoutGrid size={13} className="mr-1" /> Review details
                    </Button>
                    <Button
                      size="sm"
                      disabled={loading === p._id + "-approve"}
                      onClick={() => approveProject(p)}
                      className="bg-green-700 text-white hover:bg-green-600"
                    >
                      <CheckCircle2 size={13} className="mr-1" />
                      {loading === p._id + "-approve" ? "Approving…" : "Approve & publish"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={loading === p._id + "-reject"}
                      onClick={() => rejectProject(p)}
                      className="border-rose-700 text-rose-300 hover:bg-rose-900/20"
                    >
                      <XCircle size={13} className="mr-1" /> Reject
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={loading === p._id + "-delete"}
                      onClick={() => deleteProject(p)}
                      className="border-red-700 text-red-300 hover:bg-red-900/30"
                    >
                      <Trash2 size={13} className="mr-1" />
                      {loading === p._id + "-delete" ? "Deleting…" : "Delete"}
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}

      <h2 className="mt-8 text-lg font-semibold">Approved listings</h2>
      <div className="mt-3 space-y-3">
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
                    {p.threeDModelUrl && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-violet-900/40 px-2 py-0.5 text-xs font-medium text-violet-300 border border-violet-700">
                        <Box size={11} /> 3D
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

                  {/* Manage presentation content & plots */}
                  <Button
                    size="sm"
                    variant="secondary"
                    className="border-violet-700 text-violet-300 hover:bg-violet-900/20"
                    onClick={() => navigate(`/admin/listings/${p._id}`)}
                  >
                    <LayoutGrid size={13} className="mr-1" /> Content &amp; Plots
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

                  {/* Permanent delete */}
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={loading === p._id + "-delete"}
                    onClick={() => deleteProject(p)}
                    className="border-red-700 text-red-300 hover:bg-red-900/30"
                  >
                    <Trash2 size={13} className="mr-1" />
                    {loading === p._id + "-delete" ? "Deleting…" : "Delete"}
                  </Button>
                </div>
              </div>

              {/* Expandable verification details panel */}
              {isExpanded && (
                <div className="border-t border-white/10 pt-4 space-y-4">
                  {/* Legal document verification — controls public visibility */}
                  <div>
                    <p className="text-xs font-semibold text-emerald-300 uppercase tracking-wide">Legal documents — verify to make public</p>
                    <div className="mt-2">
                      <AdminLegalReview projectId={p._id} />
                    </div>
                  </div>

                  {/* 3D model embed link */}
                  <div>
                    <p className="text-xs font-semibold text-violet-300 uppercase tracking-wide">3D Property View</p>
                    <label className="mt-2 block text-xs text-muted-foreground">
                      3D Model URL / Embed Link (Matterport, Sketchfab, Google Maps 3D…)
                    </label>
                    <div className="mt-1 flex flex-col gap-2 sm:flex-row">
                      <input
                        type="url"
                        placeholder="https://my.matterport.com/show/?m=…  or  https://sketchfab.com/models/…/embed"
                        value={threeDDraft[p._id] ?? p.threeDModelUrl ?? ""}
                        onChange={(e) => setThreeDDraft((prev) => ({ ...prev, [p._id]: e.target.value }))}
                        className="w-full flex-1 rounded-lg border border-white/15 glass px-3 py-2 text-sm text-white placeholder:text-muted-foreground outline-none focus:border-violet-500"
                      />
                      <Button
                        size="sm"
                        onClick={() => saveThreeD(p)}
                        disabled={loading === p._id + "-3d"}
                        className="shrink-0 bg-violet-600 hover:bg-violet-500 text-white"
                      >
                        {loading === p._id + "-3d" ? "Saving…" : "Save 3D Link"}
                      </Button>
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      When set, a "View in 3D" button appears on this listing. Leave empty and save to remove it.
                    </p>

                    <label className="mt-4 block text-xs text-muted-foreground">
                      Master-plan image URL (real brochure layout → shown as a 3D board)
                    </label>
                    <div className="mt-1 flex flex-col gap-2 sm:flex-row">
                      <input
                        type="text"
                        placeholder="/masterplans/your-layout.jpg  or  https://…/layout.png"
                        value={planDraft[p._id] ?? p.masterPlanUrl ?? ""}
                        onChange={(e) => setPlanDraft((prev) => ({ ...prev, [p._id]: e.target.value }))}
                        className="w-full flex-1 rounded-lg border border-white/15 glass px-3 py-2 text-sm text-white placeholder:text-muted-foreground outline-none focus:border-violet-500"
                      />
                      <Button
                        size="sm"
                        onClick={() => savePlan(p)}
                        disabled={loading === p._id + "-plan"}
                        className="shrink-0 bg-violet-600 hover:bg-violet-500 text-white"
                      >
                        {loading === p._id + "-plan" ? "Saving…" : "Save Master Plan"}
                      </Button>
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      When set, "View in 3D" shows the real layout as an interactive tilt/zoom board instead of the generated township.
                    </p>
                  </div>

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

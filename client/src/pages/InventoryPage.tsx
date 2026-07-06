import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/primitives";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { Search, ChevronDown, ChevronUp, Star, ShieldCheck, CheckCircle2, XCircle, Building2, Presentation, ArrowRight } from "lucide-react";
import TrustScoreWidget, { mockScoreFromId } from "@/components/TrustScoreWidget";
import LegalRiskCard, { mockRiskFromId } from "@/components/LegalRiskCard";
import PriceFairnessMeter from "@/components/PriceFairnessMeter";
import VisitorGateModal from "@/components/VisitorGateModal";
import ListingIntelligence from "@/components/ListingIntelligence";
import type { Project } from "@/types";
import { useAuth } from "@/hooks/useAuth";

export default function InventoryPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [showGate, setShowGate] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    api
      .get("/inventory")
      .then((res) => setProjects(res.data.projects))
      .catch((err: any) => toast.error(err?.response?.data?.error || "Failed to load inventory"))
      .finally(() => setLoading(false));
  }, []);

  // Show visitor gate for unauthenticated users (after a short delay)
  useEffect(() => {
    if (!user) {
      const t = setTimeout(() => setShowGate(true), 800);
      return () => clearTimeout(t);
    }
  }, [user]);

  const filtered = projects.filter(
    (p) =>
      search === "" ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.city.toLowerCase().includes(search.toLowerCase()) ||
      p.location.toLowerCase().includes(search.toLowerCase())
  );

  // Sort: Prime listing first
  const sorted = [...filtered].sort((a, b) => {
    if (a.isPrimeListing && !b.isPrimeListing) return -1;
    if (!a.isPrimeListing && b.isPrimeListing) return 1;
    return 0;
  });

  return (
    <>
      {showGate && !user && (
        <VisitorGateModal onClose={() => setShowGate(false)} />
      )}

      <main className="min-h-screen p-6 text-white md:p-10 pb-28">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full glass px-3 py-1 text-xs uppercase tracking-widest text-muted-foreground mb-3">
              <span className="size-1.5 rounded-full bg-[var(--trust)] animate-pulse" />
              Know the Property Before You Buy It
            </div>
            <h1 className="text-3xl font-display font-semibold tracking-tight">Inventory</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              All verified listings — browse, verify, and decide with confidence.
            </p>
          </div>
          <div className="text-right text-xs text-muted-foreground">
            <span className="text-white font-semibold text-lg">{projects.length}</span> listing{projects.length !== 1 ? "s" : ""} available
          </div>
        </div>

        {/* Search */}
        <div className="relative mt-6 max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by name, city or area…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 w-full rounded-lg border border-white/15 glass pl-9 pr-3 text-sm text-white placeholder:text-muted-foreground outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {/* Grid */}
        {loading ? (
          <div className="mt-16 flex flex-col items-center gap-3 text-muted-foreground">
            <div className="size-8 border-2 border-white/20 border-t-[var(--trust)] rounded-full animate-spin" />
            <p className="text-sm">Loading inventory…</p>
          </div>
        ) : sorted.length === 0 ? (
          <p className="mt-10 text-sm text-muted-foreground">No listings found.</p>
        ) : (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {sorted.map((project, idx) => (
              <ListingCard key={project._id} project={project} isPrime={project.isPrimeListing || idx === 0} />
            ))}
          </div>
        )}
      </main>
    </>
  );
}

function VerificationRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      {ok ? (
        <CheckCircle2 size={13} className="text-green-400 shrink-0" />
      ) : (
        <XCircle size={13} className="text-red-400 shrink-0" />
      )}
      <span className={ok ? "text-foreground/90" : "text-muted-foreground"}>{label}</span>
    </div>
  );
}

function ListingCard({ project, isPrime }: { project: Project; isPrime: boolean }) {
  const [verOpen, setVerOpen] = useState(false);

  const devName =
    typeof project.developerId === "object"
      ? (project.developerId as any).name
      : null;

  const vd = project.verificationDetails;

  return (
    <div
      className={`relative rounded-2xl border p-5 flex flex-col gap-3 transition-colors ${
        isPrime
          ? "border-amber-500/50 bg-gradient-to-br from-amber-900/20 via-transparent to-transparent shadow-[0_0_30px_rgba(245,158,11,0.08)]"
          : "border-white/10 glass hover:border-white/20"
      }`}
    >
      {/* Prime badge */}
      {isPrime && (
        <div className="absolute -top-3 left-5 flex items-center gap-1.5 rounded-full bg-gradient-to-r from-amber-500 to-yellow-400 px-3 py-0.5 text-[10px] font-bold uppercase tracking-wider text-black shadow-lg">
          <Star size={9} fill="currentColor" />
          Prime Listing
        </div>
      )}

      {/* Badges + verification arrow */}
      <div className="flex items-start justify-between gap-2 mt-1">
        <div className="flex flex-wrap gap-2">
          {project.listingTier === "FEATURED" && (
            <Badge variant="featured">Featured</Badge>
          )}
          <Badge variant={project.approvalStatus === "APPROVED" ? "success" : "warning"}>
            {project.approvalStatus}
          </Badge>
          {project.isVerified && (
            <span className="inline-flex items-center gap-1 rounded-full bg-green-900/40 px-2 py-0.5 text-xs font-medium text-green-400 border border-green-800">
              <ShieldCheck size={11} />
              Verified
            </span>
          )}
        </div>

        {/* Verification arrow toggle */}
        <button
          onClick={() => setVerOpen((v) => !v)}
          title="View verification details"
          className={`flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
            verOpen
              ? "border-blue-500/60 bg-blue-900/30 text-blue-300"
              : "border-white/15 text-muted-foreground hover:border-blue-500/60 hover:text-blue-300"
          }`}
        >
          Verify
          {verOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </button>
      </div>

      {/* Verification panel */}
      {verOpen && (
        <div className="rounded-xl border border-blue-500/20 bg-blue-950/30 p-3 space-y-2">
          <p className="text-xs font-semibold text-blue-300 uppercase tracking-wide">Verification Details</p>

          {vd ? (
            <>
              <VerificationRow ok={vd.reraVerified} label="RERA Registered" />
              <VerificationRow ok={vd.titleClearance} label="Title Clearance" />
              <VerificationRow ok={vd.encumbranceFree} label="Encumbrance Free" />
              <VerificationRow ok={vd.constructionApproval} label="Construction Approval" />
              <VerificationRow ok={vd.portfolioVerified} label="Developer Portfolio Verified" />
              {vd.verificationSource && (
                <p className="text-[11px] text-muted-foreground pt-1">
                  Source: <span className="text-foreground/80">{vd.verificationSource}</span>
                </p>
              )}
              {vd.lastVerifiedAt && (
                <p className="text-[11px] text-muted-foreground">
                  Last verified: {new Date(vd.lastVerifiedAt).toLocaleDateString("en-IN")}
                </p>
              )}
              {vd.notes && (
                <p className="text-[11px] text-foreground/70 border-t border-white/10 pt-2">{vd.notes}</p>
              )}
            </>
          ) : project.isVerified ? (
            <>
              <VerificationRow ok={true} label="RERA Verified" />
              <VerificationRow ok={true} label="Truvi Platform Verified" />
              {project.reraNumber && (
                <p className="text-[11px] text-muted-foreground">RERA No: {project.reraNumber}</p>
              )}
            </>
          ) : (
            <p className="text-xs text-muted-foreground">Verification details not yet available for this listing.</p>
          )}

          {/* Raw Data Sources & AI Intelligence Engine */}
          <div className="pt-2 border-t border-white/10">
            <ListingIntelligence projectId={project._id} />
          </div>
        </div>
      )}

      {/* Info */}
      <div>
        <div className="flex items-center gap-2">
          <Building2 size={14} className="text-muted-foreground shrink-0" />
          <h3 className="text-base font-semibold leading-tight">{project.name}</h3>
        </div>
        <p className="mt-0.5 text-sm text-muted-foreground pl-5">
          {project.location}, {project.city}
        </p>
        {devName && (
          <p className="mt-0.5 text-xs text-muted-foreground pl-5">by {devName}</p>
        )}
      </div>

      <p className="text-sm text-foreground/90 line-clamp-2">{project.description}</p>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {project.reraNumber && <span>RERA: {project.reraNumber}</span>}
        <span>Commission: {project.commissionPercent}%</span>
      </div>

      {/* Project Presentation & Technical Information */}
      <Link
        to={`/inventory/${project._id}/presentation`}
        className="group flex items-center justify-between rounded-lg border border-white/15 px-3 py-2 text-xs font-medium text-foreground/90 hover:border-[var(--trust)]/60 hover:text-white transition-colors"
      >
        <span className="flex items-center gap-2">
          <Presentation size={13} className="text-[var(--trust)]" />
          View Project Presentation & Technical Details
        </span>
        <ArrowRight size={13} className="text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </Link>

      <TrustScoreWidget
        score={project.trustScore ?? mockScoreFromId(project._id)}
        compact
      />
      <LegalRiskCard
        level={project.legalRiskLevel ?? mockRiskFromId(project._id)}
        compact
      />
      <PriceFairnessMeter projectId={project._id} compact />
    </div>
  );
}

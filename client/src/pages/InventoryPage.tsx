import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "@/lib/api";
import { toast } from "sonner";
import {
  Search, Star, ShieldCheck, CheckCircle2, XCircle, Building2, MapPin,
  Presentation, ArrowRight, X, Sparkles, BadgeCheck,
} from "lucide-react";
import TrustScoreWidget, { mockScoreFromId } from "@/components/TrustScoreWidget";
import LegalRiskCard, { mockRiskFromId } from "@/components/LegalRiskCard";
import PriceFairnessMeter from "@/components/PriceFairnessMeter";
import VisitorGateModal from "@/components/VisitorGateModal";
import ListingIntelligence from "@/components/ListingIntelligence";
import { SiteNav } from "@/components/SiteNav";
import type { Project } from "@/types";
import { useAuth } from "@/hooks/useAuth";

export default function InventoryPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [showGate, setShowGate] = useState(false);
  const [inspecting, setInspecting] = useState<Project | null>(null);
  const { user } = useAuth();

  useEffect(() => {
    document.title = "TRUVI — Inventory";
    api
      .get("/inventory")
      .then((res) => setProjects(res.data.projects))
      .catch((err: any) => toast.error(err?.response?.data?.error || "Failed to load inventory"))
      .finally(() => setLoading(false));
  }, []);

  // Purpose gate for unauthenticated visitors (after a short delay).
  // Skipped while the site-wide WelcomeGate hasn't been answered yet,
  // so two modals never stack on a first visit.
  useEffect(() => {
    if (!user && localStorage.getItem("truvi-welcome-seen")) {
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

  // Prime listing always leads
  const sorted = [...filtered].sort((a, b) => {
    if (a.isPrimeListing && !b.isPrimeListing) return -1;
    if (!a.isPrimeListing && b.isPrimeListing) return 1;
    return 0;
  });

  return (
    <>
      {showGate && !user && <VisitorGateModal onClose={() => setShowGate(false)} />}

      <VerificationDrawer project={inspecting} onClose={() => setInspecting(null)} />

      <SiteNav />

      <main className="min-h-screen px-4 pb-28 pt-28 text-white sm:px-6 md:px-10">
        {/* ── Hero header ── */}
        <div className="mx-auto max-w-3xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-1.5 text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
            <span className="size-1.5 rounded-full bg-[var(--trust)] animate-pulse" />
            Know the Property Before You Buy It
          </div>
          <h1 className="mt-5 font-display text-4xl font-medium tracking-tight md:text-5xl">
            The Truvi <span className="text-gradient-trust">Inventory</span>
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-sm text-muted-foreground md:text-base">
            A curated collection of verified listings — every property carries its evidence,
            sources and intelligence profile.
          </p>

          {/* Search */}
          <div className="relative mx-auto mt-8 max-w-md">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by name, city or area…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-12 w-full rounded-full border border-white/12 bg-white/[0.05] pl-11 pr-5 text-sm text-white placeholder:text-white/30 outline-none backdrop-blur transition focus:border-[var(--trust)]/60 focus:shadow-[0_0_24px_rgba(59,130,246,0.15)]"
            />
          </div>

          <p className="mt-4 text-xs uppercase tracking-[0.2em] text-muted-foreground">
            <span className="font-semibold text-white">{projects.length}</span> verified listing{projects.length !== 1 ? "s" : ""}
          </p>
        </div>

        {/* ── Grid ── */}
        {loading ? (
          <div className="mt-20 flex flex-col items-center gap-3 text-muted-foreground">
            <div className="size-8 animate-spin rounded-full border-2 border-white/20 border-t-[var(--trust)]" />
            <p className="text-sm">Curating inventory…</p>
          </div>
        ) : sorted.length === 0 ? (
          <p className="mt-16 text-center text-sm text-muted-foreground">No listings found.</p>
        ) : (
          <div className="mx-auto mt-12 grid max-w-7xl gap-6 sm:grid-cols-2 xl:grid-cols-3">
            {sorted.map((project, idx) => (
              <ListingCard
                key={project._id}
                project={project}
                isPrime={project.isPrimeListing || idx === 0}
                onInspect={() => setInspecting(project)}
              />
            ))}
          </div>
        )}
      </main>
    </>
  );
}

/* ── Listing card ─────────────────────────────────────────────────────────── */

function ListingCard({
  project,
  isPrime,
  onInspect,
}: {
  project: Project;
  isPrime: boolean;
  onInspect: () => void;
}) {
  const devName = typeof project.developerId === "object" ? (project.developerId as any).name : null;

  const frame = isPrime
    ? "linear-gradient(160deg, rgba(251,191,36,0.65), rgba(251,191,36,0.12) 45%, rgba(255,255,255,0.06) 85%)"
    : "linear-gradient(160deg, rgba(255,255,255,0.18), rgba(59,130,246,0.18) 45%, rgba(255,255,255,0.04) 85%)";

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="group relative rounded-[24px] p-px transition-transform duration-300 hover:-translate-y-1"
      style={{ background: frame }}
    >
      <div className="flex h-full flex-col gap-4 rounded-[23px] bg-[#0a0d14]/92 p-6">
        {/* Prime ribbon */}
        {isPrime && (
          <div className="absolute -top-3 left-6 flex items-center gap-1.5 rounded-full bg-gradient-to-r from-amber-400 to-yellow-300 px-3.5 py-1 text-[10px] font-bold uppercase tracking-[0.15em] text-black shadow-[0_4px_20px_rgba(251,191,36,0.35)]">
            <Star size={9} fill="currentColor" />
            Prime Listing
          </div>
        )}

        {/* Status chips */}
        <div className="mt-1 flex flex-wrap items-center gap-2">
          {project.isVerified && (
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/25 bg-emerald-500/12 px-2.5 py-1 text-[11px] font-medium text-emerald-300">
              <ShieldCheck size={11} />
              Truvi Verified
            </span>
          )}
          {project.listingTier === "FEATURED" && (
            <span className="inline-flex items-center gap-1 rounded-full border border-sky-400/25 bg-sky-500/12 px-2.5 py-1 text-[11px] font-medium text-sky-300">
              <Sparkles size={11} />
              Featured
            </span>
          )}
          {project.reraNumber && (
            <span className="inline-flex items-center gap-1 rounded-full border border-white/12 bg-white/[0.05] px-2.5 py-1 text-[11px] text-foreground/70">
              RERA {project.reraNumber}
            </span>
          )}
        </div>

        {/* Identity */}
        <div>
          <h3 className="font-display text-xl font-semibold leading-tight text-white">{project.name}</h3>
          <p className="mt-1.5 flex items-center gap-1.5 text-sm text-muted-foreground">
            <MapPin size={13} className="shrink-0" />
            {project.location}, {project.city}
          </p>
          {devName && (
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Building2 size={12} className="shrink-0" />
              by {devName}
            </p>
          )}
        </div>

        <p className="line-clamp-2 text-sm leading-relaxed text-foreground/80">{project.description}</p>

        {/* Live pricing from actual units */}
        {(project.minRate || project.unitCount) && (
          <div className="flex items-end justify-between rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-3">
            <div>
              <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Starting at</p>
              <p className="mt-0.5 font-display text-lg font-semibold text-white">
                {project.minRate ? (
                  <>₹{project.minRate.toLocaleString("en-IN")}<span className="text-xs font-normal text-muted-foreground">/sq ft</span></>
                ) : (
                  <span className="text-sm font-normal text-muted-foreground">Price on request</span>
                )}
              </p>
            </div>
            {typeof project.unitCount === "number" && project.unitCount > 0 && (
              <p className="text-xs text-muted-foreground">
                <span className="font-semibold text-white">{project.unitCount}</span> unit{project.unitCount !== 1 ? "s" : ""} live
              </p>
            )}
          </div>
        )}

        {/* Intelligence snapshot */}
        <div className="space-y-2.5 border-t border-white/[0.07] pt-4">
          <TrustScoreWidget score={project.trustScore ?? mockScoreFromId(project._id)} compact />
          <LegalRiskCard level={project.legalRiskLevel ?? mockRiskFromId(project._id)} compact />
          <PriceFairnessMeter projectId={project._id} compact />
        </div>

        {/* Actions */}
        <div className="mt-auto space-y-2 pt-2">
          <button
            onClick={onInspect}
            className="group/btn flex w-full items-center justify-between rounded-full border border-[var(--trust)]/35 bg-[var(--trust)]/10 px-5 py-2.5 text-sm font-medium text-sky-200 transition-all hover:border-[var(--trust)]/70 hover:bg-[var(--trust)]/20 hover:shadow-[0_0_24px_rgba(59,130,246,0.2)]"
          >
            <span className="flex items-center gap-2">
              <BadgeCheck size={15} />
              Verification & Intelligence
            </span>
            <ArrowRight size={14} className="transition-transform group-hover/btn:translate-x-0.5" />
          </button>
          <Link
            to={`/inventory/${project._id}/presentation`}
            className="group/btn flex w-full items-center justify-between rounded-full border border-white/12 px-5 py-2.5 text-sm text-foreground/80 transition-all hover:border-white/30 hover:text-white"
          >
            <span className="flex items-center gap-2">
              <Presentation size={15} />
              Project Presentation
            </span>
            <ArrowRight size={14} className="transition-transform group-hover/btn:translate-x-0.5" />
          </Link>
        </div>
      </div>
    </motion.div>
  );
}

/* ── Verification & Intelligence slide-over drawer ────────────────────────── */

function VerificationRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <span className={`text-sm ${ok ? "text-foreground/90" : "text-muted-foreground"}`}>{label}</span>
      {ok ? (
        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/25 bg-emerald-500/12 px-2.5 py-0.5 text-[11px] font-medium text-emerald-300">
          <CheckCircle2 size={11} /> Verified
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 rounded-full border border-white/12 bg-white/[0.05] px-2.5 py-0.5 text-[11px] text-muted-foreground">
          <XCircle size={11} /> Pending
        </span>
      )}
    </div>
  );
}

function VerificationDrawer({ project, onClose }: { project: Project | null; onClose: () => void }) {
  // Lock body scroll while open
  useEffect(() => {
    if (project) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [project]);

  const vd = project?.verificationDetails;

  return (
    <AnimatePresence>
      {project && (
        <div className="fixed inset-0 z-[120]">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />

          {/* Panel */}
          <motion.aside
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "tween", duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
            className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col border-l border-white/10 bg-[#0a0d14]/97 shadow-[-30px_0_80px_rgba(0,0,0,0.5)]"
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-3 border-b border-white/[0.08] px-6 py-5">
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-[0.25em] text-[var(--trust)]">
                  Verification & Intelligence
                </p>
                <h2 className="mt-1 truncate font-display text-lg font-semibold text-white">{project.name}</h2>
                <p className="truncate text-xs text-muted-foreground">
                  {project.location}, {project.city}
                </p>
              </div>
              <button
                onClick={onClose}
                className="grid size-9 shrink-0 place-items-center rounded-full border border-white/12 text-muted-foreground transition hover:bg-white/10 hover:text-white"
              >
                <X size={15} />
              </button>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto px-6 py-5">
              {/* Core verification */}
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Core Verification
              </p>
              <div className="mt-2 divide-y divide-white/[0.06] rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4">
                {vd ? (
                  <>
                    <VerificationRow ok={vd.reraVerified} label="RERA Registered" />
                    <VerificationRow ok={vd.titleClearance} label="Title Clearance" />
                    <VerificationRow ok={vd.encumbranceFree} label="Encumbrance Free" />
                    <VerificationRow ok={vd.constructionApproval} label="Construction Approval" />
                    <VerificationRow ok={vd.portfolioVerified} label="Developer Portfolio Verified" />
                  </>
                ) : project.isVerified ? (
                  <>
                    <VerificationRow ok={true} label="RERA Verified" />
                    <VerificationRow ok={true} label="Truvi Platform Verified" />
                  </>
                ) : (
                  <p className="py-3 text-sm text-muted-foreground">
                    Verification details not yet available for this listing.
                  </p>
                )}
              </div>

              {(vd?.verificationSource || vd?.lastVerifiedAt || vd?.notes) && (
                <div className="mt-3 space-y-1 px-1">
                  {vd.verificationSource && (
                    <p className="text-xs text-muted-foreground">
                      Source: <span className="text-foreground/80">{vd.verificationSource}</span>
                    </p>
                  )}
                  {vd.lastVerifiedAt && (
                    <p className="text-xs text-muted-foreground">
                      Last verified: {new Date(vd.lastVerifiedAt).toLocaleDateString("en-IN")}
                    </p>
                  )}
                  {vd.notes && <p className="text-xs text-foreground/70">{vd.notes}</p>}
                </div>
              )}

              {/* Full intelligence profile */}
              <div className="mt-7">
                <ListingIntelligence projectId={project._id} />
              </div>
            </div>

            {/* Footer CTA */}
            <div className="border-t border-white/[0.08] px-6 py-4">
              <Link
                to={`/inventory/${project._id}/presentation`}
                onClick={onClose}
                className="flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#dbeafe] to-white py-3 text-sm font-semibold text-[#0a0d14] transition-all hover:shadow-[0_0_30px_rgba(219,234,254,0.3)]"
              >
                <Presentation size={15} />
                View Full Project Presentation
              </Link>
            </div>
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
}

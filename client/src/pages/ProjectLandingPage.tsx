import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowRight, Building2, MapPin, ShieldCheck, MessageCircle, CalendarClock, X,
  ChevronLeft, ChevronRight, CheckCircle2, Home, Leaf, Flame, Camera, FileCheck2, Star,
  Navigation, LayoutGrid, PlayCircle, Sparkles, Loader2, ClipboardCheck, Landmark,
} from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { formatCompactINR } from "@/lib/utils";
import { PROJECT_TYPE_LABELS, categoryLabel } from "@/lib/assetCategories";
import type { Project, ProjectAsset } from "@/types";

/* ─────────────────────────────────────────────────────────────────────────
   Truvi Ventures — Dedicated Project Landing Page (public, /projects/:id)

   A premium, mobile-first, conversion-focused page for a single project. It is
   fully public (no login), pulls its data from the same public presentation
   endpoint the app uses, and drives every visitor toward one of three actions:
   book a site visit, enquire, or WhatsApp. Leads post to /enquiries/lead which
   lands in the founder's Enquiries inbox.

   Design language mirrors the rest of Truvi (dark, trust-accent, glassy) but is
   laid out like a standalone real-estate landing page rather than an in-app
   screen — so it works equally as a shareable link and inside the app.
   ──────────────────────────────────────────────────────────────────────── */

const WA_NUMBER = "919196366358";
const IMAGE_MIMES = /^image\//;
const VIDEO_MIMES = /^video\//;

interface PresentationUnit {
  _id: string;
  unitNumber: string;
  type: string;
  areaSqft: number;
  price: number;
  status: "AVAILABLE" | "LOCKED" | "RESERVED" | "SOLD";
}
interface UnitSummary {
  total: number;
  available: number;
  byType: Record<string, number>;
}

const APPROVAL_LABEL: Record<string, string> = {
  RERA: "RERA Registered",
  DISTRICT_PANCHAYAT: "District Panchayat Approved",
  DTCP: "DTCP Approved",
};

function fmtPossession(v?: string | null): string | null {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d.toLocaleDateString("en-IN", { month: "short", year: "numeric" });
}

function waLink(message: string) {
  return `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(message)}`;
}

/* ── Lightbox for gallery / plan images ──────────────────────────────────── */
function Lightbox({ images, index, onClose, onNavigate }: {
  images: ProjectAsset[]; index: number; onClose: () => void; onNavigate: (i: number) => void;
}) {
  const asset = images[index];
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && index > 0) onNavigate(index - 1);
      if (e.key === "ArrowRight" && index < images.length - 1) onNavigate(index + 1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, images.length, onClose, onNavigate]);
  if (!asset) return null;
  return (
    <div className="fixed inset-0 z-[130] flex flex-col bg-black/95 backdrop-blur-sm" onClick={onClose}>
      <div className="flex items-center justify-between p-4">
        <p className="min-w-0 truncate text-sm font-medium text-white">{asset.title}</p>
        <button onClick={onClose} aria-label="Close" className="rounded-lg border border-white/20 p-2 text-white hover:bg-white/10">
          <X size={16} />
        </button>
      </div>
      <div className="flex flex-1 items-center justify-center p-4">
        <img src={asset.fileUrl} alt={asset.title} onClick={(e) => e.stopPropagation()} className="max-h-full max-w-full select-none rounded-lg object-contain" />
      </div>
      {index > 0 && (
        <button onClick={(e) => { e.stopPropagation(); onNavigate(index - 1); }} className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full border border-white/20 bg-black/50 p-2.5 text-white hover:bg-white/10">
          <ChevronLeft size={18} />
        </button>
      )}
      {index < images.length - 1 && (
        <button onClick={(e) => { e.stopPropagation(); onNavigate(index + 1); }} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full border border-white/20 bg-black/50 p-2.5 text-white hover:bg-white/10">
          <ChevronRight size={18} />
        </button>
      )}
    </div>
  );
}

/* ── Full-bleed hero carousel ─────────────────────────────────────────────── */
function HeroCarousel({ images }: { images: ProjectAsset[] }) {
  const [i, setI] = useState(0);
  const n = images.length;
  const touch = useRef<{ x: number; active: boolean }>({ x: 0, active: false });
  const paused = useRef(false);
  useEffect(() => {
    if (n <= 1) return;
    const id = setInterval(() => { if (!paused.current) setI((p) => (p + 1) % n); }, 5000);
    return () => clearInterval(id);
  }, [n]);
  const go = (next: number) => n > 0 && setI(((next % n) + n) % n);

  if (n === 0) {
    return <div className="absolute inset-0 bg-gradient-to-br from-[#0b1220] via-[#0a0d14] to-[#0e1a2b]" />;
  }
  return (
    <div
      className="absolute inset-0"
      onTouchStart={(e) => { touch.current = { x: e.touches[0].clientX, active: true }; paused.current = true; }}
      onTouchEnd={(e) => {
        if (touch.current.active) {
          const dx = e.changedTouches[0].clientX - touch.current.x;
          if (dx < -40) go(i + 1); else if (dx > 40) go(i - 1);
        }
        touch.current.active = false; paused.current = false;
      }}
    >
      <div className="flex h-full transition-transform duration-700 ease-out" style={{ transform: `translateX(-${i * 100}%)` }}>
        {images.map((img) => (
          <div key={img._id} className="relative h-full w-full shrink-0">
            <img src={img.fileUrl} alt={img.title} className="h-full w-full object-cover" />
          </div>
        ))}
      </div>
      {/* readability gradient */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#05070c] via-[#05070c]/55 to-[#05070c]/25" />
      {n > 1 && (
        <div className="absolute inset-x-0 bottom-24 z-10 flex items-center justify-center gap-1.5 sm:bottom-8">
          {images.map((_, idx) => (
            <button key={idx} onClick={() => go(idx)} aria-label={`Slide ${idx + 1}`}
              className={`h-1.5 rounded-full transition-all ${idx === i ? "w-6 bg-white" : "w-1.5 bg-white/40"}`} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Small building blocks ────────────────────────────────────────────────── */
function SnapshotCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-center backdrop-blur">
      <p className="text-[11px] uppercase tracking-widest text-white/50">{label}</p>
      <p className="mt-1.5 text-lg font-semibold text-white">{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-white/45">{hint}</p>}
    </div>
  );
}

function SectionHeading({ eyebrow, title, sub }: { eyebrow?: string; title: string; sub?: string }) {
  return (
    <div className="mb-6">
      {eyebrow && <p className="text-xs font-medium uppercase tracking-[0.25em] text-[var(--trust)]">{eyebrow}</p>}
      <h2 className="mt-1.5 font-display text-2xl font-semibold tracking-tight text-white sm:text-3xl">{title}</h2>
      {sub && <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/60">{sub}</p>}
    </div>
  );
}

function FeatureChips({ icon, title, items }: { icon: React.ReactNode; title: string; items?: string[] }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
      <p className="flex items-center gap-2.5 text-sm font-semibold text-white">
        <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-[var(--trust)]/12 text-[var(--trust)]">{icon}</span>
        {title}
      </p>
      <div className="mt-3.5 flex flex-wrap gap-2">
        {items.map((item) => (
          <span key={item} className="rounded-lg border border-white/12 bg-white/[0.04] px-3 py-1.5 text-xs leading-relaxed text-white/85">{item}</span>
        ))}
      </div>
    </div>
  );
}

/* ── Lead form ────────────────────────────────────────────────────────────── */
function LeadForm({ projectId, projectName }: { projectId: string; projectName: string }) {
  const [form, setForm] = useState({ name: "", phone: "", email: "", size: "", budget: "", visitDate: "", message: "" });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return toast.error("Please enter your name.");
    if (!/^(\+?91[\-\s]?)?[6-9]\d{9}$/.test(form.phone.trim())) return toast.error("Please enter a valid 10-digit mobile number.");
    setBusy(true);
    // Fold the extra preferences into a single readable message so the founder
    // sees them in the Enquiries inbox without needing new columns.
    const extras = [
      form.size && `Preferred size: ${form.size}`,
      form.budget && `Budget: ${form.budget}`,
      form.visitDate && `Preferred site-visit date: ${form.visitDate}`,
      form.message && `Message: ${form.message}`,
    ].filter(Boolean).join("\n");
    try {
      await api.post("/enquiries/lead", {
        name: form.name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim() || undefined,
        projectId,
        projectName,
        message: extras || undefined,
      });
      setDone(true);
      toast.success("Thank you! Our team will call you shortly.");
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Couldn't submit right now. Please try WhatsApp instead.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-3xl border border-emerald-500/30 bg-emerald-500/10 p-8 text-center">
        <CheckCircle2 className="mx-auto text-emerald-300" size={40} />
        <h3 className="mt-3 font-display text-xl font-semibold text-white">Request received</h3>
        <p className="mt-1.5 text-sm text-white/70">Our team will reach out about <b>{projectName}</b> shortly. For anything urgent, message us on WhatsApp.</p>
        <a href={waLink(`Hi, I just enquired about ${projectName}. Please share the latest price and availability.`)} target="_blank" rel="noreferrer"
          className="mt-5 inline-flex items-center gap-2 rounded-full bg-[#25D366] px-6 py-3 text-sm font-semibold text-black">
          <MessageCircle size={16} /> Chat on WhatsApp
        </a>
      </div>
    );
  }

  const field = "w-full rounded-xl border border-white/12 bg-white/[0.04] px-4 py-3 text-sm text-white placeholder:text-white/35 outline-none focus:border-[var(--trust)]/60";
  return (
    <form onSubmit={submit} className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur sm:p-8">
      <div className="grid gap-3 sm:grid-cols-2">
        <input className={field} placeholder="Full name*" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input className={field} placeholder="Mobile number*" inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        <input className={field} placeholder="Email (optional)" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <input className={field} placeholder="Preferred size (e.g. 30x40, 2BHK)" value={form.size} onChange={(e) => setForm({ ...form, size: e.target.value })} />
        <input className={field} placeholder="Budget (e.g. ₹50L – ₹75L)" value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} />
        <div>
          <label className="mb-1 block text-[11px] uppercase tracking-widest text-white/45">Preferred site-visit date</label>
          <input className={field} type="date" value={form.visitDate} onChange={(e) => setForm({ ...form, visitDate: e.target.value })} />
        </div>
      </div>
      <textarea className={`${field} mt-3`} rows={3} placeholder="Anything specific you're looking for? (optional)" value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />
      <button type="submit" disabled={busy} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[var(--trust)] px-6 py-3.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-60">
        {busy ? <Loader2 size={16} className="animate-spin" /> : <CalendarClock size={16} />}
        {busy ? "Submitting…" : "Book a Site Visit"}
      </button>
      <p className="mt-3 text-center text-[11px] text-white/40">
        By submitting, you agree to be contacted by the Truvi Ventures team. We never share your details with third parties.
      </p>
    </form>
  );
}

/* ── Main page ────────────────────────────────────────────────────────────── */
export default function ProjectLandingPage() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [assets, setAssets] = useState<ProjectAsset[]>([]);
  const [units, setUnits] = useState<PresentationUnit[]>([]);
  const [unitSummary, setUnitSummary] = useState<UnitSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [lightbox, setLightbox] = useState<{ images: ProjectAsset[]; index: number } | null>(null);

  useEffect(() => {
    let alive = true;
    api.get(`/presentation/${id}`)
      .then((res) => {
        if (!alive) return;
        setProject(res.data.project);
        setAssets(res.data.assets ?? []);
        setUnits(res.data.units ?? []);
        setUnitSummary(res.data.unitSummary ?? null);
      })
      .catch(() => alive && setNotFound(true))
      .finally(() => alive && setLoading(false));
    api.post(`/inventory/${id}/view`).catch(() => null);
    return () => { alive = false; };
  }, [id]);

  // Keep the landing page OUT of search engines. It is meant to be reached only
  // via an ad link or a share we send to a buyer — not discovered by browsing
  // or Googling. We add a robots "noindex, nofollow" tag while this page is
  // mounted and remove it on unmount so the rest of the site stays indexable.
  useEffect(() => {
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex, nofollow";
    document.head.appendChild(meta);
    return () => { document.head.removeChild(meta); };
  }, []);

  const heroImages = useMemo(() => assets.filter((a) => IMAGE_MIMES.test(a.mimeType)), [assets]);
  const galleryImages = useMemo(
    () => assets.filter((a) => IMAGE_MIMES.test(a.mimeType) && (a.category === "GALLERY_IMAGE" || a.category === "RENDER_3D")),
    [assets],
  );
  const videos = useMemo(() => assets.filter((a) => VIDEO_MIMES.test(a.mimeType)), [assets]);
  const masterPlan = useMemo(
    () => assets.find((a) => a.category === "MASTER_PLAN" && IMAGE_MIMES.test(a.mimeType))
      ?? assets.find((a) => (a.category === "SITE_PLAN" || a.category === "SKETCH_LAYOUT") && IMAGE_MIMES.test(a.mimeType)),
    [assets],
  );

  const priceRange = useMemo(() => {
    const prices = units.map((u) => u.price).filter((p) => typeof p === "number" && p > 0);
    if (prices.length === 0) return null;
    const min = Math.min(...prices), max = Math.max(...prices);
    return min === max ? formatCompactINR(min) : `${formatCompactINR(min)} – ${formatCompactINR(max)}`;
  }, [units]);

  if (loading) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#05070c] text-white">
        <div className="flex items-center gap-2 text-white/60"><Loader2 className="animate-spin" size={18} /> Loading project…</div>
      </main>
    );
  }
  if (notFound || !project) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#05070c] p-10 text-center text-white">
        <div>
          <p className="text-lg font-medium">This project isn't available.</p>
          <Link to="/inventory" className="mt-3 inline-block text-sm text-[var(--trust)] hover:underline">Explore other projects →</Link>
        </div>
      </main>
    );
  }

  const info = project.presentationInfo;
  const devName = typeof project.developerId === "object" ? (project.developerId as any).name : null;
  const possession = fmtPossession(project.possessionDate);
  const typeLabel = project.projectType ? (PROJECT_TYPE_LABELS[project.projectType] ?? project.projectType) : null;
  const approval = project.approvalAuthority ? APPROVAL_LABEL[project.approvalAuthority] : null;
  const hasMap = typeof project.lat === "number" && typeof project.lng === "number";
  const waHi = waLink(`Hi, I am interested in ${project.name}. Please share the latest price and availability.`);

  function openLightbox(images: ProjectAsset[], asset: ProjectAsset) {
    setLightbox({ images, index: Math.max(0, images.indexOf(asset)) });
  }

  return (
    <main className="min-h-screen bg-[#05070c] text-white">
      {lightbox && (
        <Lightbox images={lightbox.images} index={lightbox.index} onClose={() => setLightbox(null)}
          onNavigate={(i) => setLightbox((lb) => (lb ? { ...lb, index: i } : lb))} />
      )}

      {/* ── Floating header ─────────────────────────────────────────────── */}
      <header className="fixed inset-x-0 top-0 z-[90] border-b border-white/5 bg-[#05070c]/70 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <Link to="/" className="flex items-center gap-2">
            <img src="/brand/wordmark.png" alt="Truvi Ventures" className="h-6 w-auto" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
          </Link>
          <a href="#enquire" className="hidden items-center gap-1.5 rounded-full bg-[var(--trust)] px-4 py-2 text-xs font-semibold text-white sm:inline-flex">
            Enquire Now <ArrowRight size={13} />
          </a>
        </div>
      </header>

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="relative h-[92vh] min-h-[560px] w-full overflow-hidden">
        <HeroCarousel images={heroImages} />
        <div className="relative z-10 mx-auto flex h-full max-w-6xl flex-col justify-end px-4 pb-28 pt-24 sm:pb-16">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}>
            <div className="flex flex-wrap items-center gap-2">
              {project.isVerified && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/40 bg-emerald-500/15 px-3 py-1 text-xs font-medium text-emerald-300">
                  <ShieldCheck size={13} /> Truvi Verified
                </span>
              )}
              {typeLabel && (
                <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-medium text-white/90">{typeLabel}</span>
              )}
              {approval && (
                <span className="rounded-full border border-sky-400/30 bg-sky-500/10 px-3 py-1 text-xs font-medium text-sky-200">{approval}</span>
              )}
            </div>
            <h1 className="mt-4 max-w-3xl font-display text-4xl font-bold leading-tight tracking-tight sm:text-6xl">{project.name}</h1>
            <p className="mt-3 flex items-center gap-1.5 text-base text-white/80">
              <MapPin size={16} /> {project.location}, {project.city}
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-white/75">
              {priceRange && <span>Starting <b className="text-white">{priceRange}</b></span>}
              {possession && <span className="inline-flex items-center gap-1.5"><CalendarClock size={14} /> Possession {possession}</span>}
              {unitSummary && unitSummary.available > 0 && <span className="inline-flex items-center gap-1.5 text-emerald-300"><LayoutGrid size={14} /> {unitSummary.available} units available</span>}
            </div>
            <div className="mt-7 flex flex-wrap gap-3">
              <a href="#enquire" className="inline-flex items-center gap-2 rounded-full bg-[var(--trust)] px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-[var(--trust)]/20 transition hover:brightness-110">
                <CalendarClock size={16} /> Book a Site Visit
              </a>
              <a href={waHi} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full bg-[#25D366] px-6 py-3.5 text-sm font-semibold text-black transition hover:brightness-105">
                <MessageCircle size={16} /> WhatsApp Us
              </a>
            </div>
          </motion.div>
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-6 z-10 hidden justify-center sm:flex">
          <span className="animate-bounce text-white/40 text-xs">Scroll to explore ↓</span>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4 py-14 sm:py-20">
        {/* ── Snapshot ──────────────────────────────────────────────────── */}
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {priceRange && <SnapshotCard label="Price" value={priceRange} hint="+ GST & charges" />}
          {typeLabel && <SnapshotCard label="Type" value={typeLabel} />}
          {unitSummary && <SnapshotCard label="Units" value={String(unitSummary.total)} hint={`${unitSummary.available} available`} />}
          {possession && <SnapshotCard label="Possession" value={possession} />}
          {approval && <SnapshotCard label="Approval" value={project.approvalAuthority ?? ""} hint={approval} />}
          {typeof project.truviScore === "number" && <SnapshotCard label="Truvi Score" value={`${project.truviScore}/100`} />}
        </section>

        {/* ── About / Why this project ──────────────────────────────────── */}
        {project.description && (
          <section className="mt-16">
            <SectionHeading eyebrow="Overview" title={`About ${project.name}`} />
            <p className="max-w-3xl whitespace-pre-line text-[15px] leading-[1.8] text-white/75">{project.description}</p>
          </section>
        )}

        {/* ── Price & Inventory ─────────────────────────────────────────── */}
        {units.length > 0 && (
          <section className="mt-16">
            <SectionHeading eyebrow="Availability" title="Price & Inventory"
              sub="Live inventory maintained by our team. Prices exclude GST, registration and other statutory charges." />
            {unitSummary && (
              <div className="mb-4 flex flex-wrap gap-2">
                <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-white/90">Total: <b className="text-white">{unitSummary.total}</b></span>
                <span className="rounded-full border border-emerald-700/60 bg-emerald-900/30 px-3 py-1 text-xs text-emerald-300">Available: <b>{unitSummary.available}</b></span>
                {Object.entries(unitSummary.byType).map(([t, c]) => (
                  <span key={t} className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-white/90">{t}: <b className="text-white">{c}</b></span>
                ))}
              </div>
            )}
            <div className="overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.02]">
              <table className="w-full min-w-[520px] text-left text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-xs uppercase tracking-wide text-white/45">
                    <th className="px-4 py-3 font-medium">Unit</th>
                    <th className="px-4 py-3 font-medium">Type</th>
                    <th className="px-4 py-3 font-medium">Area (sq.ft)</th>
                    <th className="px-4 py-3 font-medium">Price</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {units.slice(0, 40).map((u) => (
                    <tr key={u._id} className="border-b border-white/5 last:border-0">
                      <td className="px-4 py-3 font-medium text-white">{u.unitNumber}</td>
                      <td className="px-4 py-3 text-white/80">{u.type}</td>
                      <td className="px-4 py-3 text-white/80">{u.areaSqft?.toLocaleString("en-IN")}</td>
                      <td className="px-4 py-3 text-white/80">{u.price ? formatCompactINR(u.price) : "On request"}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${
                          u.status === "AVAILABLE" ? "border-emerald-700/60 bg-emerald-900/40 text-emerald-300"
                            : u.status === "SOLD" ? "border-white/15 bg-white/10 text-white/50"
                            : "border-amber-700/60 bg-amber-900/40 text-amber-300"}`}>
                          {u.status === "AVAILABLE" ? "Available" : u.status === "SOLD" ? "Sold" : u.status === "RESERVED" ? "Reserved" : "On hold"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {units.length > 40 && <p className="mt-2 text-xs text-white/45">Showing 40 of {units.length} units — enquire for the full price list.</p>}
          </section>
        )}

        {/* ── Amenities & features ──────────────────────────────────────── */}
        {info && (info.amenities?.length || info.securityFeatures?.length || info.smartHomeFeatures?.length || info.fireSafetySystems?.length || info.greenBuildingFeatures?.length) && (
          <section className="mt-16">
            <SectionHeading eyebrow="Lifestyle" title="Amenities & Features" />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <FeatureChips icon={<Home size={15} />} title="Amenities & Facilities" items={info.amenities} />
              <FeatureChips icon={<ShieldCheck size={15} />} title="Security" items={info.securityFeatures} />
              <FeatureChips icon={<Camera size={15} />} title="Smart Home" items={info.smartHomeFeatures} />
              <FeatureChips icon={<Flame size={15} />} title="Fire Safety" items={info.fireSafetySystems} />
              <FeatureChips icon={<Leaf size={15} />} title="Green Building" items={info.greenBuildingFeatures} />
            </div>
          </section>
        )}

        {/* ── Master plan ───────────────────────────────────────────────── */}
        {masterPlan && (
          <section className="mt-16">
            <SectionHeading eyebrow="Layout" title="Master Plan" sub="Tap to view the full layout in detail." />
            <button onClick={() => openLightbox([masterPlan], masterPlan)} className="group block w-full overflow-hidden rounded-3xl border border-white/10">
              <img src={masterPlan.fileUrl} alt={masterPlan.title} className="w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]" />
            </button>
          </section>
        )}

        {/* ── Location intelligence + map ───────────────────────────────── */}
        {(hasMap || (info?.nearbyAmenities && info.nearbyAmenities.length > 0) || info?.connectivityNotes) && (
          <section className="mt-16">
            <SectionHeading eyebrow="Location" title="Location & Connectivity"
              sub={`${project.location}, ${project.city}`} />
            <div className="grid gap-5 lg:grid-cols-2">
              {hasMap && (
                <div className="overflow-hidden rounded-3xl border border-white/10">
                  <iframe
                    title="Project location"
                    className="h-72 w-full lg:h-full"
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                    src={`https://maps.google.com/maps?q=${project.lat},${project.lng}&z=14&output=embed`}
                  />
                </div>
              )}
              <div className="space-y-3">
                {info?.connectivityNotes && (
                  <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
                    <p className="flex items-center gap-2 text-sm font-semibold text-white"><Navigation size={15} className="text-[var(--trust)]" /> Connectivity</p>
                    <p className="mt-2 text-sm leading-relaxed text-white/75">{info.connectivityNotes}</p>
                  </div>
                )}
                {info?.nearbyAmenities && info.nearbyAmenities.length > 0 && (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {info.nearbyAmenities.slice(0, 12).map((a, idx) => (
                      <div key={idx} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.02] px-4 py-2.5">
                        <span className="text-sm capitalize text-white/85">{a.name}</span>
                        {a.distance && <span className="text-xs text-white/50">{a.distance}</span>}
                      </div>
                    ))}
                  </div>
                )}
                {hasMap && (
                  <a href={`https://maps.google.com/?q=${project.lat},${project.lng}`} target="_blank" rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-sm text-white/80 hover:bg-white/5">
                    <MapPin size={14} /> Open in Google Maps
                  </a>
                )}
              </div>
            </div>
          </section>
        )}

        {/* ── Approvals & RERA ──────────────────────────────────────────── */}
        {(project.reraNumber || approval) && (
          <section className="mt-16">
            <SectionHeading eyebrow="Compliance" title="Approvals & RERA" />
            <div className="grid gap-4 sm:grid-cols-2">
              {project.reraNumber && (
                <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
                  <p className="flex items-center gap-2 text-sm font-semibold text-white"><ClipboardCheck size={16} className="text-[var(--trust)]" /> RERA Number</p>
                  <p className="mt-2 select-all font-mono text-sm text-white/80">{project.reraNumber}</p>
                </div>
              )}
              {approval && (
                <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
                  <p className="flex items-center gap-2 text-sm font-semibold text-white"><Landmark size={16} className="text-[var(--trust)]" /> Approving Authority</p>
                  <p className="mt-2 text-sm text-white/80">{approval}</p>
                </div>
              )}
            </div>
          </section>
        )}

        {/* ── Truvi Verified ────────────────────────────────────────────── */}
        {(project.isVerified || typeof project.truviScore === "number") && (
          <section className="mt-16">
            <div className="rounded-3xl border border-emerald-500/25 bg-gradient-to-br from-emerald-500/10 to-transparent p-7 sm:p-9">
              <div className="flex flex-wrap items-center gap-4">
                <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-emerald-500/15 text-emerald-300"><ShieldCheck size={28} /></span>
                <div>
                  <h3 className="font-display text-xl font-semibold text-white">Truvi Verified Project</h3>
                  <p className="mt-1 max-w-2xl text-sm leading-relaxed text-white/70">
                    Every listing on Truvi is checked against legal documents, RERA/approval records and an on-ground review before it earns the Verified badge.
                    {typeof project.truviScore === "number" && <> This project scores <b className="text-emerald-300">{project.truviScore}/100</b> on the Truvi Trust Score.</>}
                  </p>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ── Gallery ───────────────────────────────────────────────────── */}
        {galleryImages.length > 0 && (
          <section className="mt-16">
            <SectionHeading eyebrow="Gallery" title="Project Gallery" sub="Swipe through renders and photos. Tap any image to view full-screen." />
            <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {galleryImages.map((img) => (
                <button key={img._id} onClick={() => openLightbox(galleryImages, img)}
                  className="group relative w-72 shrink-0 snap-start overflow-hidden rounded-2xl border border-white/10 text-left sm:w-80">
                  <img src={img.fileUrl} alt={img.title} loading="lazy" className="aspect-[4/3] w-full object-cover transition-transform duration-300 group-hover:scale-105" />
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-3 pt-8">
                    <p className="truncate text-xs font-medium text-white">{img.title}</p>
                    <p className="text-[10px] text-white/55">{categoryLabel(img.category)}</p>
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* ── Video ─────────────────────────────────────────────────────── */}
        {videos.length > 0 && (
          <section className="mt-16">
            <SectionHeading eyebrow="Walkthrough" title="Project Video" />
            <div className="grid gap-4 sm:grid-cols-2">
              {videos.map((v) => (
                <div key={v._id} className="overflow-hidden rounded-2xl border border-white/10">
                  <video controls preload="metadata" className="aspect-video w-full bg-black">
                    <source src={v.fileUrl} type={v.mimeType} />
                  </video>
                  <p className="flex items-center gap-2 p-3 text-xs text-white/70"><PlayCircle size={14} /> {v.title}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Developer ─────────────────────────────────────────────────── */}
        {devName && (
          <section className="mt-16">
            <SectionHeading eyebrow="Developer" title="About the Developer" />
            <div className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.02] p-5">
              <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[var(--trust)]/12 text-[var(--trust)]"><Building2 size={22} /></span>
              <div>
                <p className="text-base font-semibold text-white">{devName}</p>
                <p className="text-sm text-white/60">Listed & verified on Truvi Ventures</p>
              </div>
            </div>
          </section>
        )}

        {/* ── Payment plans / offers ────────────────────────────────────── */}
        {(info?.paymentPlans?.length || info?.offers) && (
          <section className="mt-16 grid gap-4 sm:grid-cols-2">
            {!!info?.paymentPlans?.length && (
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
                <p className="text-xs uppercase tracking-widest text-white/45">Payment Plans</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {info.paymentPlans.map((pl, i) => (
                    <span key={i} className="rounded-full border border-white/12 bg-white/5 px-3 py-1 text-xs text-white/85">{pl}</span>
                  ))}
                </div>
              </div>
            )}
            {info?.offers && (
              <div className="rounded-2xl border border-amber-500/25 bg-amber-900/10 p-5">
                <p className="flex items-center gap-2 text-xs uppercase tracking-widest text-amber-300"><Sparkles size={13} /> Current Offers</p>
                <p className="mt-1.5 text-sm text-white/90">{info.offers}</p>
              </div>
            )}
          </section>
        )}

        {/* ── Lead form ─────────────────────────────────────────────────── */}
        <section id="enquire" className="mt-20 scroll-mt-20">
          <div className="grid gap-8 lg:grid-cols-[1fr_1.1fr]">
            <div>
              <SectionHeading eyebrow="Get in touch" title="Interested in this project?"
                sub="Share your details and our team will call you with the latest price, availability and a site-visit slot that suits you." />
              <div className="space-y-3">
                <a href={waHi} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-2xl border border-[#25D366]/30 bg-[#25D366]/10 p-4 transition hover:bg-[#25D366]/15">
                  <span className="grid size-10 place-items-center rounded-xl bg-[#25D366]/20 text-[#25D366]"><MessageCircle size={18} /></span>
                  <div><p className="text-sm font-semibold text-white">Chat on WhatsApp</p><p className="text-xs text-white/55">Fastest response</p></div>
                </a>
                <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                  <span className="grid size-10 place-items-center rounded-xl bg-[var(--trust)]/12 text-[var(--trust)]"><Star size={18} /></span>
                  <div><p className="text-sm font-semibold text-white">Verified & RERA-checked</p><p className="text-xs text-white/55">Buy with confidence via Truvi</p></div>
                </div>
                <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                  <span className="grid size-10 place-items-center rounded-xl bg-white/8 text-white/80"><FileCheck2 size={18} /></span>
                  <div><p className="text-sm font-semibold text-white">Zero brokerage surprises</p><p className="text-xs text-white/55">Transparent pricing, no hidden charges</p></div>
                </div>
              </div>
            </div>
            <LeadForm projectId={project._id} projectName={project.name} />
          </div>
        </section>
      </div>

      {/* ── Footer + disclaimer ─────────────────────────────────────────── */}
      <footer className="border-t border-white/8 bg-[#04060a] px-4 py-10">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
            <img src="/brand/wordmark.png" alt="Truvi Ventures" className="h-6 w-auto" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
            <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-white/55">
              <Link to="/inventory" className="hover:text-white">All Projects</Link>
              <Link to="/about" className="hover:text-white">About</Link>
              <Link to="/privacy" className="hover:text-white">Privacy</Link>
              <Link to="/terms" className="hover:text-white">Terms</Link>
            </div>
          </div>
          <p className="mt-6 text-[11px] leading-relaxed text-white/35">
            Disclaimer: The information on this page — including images, plans, prices, dimensions and specifications — is indicative and for
            general reference only. It does not constitute a legal offer or contract. Prices exclude GST, registration and other statutory
            charges, and are subject to change without notice. Please verify all details, approvals and RERA registration with the Truvi Ventures
            team before making any purchase decision. © {new Date().getFullYear()} Truvi Ventures.
          </p>
        </div>
      </footer>

      {/* ── Sticky mobile bottom CTA ────────────────────────────────────── */}
      <div className="fixed inset-x-0 bottom-0 z-[95] border-t border-white/10 bg-[#05070c]/95 px-3 py-2.5 backdrop-blur-md sm:hidden">
        <div className="flex items-center gap-2">
          <a href={waHi} target="_blank" rel="noreferrer" className="flex flex-1 items-center justify-center gap-2 rounded-full bg-[#25D366] py-3 text-sm font-semibold text-black">
            <MessageCircle size={16} /> WhatsApp
          </a>
          <a href="#enquire" className="flex flex-1 items-center justify-center gap-2 rounded-full bg-[var(--trust)] py-3 text-sm font-semibold text-white">
            <CalendarClock size={16} /> Check Availability
          </a>
        </div>
      </div>
    </main>
  );
}

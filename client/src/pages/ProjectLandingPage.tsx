import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowRight, Building2, MapPin, ShieldCheck, MessageCircle, CalendarClock, X, Phone,
  ChevronLeft, ChevronRight, CheckCircle2, Home, Leaf, Flame, Camera, Star,
  Navigation, LayoutGrid, PlayCircle, Loader2,
  Calculator, ChevronDown, Ruler, Route, Gauge,
} from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { formatCompactINR, formatINR } from "@/lib/utils";
import { PROJECT_TYPE_LABELS, categoryLabel } from "@/lib/assetCategories";
import ListingIntelligence from "@/components/ListingIntelligence";
import type { Project, ProjectAsset } from "@/types";

/* ─────────────────────────────────────────────────────────────────────────
   Truvi Ventures — High-conversion Project Landing Page (public, /projects/:id)

   A premium, mobile-first, trust-focused landing page for a single project,
   built for buyers arriving from paid ad campaigns. It is deliberately NOT a
   generic real-estate template: every section carries a clear call to action
   (Get Price & Availability / WhatsApp / Book Site Visit), the inventory is
   live from the same source the developer dashboard writes to (fresh on load +
   auto-refresh), and the Truvi verification breakdown shows exactly what was
   independently checked.

   Reached only via a direct ad link (noindex, not linked from the app).
   ──────────────────────────────────────────────────────────────────────── */

const WA_NUMBER = "919196366358";
const CALL_NUMBER = "+919196366358";
const IMAGE_MIMES = /^image\//;
const VIDEO_MIMES = /^video\//;
const INVENTORY_REFRESH_MS = 45000; // keep an open page's inventory current

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

/* ── Lightbox ─────────────────────────────────────────────────────────────── */
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
        <button onClick={onClose} aria-label="Close" className="rounded-lg border border-white/20 p-2 text-white hover:bg-white/10"><X size={16} /></button>
      </div>
      <div className="flex flex-1 items-center justify-center p-4">
        <img src={asset.fileUrl} alt={asset.title} onClick={(e) => e.stopPropagation()} className="max-h-full max-w-full select-none rounded-lg object-contain" />
      </div>
      {index > 0 && (
        <button onClick={(e) => { e.stopPropagation(); onNavigate(index - 1); }} className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full border border-white/20 bg-black/50 p-2.5 text-white hover:bg-white/10"><ChevronLeft size={18} /></button>
      )}
      {index < images.length - 1 && (
        <button onClick={(e) => { e.stopPropagation(); onNavigate(index + 1); }} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full border border-white/20 bg-black/50 p-2.5 text-white hover:bg-white/10"><ChevronRight size={18} /></button>
      )}
    </div>
  );
}

/* ── Hero carousel ────────────────────────────────────────────────────────── */
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
  if (n === 0) return <div className="absolute inset-0 bg-gradient-to-br from-[#0b1220] via-[#0a0d14] to-[#0e1a2b]" />;
  return (
    <div className="absolute inset-0"
      onTouchStart={(e) => { touch.current = { x: e.touches[0].clientX, active: true }; paused.current = true; }}
      onTouchEnd={(e) => {
        if (touch.current.active) { const dx = e.changedTouches[0].clientX - touch.current.x; if (dx < -40) go(i + 1); else if (dx > 40) go(i - 1); }
        touch.current.active = false; paused.current = false;
      }}>
      <div className="flex h-full transition-transform duration-700 ease-out" style={{ transform: `translateX(-${i * 100}%)` }}>
        {images.map((img) => (
          <div key={img._id} className="relative h-full w-full shrink-0">
            <img src={img.fileUrl} alt={img.title} className="h-full w-full object-cover" />
          </div>
        ))}
      </div>
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#05070c] via-[#05070c]/55 to-[#05070c]/25" />
      {n > 1 && (
        <div className="absolute inset-x-0 bottom-24 z-10 flex items-center justify-center gap-1.5 sm:bottom-8">
          {images.map((_, idx) => (
            <button key={idx} onClick={() => go(idx)} aria-label={`Slide ${idx + 1}`} className={`h-1.5 rounded-full transition-all ${idx === i ? "w-6 bg-white" : "w-1.5 bg-white/40"}`} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Small building blocks ────────────────────────────────────────────────── */
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
        <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-[var(--trust)]/12 text-[var(--trust)]">{icon}</span>{title}
      </p>
      <div className="mt-3.5 flex flex-wrap gap-2">
        {items.map((item) => (
          <span key={item} className="rounded-lg border border-white/12 bg-white/[0.04] px-3 py-1.5 text-xs leading-relaxed text-white/85">{item}</span>
        ))}
      </div>
    </div>
  );
}

/** Inline CTA row placed under key sections to keep conversion always in reach. */
function SectionCTA({ waHref }: { waHref: string }) {
  return (
    <div className="mt-6 flex flex-wrap gap-2.5">
      <a href="#enquire" className="inline-flex items-center gap-2 rounded-full bg-[var(--trust)] px-5 py-2.5 text-sm font-semibold text-white transition hover:brightness-110">
        <CalendarClock size={15} /> Get Price &amp; Availability
      </a>
      <a href={waHref} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full border border-[#25D366]/40 bg-[#25D366]/10 px-5 py-2.5 text-sm font-semibold text-[#25D366] transition hover:bg-[#25D366]/15">
        <MessageCircle size={15} /> WhatsApp
      </a>
    </div>
  );
}

/* ── Price calculator ─────────────────────────────────────────────────────── */
function PriceCalculator({ ratePerSqft, sizes, waHref }: { ratePerSqft: number; sizes: number[]; waHref: string }) {
  const [size, setSize] = useState<number>(sizes[0] ?? 1000);
  const total = Math.round(size * ratePerSqft);
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 sm:p-8">
      <p className="flex items-center gap-2 text-sm font-semibold text-white">
        <span className="grid size-8 place-items-center rounded-xl bg-[var(--trust)]/12 text-[var(--trust)]"><Calculator size={16} /></span>
        Estimate your plot cost
      </p>
      <p className="mt-1.5 text-xs text-white/55">Indicative only — starting from <b className="text-white">₹{ratePerSqft.toLocaleString("en-IN")}/sq.ft</b>. Final price depends on plot, facing and charges.</p>

      {sizes.length > 0 && (
        <div className="mt-5 flex flex-wrap gap-2">
          {sizes.map((s) => (
            <button key={s} onClick={() => setSize(s)} className={`rounded-full border px-3.5 py-1.5 text-xs font-medium transition ${size === s ? "border-[var(--trust)] bg-[var(--trust)]/15 text-white" : "border-white/12 bg-white/[0.03] text-white/70 hover:border-white/25"}`}>
              {s.toLocaleString("en-IN")} sq.ft
            </button>
          ))}
        </div>
      )}

      <div className="mt-5">
        <label className="mb-1 block text-[11px] uppercase tracking-widest text-white/45">Plot size (sq.ft)</label>
        <input type="number" min={100} step={50} value={size}
          onChange={(e) => setSize(Math.max(0, Number(e.target.value) || 0))}
          className="w-full rounded-xl border border-white/12 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none focus:border-[var(--trust)]/60" />
      </div>

      <div className="mt-5 flex items-end justify-between rounded-2xl border border-[var(--trust)]/25 bg-[var(--trust)]/10 px-5 py-4">
        <div>
          <p className="text-[11px] uppercase tracking-widest text-white/55">Estimated price</p>
          <p className="mt-0.5 font-display text-2xl font-bold text-white">{formatCompactINR(total)}</p>
          <p className="text-[11px] text-white/45">{formatINR(total)} · excl. GST &amp; charges</p>
        </div>
        <a href={waHref} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-2 rounded-full bg-[#25D366] px-4 py-2.5 text-sm font-semibold text-black transition hover:brightness-105">
          <MessageCircle size={15} /> Exact price
        </a>
      </div>
    </div>
  );
}

/* ── FAQ ──────────────────────────────────────────────────────────────────── */
function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02]">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left">
        <span className="text-sm font-medium text-white">{q}</span>
        <ChevronDown size={16} className={`shrink-0 text-white/50 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <p className="px-5 pb-4 text-sm leading-relaxed text-white/70">{a}</p>}
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
    const extras = [
      form.size && `Preferred size: ${form.size}`,
      form.budget && `Budget: ${form.budget}`,
      form.visitDate && `Preferred site-visit date: ${form.visitDate}`,
      form.message && `Message: ${form.message}`,
    ].filter(Boolean).join("\n");
    try {
      await api.post("/enquiries/lead", {
        name: form.name.trim(), phone: form.phone.trim(), email: form.email.trim() || undefined,
        projectId, projectName, message: extras || undefined,
      });
      setDone(true);
      toast.success("Thank you! Our team will call you shortly.");
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Couldn't submit right now. Please try WhatsApp instead.");
    } finally { setBusy(false); }
  }

  if (done) {
    return (
      <div className="rounded-3xl border border-emerald-500/30 bg-emerald-500/10 p-8 text-center">
        <CheckCircle2 className="mx-auto text-emerald-300" size={40} />
        <h3 className="mt-3 font-display text-xl font-semibold text-white">Request received</h3>
        <p className="mt-1.5 text-sm text-white/70">Our team will reach out about <b>{projectName}</b> shortly.</p>
        <a href={waLink(`Hi, I just enquired about ${projectName}. Please share the latest price and availability.`)} target="_blank" rel="noreferrer" className="mt-5 inline-flex items-center gap-2 rounded-full bg-[#25D366] px-6 py-3 text-sm font-semibold text-black"><MessageCircle size={16} /> Chat on WhatsApp</a>
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
        <input className={field} placeholder="Preferred size (e.g. 30x40, 1200 sq.ft)" value={form.size} onChange={(e) => setForm({ ...form, size: e.target.value })} />
        <input className={field} placeholder="Budget (e.g. ₹50L – ₹75L)" value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} />
        <div>
          <label className="mb-1 block text-[11px] uppercase tracking-widest text-white/45">Preferred site-visit date</label>
          <input className={field} type="date" value={form.visitDate} onChange={(e) => setForm({ ...form, visitDate: e.target.value })} />
        </div>
      </div>
      <textarea className={`${field} mt-3`} rows={3} placeholder="Anything specific you're looking for? (optional)" value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />
      <button type="submit" disabled={busy} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[var(--trust)] px-6 py-3.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-60">
        {busy ? <Loader2 size={16} className="animate-spin" /> : <CalendarClock size={16} />}{busy ? "Submitting…" : "Book a Site Visit"}
      </button>
      <p className="mt-3 text-center text-[11px] text-white/40">By submitting, you agree to be contacted by the Truvi Ventures team. We never share your details.</p>
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

  // Fetch (shared by the initial load and the inventory auto-refresh). The
  // refresh keeps an open page's plot availability current with what the
  // developer edits in their dashboard, without a socket (page is anonymous).
  useEffect(() => {
    let alive = true;
    async function fetchData(initial: boolean) {
      try {
        const res = await api.get(`/presentation/${id}`);
        if (!alive) return;
        if (initial) { setProject(res.data.project); setAssets(res.data.assets ?? []); }
        setUnits(res.data.units ?? []);
        setUnitSummary(res.data.unitSummary ?? null);
      } catch {
        if (initial && alive) setNotFound(true);
      } finally {
        if (initial && alive) setLoading(false);
      }
    }
    fetchData(true);
    api.post(`/inventory/${id}/view`).catch(() => null);
    const timer = setInterval(() => fetchData(false), INVENTORY_REFRESH_MS);
    return () => { alive = false; clearInterval(timer); };
  }, [id]);

  // Keep the landing page OUT of search engines — reached only via an ad link.
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

  // Plot sizes (distinct areas) and a starting per-sq.ft rate for the calculator.
  const plotSizes = useMemo(() => {
    const s = Array.from(new Set(units.map((u) => u.areaSqft).filter((a) => a > 0))).sort((a, b) => a - b);
    return s.slice(0, 6);
  }, [units]);
  const ratePerSqft = useMemo(() => {
    const rates = units.filter((u) => u.price > 0 && u.areaSqft > 0).map((u) => u.price / u.areaSqft);
    if (rates.length) return Math.round(Math.min(...rates));
    return typeof project?.minRate === "number" && project.minRate > 0 ? Math.round(project.minRate) : null;
  }, [units, project?.minRate]);

  if (loading) {
    return <main className="grid min-h-screen place-items-center bg-[#05070c] text-white"><div className="flex items-center gap-2 text-white/60"><Loader2 className="animate-spin" size={18} /> Loading project…</div></main>;
  }
  if (notFound || !project) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#05070c] p-10 text-center text-white">
        <div><p className="text-lg font-medium">This project isn't available.</p><Link to="/inventory" className="mt-3 inline-block text-sm text-[var(--trust)] hover:underline">Explore other projects →</Link></div>
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
  const plotSizeLabel = plotSizes.length ? `${plotSizes[0].toLocaleString("en-IN")}${plotSizes.length > 1 ? `–${plotSizes[plotSizes.length - 1].toLocaleString("en-IN")}` : ""} sq.ft` : null;

  function openLightbox(images: ProjectAsset[], asset: ProjectAsset) {
    setLightbox({ images, index: Math.max(0, images.indexOf(asset)) });
  }

  // Key highlights: Location · Price · Plot Sizes · Connectivity · Verification.
  const highlights = [
    { icon: <MapPin size={16} />, label: "Location", value: `${project.location}, ${project.city}` },
    priceRange ? { icon: <Gauge size={16} />, label: "Price", value: priceRange, hint: "+ GST & charges" } : null,
    plotSizeLabel ? { icon: <Ruler size={16} />, label: "Plot Sizes", value: plotSizeLabel } : null,
    info?.connectivityNotes ? { icon: <Route size={16} />, label: "Connectivity", value: info.connectivityNotes } : null,
    (project.isVerified || typeof project.truviScore === "number")
      ? { icon: <ShieldCheck size={16} />, label: "Verification", value: project.isVerified ? "Truvi Verified" : "Under review", hint: typeof project.truviScore === "number" ? `Score ${project.truviScore}/100` : undefined }
      : null,
  ].filter(Boolean) as { icon: React.ReactNode; label: string; value: string; hint?: string }[];

  // Project-aware FAQ (answered from this project's own data — no generic filler).
  const faqs = [
    { q: "Is this project approved / RERA registered?", a: project.reraNumber ? `Yes. This project is registered${approval ? ` and ${approval.toLowerCase()}` : ""} — RERA number ${project.reraNumber}. You can verify it on the official RERA portal.` : approval ? `Yes — it is ${approval.toLowerCase()}. Message us on WhatsApp for the approval documents.` : "Please contact our team for the latest approval and RERA details." },
    { q: "What is the price?", a: `${priceRange ? `Prices start around ${priceRange}` : "Pricing is shared on request"}, excluding GST, registration and other statutory charges. Tap “Get Price & Availability” or WhatsApp us for the exact, current price list.` },
    plotSizeLabel ? { q: "What plot sizes are available?", a: `Plots are available in ${plotSizeLabel}. Live availability is shown in the Inventory section above — it updates as plots are booked.` } : null,
    { q: "When is possession?", a: possession ? `Possession is planned for ${possession}. Construction milestones and the latest status are shared during your site visit.` : "Please contact our team for the current possession timeline." },
    { q: "Can I visit the site?", a: "Yes — book a free site visit using the form on this page. Our team arranges the visit and walks you through the project, plots and paperwork." },
    { q: "Why should I trust this listing?", a: project.isVerified ? "This project is Truvi Verified — independently checked across legal, approval, on-ground and location data (see the Truvi Verification section above)." : "Truvi independently reviews every listing across legal, approval and on-ground checks. See the Truvi Verification section above for the current status." },
    { q: "How do I book?", a: "Share your details on this page or WhatsApp us. Our team confirms availability, arranges a site visit, and guides you through the booking and payment process end-to-end." },
  ].filter(Boolean) as { q: string; a: string }[];

  return (
    <main className="min-h-screen bg-[#05070c] text-white">
      {lightbox && (
        <Lightbox images={lightbox.images} index={lightbox.index} onClose={() => setLightbox(null)} onNavigate={(i) => setLightbox((lb) => (lb ? { ...lb, index: i } : lb))} />
      )}

      {/* Floating header */}
      <header className="fixed inset-x-0 top-0 z-[90] border-b border-white/5 bg-[#05070c]/70 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <Link to="/" className="flex items-center gap-2">
            <img src="/brand/wordmark.png" alt="Truvi Ventures" className="h-6 w-auto" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
          </Link>
          <a href="#enquire" className="hidden items-center gap-1.5 rounded-full bg-[var(--trust)] px-4 py-2 text-xs font-semibold text-white sm:inline-flex">Book Site Visit <ArrowRight size={13} /></a>
        </div>
      </header>

      {/* 1. Hero */}
      <section className="relative h-[92vh] min-h-[560px] w-full overflow-hidden">
        <HeroCarousel images={heroImages} />
        <div className="relative z-10 mx-auto flex h-full max-w-6xl flex-col justify-end px-4 pb-28 pt-24 sm:pb-16">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}>
            <div className="flex flex-wrap items-center gap-2">
              {project.isVerified && <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/40 bg-emerald-500/15 px-3 py-1 text-xs font-medium text-emerald-300"><ShieldCheck size={13} /> Truvi Verified</span>}
              {typeLabel && <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-medium text-white/90">{typeLabel}</span>}
              {approval && <span className="rounded-full border border-sky-400/30 bg-sky-500/10 px-3 py-1 text-xs font-medium text-sky-200">{approval}</span>}
            </div>
            <h1 className="mt-4 max-w-3xl font-display text-4xl font-bold leading-tight tracking-tight sm:text-6xl">{project.name}</h1>
            <p className="mt-3 flex items-center gap-1.5 text-base text-white/80"><MapPin size={16} /> {project.location}, {project.city}</p>
            <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-white/75">
              {priceRange && <span>Starting <b className="text-white">{priceRange}</b></span>}
              {possession && <span className="inline-flex items-center gap-1.5"><CalendarClock size={14} /> Possession {possession}</span>}
              {unitSummary && unitSummary.available > 0 && <span className="inline-flex items-center gap-1.5 text-emerald-300"><LayoutGrid size={14} /> {unitSummary.available} plots available</span>}
            </div>
            <div className="mt-7 flex flex-wrap gap-3">
              <a href="#enquire" className="inline-flex items-center gap-2 rounded-full bg-[var(--trust)] px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-[var(--trust)]/20 transition hover:brightness-110"><CalendarClock size={16} /> Book a Site Visit</a>
              <a href={waHi} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full bg-[#25D366] px-6 py-3.5 text-sm font-semibold text-black transition hover:brightness-105"><MessageCircle size={16} /> WhatsApp Us</a>
            </div>
          </motion.div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4 py-14 sm:py-20">
        {/* 2. Key Highlights */}
        <section>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
            {highlights.map((h) => (
              <div key={h.label} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <span className="grid size-9 place-items-center rounded-xl bg-[var(--trust)]/12 text-[var(--trust)]">{h.icon}</span>
                <p className="mt-3 text-[11px] uppercase tracking-widest text-white/45">{h.label}</p>
                <p className="mt-0.5 line-clamp-2 text-sm font-semibold text-white">{h.value}</p>
                {h.hint && <p className="mt-0.5 text-[11px] text-white/45">{h.hint}</p>}
              </div>
            ))}
          </div>
        </section>

        {/* 3. Why This Project */}
        {(project.description || info?.offers) && (
          <section className="mt-16">
            <SectionHeading eyebrow="Overview" title={`Why ${project.name}?`} />
            {project.description && <p className="max-w-3xl whitespace-pre-line text-[15px] leading-[1.8] text-white/75">{project.description}</p>}
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {[
                project.isVerified && "Independently Truvi Verified — legal, approval & on-ground checks",
                approval && `${approval} — buy with confidence`,
                priceRange && `Transparent pricing from ${priceRange} — no hidden brokerage`,
                unitSummary && unitSummary.available > 0 && `${unitSummary.available} plots available right now`,
                possession && `Planned possession by ${possession}`,
                info?.connectivityNotes && "Strong connectivity & location advantage",
              ].filter(Boolean).map((point) => (
                <div key={point as string} className="flex items-start gap-2.5 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3">
                  <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-400" />
                  <span className="text-sm text-white/80">{point}</span>
                </div>
              ))}
            </div>
            <SectionCTA waHref={waHi} />
          </section>
        )}

        {/* 4. Location Intelligence + Map */}
        {(hasMap || (info?.nearbyAmenities && info.nearbyAmenities.length > 0) || info?.connectivityNotes) && (
          <section className="mt-16">
            <SectionHeading eyebrow="Location" title="Location & Connectivity" sub={`${project.location}, ${project.city}`} />
            <div className="grid gap-5 lg:grid-cols-2">
              {hasMap && (
                <div className="overflow-hidden rounded-3xl border border-white/10">
                  <iframe title="Project location" className="h-72 w-full lg:h-full" loading="lazy" referrerPolicy="no-referrer-when-downgrade" src={`https://maps.google.com/maps?q=${project.lat},${project.lng}&z=14&output=embed`} />
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
                {hasMap && <a href={`https://maps.google.com/?q=${project.lat},${project.lng}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-sm text-white/80 hover:bg-white/5"><MapPin size={14} /> Open in Google Maps</a>}
              </div>
            </div>
          </section>
        )}

        {/* 5. Master Plan */}
        {masterPlan && (
          <section className="mt-16">
            <SectionHeading eyebrow="Layout" title="Master Plan" sub="Tap to open the full layout — pinch/scroll to explore every block and plot." />
            <button onClick={() => openLightbox([masterPlan], masterPlan)} className="group block w-full overflow-hidden rounded-3xl border border-white/10">
              <img src={masterPlan.fileUrl} alt={masterPlan.title} className="w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]" />
            </button>
            <SectionCTA waHref={waHi} />
          </section>
        )}

        {/* 6. Live Inventory */}
        {units.length > 0 && (
          <section className="mt-16">
            <SectionHeading eyebrow="Availability" title="Live Inventory"
              sub="Updated live from our team — availability changes as plots are booked. Prices exclude GST, registration and other charges." />
            {unitSummary && (
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-300"><span className="size-1.5 animate-pulse rounded-full bg-emerald-400" /> Live</span>
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
                    <th className="px-4 py-3 font-medium">Plot No.</th><th className="px-4 py-3 font-medium">Type</th><th className="px-4 py-3 font-medium">Size (sq.ft)</th><th className="px-4 py-3 font-medium">Price</th><th className="px-4 py-3 font-medium">Availability</th>
                  </tr>
                </thead>
                <tbody>
                  {units.slice(0, 60).map((u) => (
                    <tr key={u._id} className="border-b border-white/5 last:border-0">
                      <td className="px-4 py-3 font-medium text-white">{u.unitNumber}</td>
                      <td className="px-4 py-3 text-white/80">{u.type}</td>
                      <td className="px-4 py-3 text-white/80">{u.areaSqft?.toLocaleString("en-IN")}</td>
                      <td className="px-4 py-3 text-white/80">{u.price ? formatCompactINR(u.price) : "On request"}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${u.status === "AVAILABLE" ? "border-emerald-700/60 bg-emerald-900/40 text-emerald-300" : u.status === "SOLD" ? "border-white/15 bg-white/10 text-white/50" : "border-amber-700/60 bg-amber-900/40 text-amber-300"}`}>
                          {u.status === "AVAILABLE" ? "Available" : u.status === "SOLD" ? "Sold" : u.status === "RESERVED" ? "Reserved" : "On hold"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {units.length > 60 && <p className="mt-2 text-xs text-white/45">Showing 60 of {units.length} plots — enquire for the full price list.</p>}
            <SectionCTA waHref={waHi} />
          </section>
        )}

        {/* 7. Truvi Verification — exactly what was checked */}
        <section className="mt-16">
          <SectionHeading eyebrow="Trust" title="Truvi Verification" sub="Exactly what our team independently checked for this project — across legal, approval, on-ground and location data." />
          <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-4 sm:p-6">
            <ListingIntelligence projectId={project._id} />
          </div>
        </section>

        {/* 8. Amenities */}
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

        {/* 9. Gallery + Drone Video */}
        {(galleryImages.length > 0 || videos.length > 0) && (
          <section className="mt-16">
            <SectionHeading eyebrow="Gallery" title="Project Gallery & Video" sub="Swipe through photos and the drone walkthrough. Tap any image to view full-screen." />
            {galleryImages.length > 0 && (
              <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {galleryImages.map((img) => (
                  <button key={img._id} onClick={() => openLightbox(galleryImages, img)} className="group relative w-72 shrink-0 snap-start overflow-hidden rounded-2xl border border-white/10 text-left sm:w-80">
                    <img src={img.fileUrl} alt={img.title} loading="lazy" className="aspect-[4/3] w-full object-cover transition-transform duration-300 group-hover:scale-105" />
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-3 pt-8">
                      <p className="truncate text-xs font-medium text-white">{img.title}</p>
                      <p className="text-[10px] text-white/55">{categoryLabel(img.category)}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
            {videos.length > 0 && (
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                {videos.map((v) => (
                  <div key={v._id} className="overflow-hidden rounded-2xl border border-white/10">
                    <video controls preload="metadata" className="aspect-video w-full bg-black"><source src={v.fileUrl} type={v.mimeType} /></video>
                    <p className="flex items-center gap-2 p-3 text-xs text-white/70"><PlayCircle size={14} /> {v.title}</p>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* 10. Developer Profile */}
        {devName && (
          <section className="mt-16">
            <SectionHeading eyebrow="Developer" title="About the Developer" />
            <div className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.02] p-5">
              <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[var(--trust)]/12 text-[var(--trust)]"><Building2 size={22} /></span>
              <div><p className="text-base font-semibold text-white">{devName}</p><p className="text-sm text-white/60">Listed &amp; verified on Truvi Ventures</p></div>
            </div>
          </section>
        )}

        {/* 11. Price Calculator */}
        {ratePerSqft && (
          <section className="mt-16">
            <SectionHeading eyebrow="Estimate" title="Price Calculator" sub="A quick, indicative estimate. Get the exact, current price from our team." />
            <PriceCalculator ratePerSqft={ratePerSqft} sizes={plotSizes} waHref={waHi} />
          </section>
        )}

        {/* 12. FAQ */}
        <section className="mt-16">
          <SectionHeading eyebrow="Questions" title="Frequently Asked Questions" />
          <div className="space-y-3">
            {faqs.map((f) => <FaqItem key={f.q} q={f.q} a={f.a} />)}
          </div>
        </section>

        {/* Lead form / 13. Final CTA */}
        <section id="enquire" className="mt-20 scroll-mt-20">
          <div className="grid gap-8 lg:grid-cols-[1fr_1.1fr]">
            <div>
              <SectionHeading eyebrow="Get in touch" title="Book your site visit" sub="Share your details and our team will call you with the latest price, availability and a site-visit slot that suits you." />
              <div className="space-y-3">
                <a href={waHi} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-2xl border border-[#25D366]/30 bg-[#25D366]/10 p-4 transition hover:bg-[#25D366]/15">
                  <span className="grid size-10 place-items-center rounded-xl bg-[#25D366]/20 text-[#25D366]"><MessageCircle size={18} /></span>
                  <div><p className="text-sm font-semibold text-white">Chat on WhatsApp</p><p className="text-xs text-white/55">Fastest response</p></div>
                </a>
                <a href={`tel:${CALL_NUMBER}`} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.02] p-4 transition hover:bg-white/[0.05]">
                  <span className="grid size-10 place-items-center rounded-xl bg-[var(--trust)]/12 text-[var(--trust)]"><Phone size={18} /></span>
                  <div><p className="text-sm font-semibold text-white">Call our team</p><p className="text-xs text-white/55">Mon–Sun, 10am–7pm</p></div>
                </a>
                <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                  <span className="grid size-10 place-items-center rounded-xl bg-white/8 text-white/80"><Star size={18} /></span>
                  <div><p className="text-sm font-semibold text-white">Verified &amp; RERA-checked</p><p className="text-xs text-white/55">Buy with confidence via Truvi</p></div>
                </div>
              </div>
            </div>
            <LeadForm projectId={project._id} projectName={project.name} />
          </div>
        </section>
      </div>

      {/* Footer + disclaimer */}
      <footer className="border-t border-white/8 bg-[#04060a] px-4 py-10 pb-28 sm:pb-10">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
            <img src="/brand/wordmark.png" alt="Truvi Ventures" className="h-6 w-auto" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
            <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-white/55">
              <Link to="/about" className="hover:text-white">About</Link>
              <Link to="/privacy" className="hover:text-white">Privacy</Link>
              <Link to="/terms" className="hover:text-white">Terms</Link>
            </div>
          </div>
          <p className="mt-6 text-[11px] leading-relaxed text-white/35">
            Disclaimer: The information on this page — including images, plans, prices, dimensions and specifications — is indicative and for
            general reference only. It does not constitute a legal offer or contract. Prices exclude GST, registration and other statutory
            charges, and are subject to change without notice. Please verify all details, approvals and RERA registration with the Truvi
            Ventures team before making any purchase decision. © {new Date().getFullYear()} Truvi Ventures.
          </p>
        </div>
      </footer>

      {/* Sticky mobile CTA: Call | WhatsApp | Book Site Visit */}
      <div className="fixed inset-x-0 bottom-0 z-[95] border-t border-white/10 bg-[#05070c]/95 px-3 py-2.5 backdrop-blur-md sm:hidden">
        <div className="flex items-center gap-2">
          <a href={`tel:${CALL_NUMBER}`} className="flex flex-1 flex-col items-center justify-center gap-0.5 rounded-xl border border-white/15 py-2 text-[11px] font-semibold text-white"><Phone size={16} /> Call</a>
          <a href={waHi} target="_blank" rel="noreferrer" className="flex flex-1 flex-col items-center justify-center gap-0.5 rounded-xl bg-[#25D366] py-2 text-[11px] font-semibold text-black"><MessageCircle size={16} /> WhatsApp</a>
          <a href="#enquire" className="flex flex-[1.4] flex-col items-center justify-center gap-0.5 rounded-xl bg-[var(--trust)] py-2 text-[11px] font-semibold text-white"><CalendarClock size={16} /> Book Site Visit</a>
        </div>
      </div>
    </main>
  );
}

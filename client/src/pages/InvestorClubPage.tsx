import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowDown, ArrowRight, ArrowUpRight, BadgeCheck, Building2, CheckCircle2,
  ChevronDown, Compass, FileCheck2, Handshake, Landmark, Layers3, MapPin,
  Menu, Network, Sparkles, Target, TrendingUp, Users, Wallet, X,
} from "lucide-react";
import { api } from "@/lib/api";

type PublicProject = {
  _id: string;
  name: string;
  city: string | null;
  location: string | null;
  developer: string | null;
  isVerified: boolean;
  projectType: string | null;
  availabilityStatus: string | null;
  coverImageUrl: string | null;
};

const lifecycle = [
  { n: "01", title: "Investor onboarding", copy: "Capture an expression of interest and share relevant information about the investor network.", icon: Users },
  { n: "02", title: "Project-specific SPV formation", copy: "Where legally appropriate, define the project vehicle, governance, responsibilities and documentation.", icon: Layers3 },
  { n: "03", title: "Land identification and acquisition", copy: "Assess location, title, approvals, acquisition terms and development feasibility before proceeding.", icon: MapPin },
  { n: "04", title: "Developer JV partnership", copy: "Evaluate execution capability and document the roles, economics and obligations of project partners.", icon: Handshake },
  { n: "05", title: "Development and monitoring", copy: "Track agreed milestones, project activity, material changes and reporting obligations.", icon: TrendingUp },
  { n: "06", title: "Project exit and distribution", copy: "Follow the documented exit process and distribute proceeds, if any, according to definitive agreements.", icon: Wallet },
];

const developerTypes = [
  { title: "Grade A developers", tag: "Established capability", copy: "Established developers with demonstrated project execution capabilities.", image: "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=1100&q=85" },
  { title: "Grade B developers", tag: "Growing operators", copy: "Growing developers with relevant development and operational experience.", image: "https://images.unsplash.com/photo-1487958449943-2429e8be8625?auto=format&fit=crop&w=1100&q=85" },
  { title: "Emerging developers", tag: "Selected potential", copy: "Selected developers whose project capability and potential are subject to evaluation.", image: "https://images.unsplash.com/photo-1511818966892-d7d671e672a2?auto=format&fit=crop&w=1100&q=85" },
];

const capabilities = [
  { title: "Land due diligence", copy: "Organise title, ownership, encumbrance and approval evidence for review.", icon: FileCheck2 },
  { title: "Project feasibility", copy: "Assess acquisition assumptions, development costs, timelines and constraints.", icon: Compass },
  { title: "Developer evaluation", copy: "Review experience, operating capacity, references and delivery approach.", icon: Building2 },
  { title: "Investment structuring", copy: "Clarify project-level structure, roles, governance and documentation with advisers.", icon: Landmark },
  { title: "Project monitoring", copy: "Follow milestones, risks, key decisions and material project updates.", icon: Target },
  { title: "Investor reporting", copy: "Provide reporting in line with the relevant project documents and obligations.", icon: Network },
];

const pillars = [
  { n: "01", title: "Location and connectivity", copy: "Access, surrounding infrastructure, local context and practical development constraints." },
  { n: "02", title: "Acquisition cost and feasibility", copy: "Land cost, title position, approvals, delivery costs and downside assumptions." },
  { n: "03", title: "Developer capability and JV", copy: "Execution history, team capacity, responsibilities, incentives and legal structure." },
  { n: "04", title: "Demand and exit potential", copy: "Relevant market demand, comparable evidence, liquidity considerations and credible exit routes." },
];

const benefits = [
  "Access to selected project information",
  "Project-level participation opportunities, where legally permissible",
  "Documented structures, governance and responsibilities",
  "Project progress reporting under applicable documentation",
  "Developer and real-estate networking",
  "Defined exit and distribution mechanisms, where agreed",
];

const faqs = [
  { q: "What is Truvi Investor Club?", a: "Truvi Investor Club is an information and relationship ecosystem intended to connect interested investors with selected real-estate project information, land opportunities and development partners. Registration records interest only." },
  { q: "How does a project SPV model work?", a: "A special purpose vehicle is a separate legal entity established for a defined project. Its ownership, governance, permitted activities, investor eligibility and economics depend on the final structure and applicable law. No SPV or investment offer is created by submitting this form." },
  { q: "How is land identified and evaluated?", a: "Evaluation may consider location, connectivity, title and encumbrance records, applicable approvals, acquisition cost, feasibility, market demand and potential exit routes. Any diligence outcome depends on the evidence reviewed." },
  { q: "How are developer partners selected?", a: "Potential partners may be evaluated on relevant execution experience, financial and operational capacity, project references, delivery plan and proposed joint-venture terms. No partner is represented as appointed unless verified and disclosed." },
  { q: "How are project returns calculated and distributed?", a: "Any project outcome would be calculated using the applicable project's definitive agreements, realised cash flows, costs, taxes and distribution waterfall. There is no standard return and no return is guaranteed." },
  { q: "What are the potential risks?", a: "Real-estate projects may face title or approval issues, construction delays, cost escalation, market and liquidity risk, counterparty failure, financing risk, regulatory changes and loss of capital. Review project-specific risk disclosures and obtain independent advice." },
  { q: "How can I register investor interest?", a: "Complete the expression-of-interest form on this page. The submission is routed to Truvi's existing enquiries workflow for team follow-up; it does not create an investor account, KYC profile or commitment." },
  { q: "Are returns or capital appreciation guaranteed?", a: "No. Returns, rental income, resale values and capital appreciation are uncertain and are not guaranteed by Truvi or any developer." },
];

const fieldClass = "w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#b99a61] focus:ring-2 focus:ring-[#b99a61]/20 disabled:opacity-60";

function scrollTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] font-semibold uppercase tracking-[.24em] text-[#a58a58]">{children}</p>;
}

function SectionHeading({ eyebrow, title, copy, light = false }: { eyebrow: string; title: string; copy?: string; light?: boolean }) {
  return (
    <div className="max-w-3xl">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className={`mt-4 font-display text-3xl font-medium leading-tight tracking-[-.035em] sm:text-4xl lg:text-[46px] ${light ? "text-white" : "text-[#142235]"}`}>{title}</h2>
      {copy && <p className={`mt-4 max-w-2xl text-sm leading-7 sm:text-base ${light ? "text-white/65" : "text-slate-600"}`}>{copy}</p>}
    </div>
  );
}

function InvestorInterestForm() {
  const [values, setValues] = useState({
    name: "", phone: "", email: "", city: "", profession: "",
    experience: "Exploring real-estate investment",
    geography: "", capacity: "Prefer to discuss",
    horizon: "2–3 years", contactTime: "Business hours",
  });
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const update = (key: keyof typeof values, value: string) => setValues((v) => ({ ...v, [key]: value }));
  const validPhone = /^(?:\+?91[\s-]?)?[6-9]\d{9}$/.test(values.phone.replace(/[()]/g, "").trim());

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (values.name.trim().length < 2) return setError("Please enter your full name.");
    if (!validPhone) return setError("Enter a valid Indian mobile number.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(values.email.trim())) return setError("Enter a valid email address.");
    if (values.city.trim().length < 2) return setError("Please enter your city.");
    if (!consent) return setError("Please read and accept the privacy acknowledgement.");

    setBusy(true);
    try {
      const formData = new FormData();
      formData.append("name", values.name.trim());
      formData.append("phone", values.phone.trim());
      formData.append("email", values.email.trim());
      formData.append("purposeType", "GUEST");
      formData.append("city", values.city.trim());
      formData.append("profession", values.profession.trim());
      formData.append("experience", values.experience);
      formData.append("geography", values.geography.trim());
      formData.append("capacity", values.capacity);
      formData.append("horizon", values.horizon);
      formData.append("contactTime", values.contactTime);
      formData.append("investorClub", "true");
      formData.append("privacyNoticeAcknowledged", "true");
      formData.append("website", website);
      formData.append("message", "Investor Club expression of interest");
      const response = await api.post("/enquiries", formData);
      if (response.status !== 201) throw new Error("The request could not be saved.");
      setSuccess(true);
    } catch (cause: unknown) {
      const failure = cause as { response?: { data?: { error?: string } }; message?: string };
      setError(failure.response?.data?.error || failure.message || "We could not submit your request. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (success) {
    return (
      <div role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 p-7 text-center">
        <CheckCircle2 className="mx-auto text-emerald-700" size={34} />
        <h3 className="mt-4 font-display text-2xl text-[#142235]">Thank you for registering your interest.</h3>
        <p className="mt-2 text-sm leading-6 text-slate-600">Your request has been received by Truvi. A team member may contact you using the details you supplied.</p>
        <p className="mt-4 text-xs leading-5 text-slate-500">This does not constitute an offer, investment application, allotment or commitment.</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block"><span className="mb-2 block text-xs font-semibold text-slate-700">Full Name *</span><input required autoComplete="name" maxLength={120} className={fieldClass} value={values.name} onChange={(e) => update("name", e.target.value)} placeholder="Your full name" /></label>
        <label className="block"><span className="mb-2 block text-xs font-semibold text-slate-700">Mobile Number *</span><input required autoComplete="tel" inputMode="tel" maxLength={18} className={fieldClass} value={values.phone} onChange={(e) => update("phone", e.target.value)} placeholder="+91 98765 43210" /></label>
        <label className="block"><span className="mb-2 block text-xs font-semibold text-slate-700">Email Address *</span><input required autoComplete="email" type="email" maxLength={254} className={fieldClass} value={values.email} onChange={(e) => update("email", e.target.value)} placeholder="name@example.com" /></label>
        <label className="block"><span className="mb-2 block text-xs font-semibold text-slate-700">City *</span><input required autoComplete="address-level2" maxLength={100} className={fieldClass} value={values.city} onChange={(e) => update("city", e.target.value)} placeholder="Your city" /></label>
        <label className="block"><span className="mb-2 block text-xs font-semibold text-slate-700">Profession / Business</span><input maxLength={120} className={fieldClass} value={values.profession} onChange={(e) => update("profession", e.target.value)} placeholder="Profession or business" /></label>
        <label className="block"><span className="mb-2 block text-xs font-semibold text-slate-700">Investment Experience</span><select className={fieldClass} value={values.experience} onChange={(e) => update("experience", e.target.value)}><option>New to real-estate investing</option><option>Exploring real-estate investment</option><option>Some prior experience</option><option>Experienced investor</option></select></label>
        <label className="block"><span className="mb-2 block text-xs font-semibold text-slate-700">Preferred Investment Geography</span><input maxLength={160} className={fieldClass} value={values.geography} onChange={(e) => update("geography", e.target.value)} placeholder="e.g. North India, Lucknow, NCR" /></label>
        <label className="block"><span className="mb-2 block text-xs font-semibold text-slate-700">Indicative Investment Capacity</span><select className={fieldClass} value={values.capacity} onChange={(e) => update("capacity", e.target.value)}><option>Prefer to discuss</option><option>Below ₹10 lakh</option><option>₹10–25 lakh</option><option>₹25–50 lakh</option><option>₹50 lakh–₹1 crore</option><option>₹1–5 crore</option><option>Above ₹5 crore</option></select></label>
        <label className="block"><span className="mb-2 block text-xs font-semibold text-slate-700">Preferred Investment Horizon</span><select className={fieldClass} value={values.horizon} onChange={(e) => update("horizon", e.target.value)}><option>Below 2 years</option><option>2–3 years</option><option>3–5 years</option><option>5+ years</option><option>To be discussed</option></select></label>
        <label className="block"><span className="mb-2 block text-xs font-semibold text-slate-700">Preferred Contact Time</span><select className={fieldClass} value={values.contactTime} onChange={(e) => update("contactTime", e.target.value)}><option>Business hours</option><option>Morning</option><option>Afternoon</option><option>Evening</option></select></label>
      </div>
      <div className="hidden" aria-hidden="true"><label>Website<input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} /></label></div>
      <label className="flex items-start gap-3 text-xs leading-6 text-slate-600"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1 size-4 shrink-0 accent-[#a58a58]" /><span>I acknowledge the <Link className="font-semibold text-[#8b7044] underline" to="/privacy-policy">Privacy Policy</Link> and consent to Truvi using these details to respond to this investor-interest request.</span></label>
      {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</p>}
      <button type="submit" disabled={busy} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[#142235] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#203751] disabled:cursor-not-allowed disabled:opacity-60">{busy ? "Submitting…" : "Submit Investor Interest"} <ArrowRight size={16} /></button>
      <p className="text-[11px] leading-5 text-slate-500">Submitting this form only registers your interest. It does not constitute an offer, investment application, allotment, or commitment. Any investment, where legally permitted, will be subject to eligibility checks, applicable regulatory requirements, disclosures, and definitive documentation.</p>
    </form>
  );
}

export default function InvestorClubPage() {
  const [projects, setProjects] = useState<PublicProject[]>([]);
  const [projectsLoaded, setProjectsLoaded] = useState(false);
  const [expandedFaq, setExpandedFaq] = useState<number | null>(0);
  const [mobileMenu, setMobileMenu] = useState(false);

  useEffect(() => {
    document.title = "TRUVI Investor Club | Structured Real Estate Investment Opportunities";
    const description = "Explore Truvi Investor Club, a real estate investment ecosystem connecting investors, strategic land opportunities, and experienced development partners through structured project-level participation.";
    let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (!meta) { meta = document.createElement("meta"); meta.name = "description"; document.head.appendChild(meta); }
    meta.content = description;
    let canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) { canonical = document.createElement("link"); canonical.rel = "canonical"; document.head.appendChild(canonical); }
    canonical.href = "https://truviventures.com/investor-club";
    const openGraph: Array<[string, string]> = [
      ["og:title", "TRUVI Investor Club | Structured Real Estate Investment Opportunities"],
      ["og:description", description],
      ["og:url", "https://truviventures.com/investor-club"],
      ["og:image", "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1600&q=85"],
    ];
    openGraph.forEach(([key, value]) => {
      let tag = document.querySelector<HTMLMetaElement>(`meta[property="${key}"]`);
      if (!tag) { tag = document.createElement("meta"); tag.setAttribute("property", key); document.head.appendChild(tag); }
      tag.content = value;
    });
  }, []);

  useEffect(() => {
    let active = true;
    api.get("/public/projects", { params: { limit: 12 } })
      .then((response) => { if (active) setProjects(response.data.projects ?? []); })
      .catch(() => { if (active) setProjects([]); })
      .finally(() => { if (active) setProjectsLoaded(true); });
    return () => { active = false; };
  }, []);

  const navItems = [
    ["Our approach", "about"],
    ["How it works", "process"],
    ["Developers", "developers"],
    ["Projects", "projects"],
    ["FAQs", "faqs"],
  ] as const;

  return (
    <main className="min-h-screen bg-[#f7f6f2] text-[#142235]">
      <div className="border-b border-white/10 bg-[#111c2b] px-5 py-2 text-center text-[10px] font-medium uppercase tracking-[.18em] text-white/65">Real estate intelligence · Project-level participation · Investor information</div>
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-[#f7f6f2]/95 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-3 sm:px-8">
          <Link to="/" className="flex items-center gap-3" aria-label="Truvi Ventures home">
            <img src="/brand/icon.png" alt="" className="size-9 object-contain" />
            <span><span className="block text-sm font-semibold tracking-[.18em]">TRUVI</span><span className="block text-[9px] font-semibold tracking-[.2em] text-[#8d7549]">INVESTOR CLUB</span></span>
          </Link>
          <nav className="hidden items-center gap-6 lg:flex" aria-label="Investor Club navigation">
            {navItems.map(([label, id]) => <button key={id} onClick={() => scrollTo(id)} className="text-xs font-semibold text-slate-600 transition hover:text-[#142235]">{label}</button>)}
          </nav>
          <div className="flex items-center gap-2">
            <button onClick={() => scrollTo("register")} className="hidden rounded-full bg-[#142235] px-5 py-2.5 text-xs font-semibold text-white transition hover:bg-[#243b56] sm:inline-flex">Register interest <ArrowUpRight size={14} /></button>
            <button className="grid size-10 place-items-center rounded-full border border-slate-300 lg:hidden" aria-label={mobileMenu ? "Close navigation" : "Open navigation"} aria-expanded={mobileMenu} onClick={() => setMobileMenu((open) => !open)}>{mobileMenu ? <X size={18} /> : <Menu size={18} />}</button>
          </div>
        </div>
        {mobileMenu && <nav className="grid gap-1 border-t border-slate-200 px-5 py-3 lg:hidden" aria-label="Mobile Investor Club navigation">
          {navItems.map(([label, id]) => <button key={id} onClick={() => { scrollTo(id); setMobileMenu(false); }} className="rounded-lg px-3 py-3 text-left text-sm font-medium text-slate-700">{label}</button>)}
          <button onClick={() => { scrollTo("register"); setMobileMenu(false); }} className="mt-1 rounded-lg bg-[#142235] px-3 py-3 text-left text-sm font-semibold text-white">Register interest</button>
        </nav>}
      </header>

      <section className="relative isolate flex min-h-[660px] items-center overflow-hidden bg-[#101b29] sm:min-h-[730px]">
        <img src="https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=2200&q=90" alt="Contemporary luxury residential architecture and landscaped courtyard" fetchPriority="high" className="absolute inset-0 -z-20 h-full w-full object-cover" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[#101b29]/95 via-[#101b29]/72 to-[#101b29]/15" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-[#101b29]/70 via-transparent to-[#101b29]/10" />
        <div className="mx-auto w-full max-w-7xl px-5 py-24 sm:px-8 lg:py-32">
          <motion.div initial={{ opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: [0.2, 0.8, 0.2, 1] }} className="max-w-3xl">
            <div className="mb-7 inline-flex items-center gap-2 border border-white/25 bg-white/10 px-4 py-2 text-[10px] font-semibold uppercase tracking-[.2em] text-white backdrop-blur-sm"><Sparkles size={13} className="text-[#d7bf8c]" /> TRUVI INVESTOR CLUB</div>
            <h1 className="font-display text-5xl font-medium leading-[1.04] tracking-[-.04em] text-white sm:text-6xl lg:text-[76px]">Where Capital Meets <span className="font-display italic text-[#d7bf8c]">Real Estate</span> Opportunities.</h1>
            <p className="mt-7 max-w-2xl text-sm leading-7 text-white/80 sm:text-base sm:leading-8">An organized real estate investment ecosystem connecting investors, strategic land opportunities, and experienced development partners through structured project-level participation.</p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <button onClick={() => scrollTo("process")} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#d4bc8b] px-7 py-3 text-sm font-semibold text-[#172437] transition hover:bg-[#e1cea7]">Explore our investment model <ArrowDown size={16} /></button>
              <button onClick={() => scrollTo("register")} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-white/65 bg-white/5 px-7 py-3 text-sm font-semibold text-white backdrop-blur-sm transition hover:bg-white/15">Register investor interest <ArrowRight size={16} /></button>
            </div>
          </motion.div>
        </div>
      </section>

      <section id="about" className="scroll-mt-24 bg-white px-5 py-24 sm:px-8 lg:py-28">
        <div className="mx-auto grid max-w-7xl items-center gap-14 lg:grid-cols-[1.03fr_.97fr]">
          <div>
            <SectionHeading eyebrow="The ecosystem" title="Building a Structured Real Estate Investment Ecosystem." copy="Truvi connects investor interest with landowners, strategic land opportunities and development capabilities. The objective is to create a clearer process for evaluating projects and understanding project-level participation." />
            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              {["Investors", "Landowners", "Strategic land opportunities", "Grade A developers", "Grade B developers", "Emerging developers", "Project-level structures"].map((item) => <div key={item} className="flex items-center gap-2 text-sm text-slate-700"><CheckCircle2 size={15} className="shrink-0 text-[#a58a58]" />{item}</div>)}
            </div>
          </div>
          <div className="relative">
            <img src="https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1300&q=85" alt="Modern residential development with landscaped grounds" loading="lazy" className="h-[460px] w-full object-cover" />
            <div className="absolute -bottom-6 left-4 max-w-[280px] border border-[#d7c9ab] bg-[#f7f6f2] p-5 shadow-xl sm:left-[-24px]"><Eyebrow>TRUVI APPROACH</Eyebrow><p className="mt-2 font-display text-xl leading-snug">Project context before participation.</p></div>
          </div>
        </div>
      </section>

      <section id="process" className="scroll-mt-24 bg-[#142235] px-5 py-24 text-white sm:px-8 lg:py-28">
        <div className="mx-auto max-w-7xl">
          <SectionHeading eyebrow="The lifecycle" title="From Land Identification to Project Realisation." copy="A project lifecycle built around evaluation, defined responsibilities and reporting checkpoints." light />
          <div className="mt-14 grid gap-7 md:grid-cols-2 lg:grid-cols-3">
            {lifecycle.map((step, index) => { const Icon = step.icon; return <motion.article key={step.n} initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.2 }} transition={{ duration: 0.45, delay: index * 0.04 }} className="relative border-t border-white/20 pt-6">
              <div className="flex items-center justify-between"><span className="font-display text-4xl text-[#d7bf8c]/85">{step.n}</span><Icon size={22} className="text-[#d7bf8c]" /></div>
              <h3 className="mt-5 text-lg font-semibold">{step.title}</h3><p className="mt-2 max-w-sm text-sm leading-6 text-white/60">{step.copy}</p>
              {index < lifecycle.length - 1 && <span className="absolute -bottom-4 right-0 hidden text-[#d7bf8c]/70 lg:block"><ArrowRight size={18} /></span>}
            </motion.article>; })}
          </div>
        </div>
      </section>

      <section id="developers" className="scroll-mt-24 bg-[#f7f6f2] px-5 py-24 sm:px-8 lg:py-28">
        <div className="mx-auto max-w-7xl">
          <SectionHeading eyebrow="Development network" title="The Right Developers. The Right Opportunities." copy="Categories describe partner profiles Truvi may assess; they are not a list of appointed or verified partners." />
          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {developerTypes.map((item) => <article key={item.title} className="group overflow-hidden border border-slate-200 bg-white shadow-[0_15px_55px_-38px_rgba(19,34,53,.3)]">
              <div className="h-56 overflow-hidden"><img src={item.image} alt={item.title + " real-estate development"} loading="lazy" className="h-full w-full object-cover transition duration-700 group-hover:scale-105" /></div>
              <div className="p-6"><Eyebrow>{item.tag}</Eyebrow><h3 className="mt-3 font-display text-2xl text-[#142235]">{item.title}</h3><p className="mt-2 text-sm leading-6 text-slate-600">{item.copy}</p></div>
            </article>)}
          </div>
        </div>
      </section>

      <section className="bg-white px-5 py-24 sm:px-8 lg:py-28">
        <div className="mx-auto max-w-7xl">
          <SectionHeading eyebrow="How we work" title="A More Structured Approach to Real Estate Investment." copy="Diligence and reporting disciplines intended to improve visibility into project-level decisions." />
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {capabilities.map((item) => { const Icon = item.icon; return <article key={item.title} className="border border-slate-200 bg-[#faf9f6] p-6 transition hover:-translate-y-1 hover:shadow-xl hover:shadow-slate-900/5"><Icon size={22} className="text-[#a58a58]" /><h3 className="mt-5 text-base font-semibold">{item.title}</h3><p className="mt-2 text-sm leading-6 text-slate-600">{item.copy}</p></article>; })}
          </div>
        </div>
      </section>

      <section className="bg-[#eae7df] px-5 py-24 sm:px-8 lg:py-28">
        <div className="mx-auto max-w-7xl">
          <SectionHeading eyebrow="Investment philosophy" title="Not Every Land Parcel Is an Opportunity. We Look for the Right Project." copy="Weighing multiple dimensions helps distinguish a compelling narrative from a compelling project." />
          <div className="mt-12 grid border border-[#c9c2b4] sm:grid-cols-2 lg:grid-cols-4">
            {pillars.map((pillar) => <article key={pillar.n} className="border-b border-[#c9c2b4] p-6 last:border-b-0 sm:border-r lg:border-b-0 lg:last:border-r-0"><span className="font-display text-4xl text-[#a58a58]">{pillar.n}</span><h3 className="mt-5 text-lg font-semibold text-[#142235]">{pillar.title}</h3><p className="mt-3 text-sm leading-6 text-slate-600">{pillar.copy}</p></article>)}
          </div>
        </div>
      </section>

      <section className="bg-white px-5 py-24 sm:px-8 lg:py-28">
        <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[.85fr_1.15fr]">
          <SectionHeading eyebrow="Investor experience" title="Built Around Investor Visibility and Structured Participation." copy="Potential benefits depend on the relevant project's final legal structure, eligibility requirements, agreements and disclosures." />
          <div className="grid gap-3 sm:grid-cols-2">{benefits.map((benefit) => <div key={benefit} className="flex gap-3 border-b border-slate-200 py-4"><BadgeCheck size={18} className="mt-0.5 shrink-0 text-[#a58a58]" /><span className="text-sm leading-6 text-slate-700">{benefit}</span></div>)}</div>
        </div>
      </section>

      <section id="projects" className="scroll-mt-24 bg-[#142235] px-5 py-24 text-white sm:px-8 lg:py-28">
        <div className="mx-auto max-w-7xl">
          <SectionHeading eyebrow="Project showcase" title="Explore Real Estate Opportunities." copy="Projects below are sourced from Truvi's existing approved-project feed; a public listing is not an investment offer." light />
          {!projectsLoaded ? <div className="mt-10 grid gap-5 md:grid-cols-3"><div className="h-72 animate-pulse bg-white/10" /><div className="h-72 animate-pulse bg-white/10" /><div className="h-72 animate-pulse bg-white/10" /></div>
            : projects.length === 0 ? <div className="mt-10 border border-white/15 bg-white/[.04] px-6 py-14 text-center"><Building2 size={28} className="mx-auto text-[#d7bf8c]" /><h3 className="mt-4 font-display text-2xl">Projects are being curated.</h3><p className="mt-2 text-sm text-white/60">There are no approved public projects to display right now.</p></div>
            : <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">{projects.map((project) => <article key={project._id} className="overflow-hidden bg-[#1c2c40]">
              <div className="relative h-52 bg-slate-800">{project.coverImageUrl ? <img src={project.coverImageUrl} alt={project.name} loading="lazy" className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center text-white/30"><Building2 size={40} /></div>}<span className="absolute left-3 top-3 bg-[#d7bf8c] px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-[#142235]">{project.projectType || "Real estate"}</span></div>
              <div className="p-5"><h3 className="font-display text-xl">{project.name}</h3><p className="mt-2 flex items-center gap-1.5 text-xs text-white/60"><MapPin size={13} />{[project.location, project.city].filter(Boolean).join(", ") || "Location on request"}</p><p className="mt-4 text-xs text-white/60">Development partner: {project.developer || "Not disclosed"}</p><div className="mt-4 flex items-center justify-between border-t border-white/10 pt-3"><span className="text-xs text-white/55">{project.availabilityStatus === "SOLD_OUT" ? "Sold out" : "Project listing"}</span><Link to={`/projects/${project._id}`} className="inline-flex items-center gap-1 text-xs font-semibold text-[#dfc99c] hover:text-white">View project <ArrowUpRight size={13} /></Link></div></div>
            </article>)}</div>}
          <p className="mt-6 text-[11px] leading-5 text-white/45">Project listing and approval status are not the same as investment eligibility. Any participation requires separate legal and regulatory review and definitive project documentation.</p>
        </div>
      </section>

      <section className="bg-[#f7f6f2] px-5 py-24 sm:px-8 lg:py-28">
        <div className="mx-auto grid max-w-7xl items-center gap-10 lg:grid-cols-[.8fr_1.2fr]">
          <div className="bg-[#142235] p-10 text-white"><Eyebrow>Founder & leadership</Eyebrow><h2 className="mt-5 font-display text-3xl leading-tight">Driven by Vision. Built on Real Estate Intelligence.</h2><p className="mt-4 text-sm leading-7 text-white/65">Truvi's vision is to bring structure, visibility and thoughtful diligence to real-estate opportunities and project partnerships.</p></div>
          <div className="border border-slate-200 bg-white p-8 sm:p-10"><Eyebrow>Leadership</Eyebrow><h3 className="mt-3 font-display text-2xl text-[#142235]">Leadership information</h3><p className="mt-3 text-sm leading-7 text-slate-600">Founder name, photograph, biography and professional credentials will be published here only after the company verifies the final approved profile. No unverified credentials or achievements are displayed.</p></div>
        </div>
      </section>

      <section id="register" className="scroll-mt-24 bg-white px-5 py-24 sm:px-8 lg:py-28">
        <div className="mx-auto grid max-w-7xl items-start gap-12 lg:grid-cols-[.8fr_1.2fr]">
          <div className="lg:sticky lg:top-28"><SectionHeading eyebrow="Investor registration" title="Become Part of the Truvi Investor Network." copy="Register your interest to receive information about our real-estate ecosystem, upcoming opportunities and investor network." /><div className="mt-8 border-l-2 border-[#d7bf8c] pl-5"><p className="text-sm font-semibold text-[#142235]">Expression of interest only</p><p className="mt-2 text-xs leading-6 text-slate-600">The form does not collect money, create an investment commitment or begin KYC onboarding.</p></div></div>
          <div className="border border-slate-200 bg-[#f7f6f2] p-5 shadow-[0_20px_70px_-48px_rgba(20,34,53,.35)] sm:p-9"><InvestorInterestForm /></div>
        </div>
      </section>

      <section id="faqs" className="scroll-mt-24 bg-[#f0eee8] px-5 py-24 sm:px-8 lg:py-28">
        <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[.7fr_1.3fr]"><SectionHeading eyebrow="FAQs" title="Questions Before You Connect." copy="General information about the model. Definitive project documents and applicable legal advice take precedence." />
          <div className="divide-y divide-slate-300 border-y border-slate-300">{faqs.map((item, index) => <div key={item.q}><h3><button aria-expanded={expandedFaq === index} aria-controls={`investor-faq-${index}`} onClick={() => setExpandedFaq((current) => current === index ? null : index)} className="flex w-full items-center justify-between gap-4 py-5 text-left text-sm font-semibold text-[#142235]"><span>{item.q}</span><ChevronDown size={17} className={`shrink-0 transition-transform ${expandedFaq === index ? "rotate-180" : ""}`} /></button></h3>{expandedFaq === index && <div id={`investor-faq-${index}`} className="max-w-2xl pb-5 pr-8 text-sm leading-7 text-slate-600">{item.a}</div>}</div>)}</div>
        </div>
      </section>

      <section className="bg-[#142235] px-5 py-20 text-white sm:px-8"><div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-8 md:flex-row md:items-center"><div><Eyebrow>Start a conversation</Eyebrow><h2 className="mt-4 max-w-3xl font-display text-3xl leading-tight sm:text-4xl">Let's Explore the Future of Real Estate Together.</h2><p className="mt-4 text-sm text-white/60">Connect with Truvi Investor Club and discover a more structured approach to real-estate opportunities.</p></div><button onClick={() => scrollTo("register")} className="inline-flex min-h-12 shrink-0 items-center gap-2 rounded-full bg-[#d7bf8c] px-7 py-3 text-sm font-semibold text-[#142235]">Register Your Interest <ArrowRight size={16} /></button></div></section>

      <footer className="bg-[#0c1522] px-5 py-12 text-white/65 sm:px-8">
        <div className="mx-auto grid max-w-7xl gap-9 md:grid-cols-[1.4fr_1fr_1fr]">
          <div><Link to="/" className="inline-flex items-center gap-3 text-white"><img src="/brand/icon-white.png" alt="" className="size-9 object-contain" /><span className="text-xs font-semibold tracking-[.2em]">TRUVI INVESTOR CLUB</span></Link><p className="mt-4 max-w-sm text-xs leading-6">A real-estate information and relationship ecosystem connecting interested investors, land opportunities and development partners.</p></div>
          <div><h3 className="text-xs font-semibold uppercase tracking-[.18em] text-white">Explore</h3><div className="mt-4 grid gap-3 text-xs"><Link to="/about">About Truvi</Link><Link to="/inventory">Property inventory</Link><button onClick={() => scrollTo("process")} className="text-left">Investment model</button><button onClick={() => scrollTo("register")} className="text-left">Register interest</button></div></div>
          <div><h3 className="text-xs font-semibold uppercase tracking-[.18em] text-white">Policies & contact</h3><div className="mt-4 grid gap-3 text-xs"><Link to="/privacy-policy">Privacy Policy</Link><Link to="/terms">Terms & Conditions</Link><Link to="/legal">Legal information</Link><Link to="/grievance">Grievance redressal</Link><a href="https://truviventures.com" className="hover:text-white">truviventures.com</a></div></div>
        </div>
        <div className="mx-auto mt-10 flex max-w-7xl flex-col gap-2 border-t border-white/10 pt-5 text-[10px] sm:flex-row sm:items-center sm:justify-between"><span>© {new Date().getFullYear()} Truvi Ventures. All rights reserved.</span><span>Real estate involves risk. No return or capital appreciation is guaranteed.</span></div>
      </footer>
      <div className="bg-[#0c1522] px-5 pb-8 text-center text-[10px] leading-5 text-white/40">Project SPV structures, investment marketing and any participation opportunity must be reviewed by qualified Indian legal counsel for applicable securities, company, real-estate and other regulatory requirements before any offer or solicitation.</div>
    </main>
  );
}

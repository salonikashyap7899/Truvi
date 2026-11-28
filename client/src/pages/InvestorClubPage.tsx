import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowDown, ArrowRight, ArrowUpRight, BadgeCheck, Building2, CheckCircle2,
  ChevronDown, Compass, FileCheck2, Handshake, Landmark, Layers3, MapPin,
  Network, Sparkles, Target, TrendingUp, Users, Wallet,
} from "lucide-react";
import { api } from "@/lib/api";
import InvestorConversationScene from "@/components/investor/InvestorConversationScene";

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
  { title: "Grade A developers", tag: "Established capability", copy: "Established developers with demonstrated project execution capabilities.", image: "/images/truvi-projects-dark-bg.jpg" },
  { title: "Grade B developers", tag: "Growing operators", copy: "Growing developers with relevant development and operational experience.", image: "/images/truvi-luxury-dark-bg.jpg" },
  { title: "Emerging developers", tag: "Selected potential", copy: "Selected developers whose project capability and potential are subject to evaluation.", image: "/media/truvi-homepage-cityscape.webp" },
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
  { q: "How do I speak with the Truvi owner?", a: "Start the private dialogue on this page, choose a topic, and send your opening message. The conversation is saved securely and the authorised Truvi owner/admin team can reply to you in the same chat." },
  { q: "Are returns or capital appreciation guaranteed?", a: "No. Returns, rental income, resale values and capital appreciation are uncertain and are not guaranteed by Truvi or any developer." },
];

function scrollTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function Eyebrow({ children, light = false }: { children: React.ReactNode; light?: boolean }) {
  return <p className={`text-[11px] font-semibold uppercase tracking-[.24em] ${light ? "text-[#60a5fa]" : "text-[#2563eb]"}`}>{children}</p>;
}

function SectionHeading({ eyebrow, title, copy, light = false }: { eyebrow: string; title: string; copy?: string; light?: boolean }) {
  return (
    <div className="max-w-3xl">
      <Eyebrow light={light}>{eyebrow}</Eyebrow>
      <h2 className={`mt-4 font-display text-3xl font-medium leading-tight tracking-[-.035em] sm:text-4xl lg:text-[46px] ${light ? "text-white" : "text-[#142235]"}`}>{title}</h2>
      {copy && <p className={`mt-4 max-w-2xl text-sm leading-7 sm:text-base ${light ? "text-white/65" : "text-slate-600"}`}>{copy}</p>}
    </div>
  );
}

export default function InvestorClubPage() {
  const [projects, setProjects] = useState<PublicProject[]>([]);
  const [projectsLoaded, setProjectsLoaded] = useState(false);
  const [expandedFaq, setExpandedFaq] = useState<number | null>(0);

  useEffect(() => {
    document.title = "TRUVI Investor Club | Talk to the Owner";
    const description = "Start a private real-estate investment conversation with Truvi. Discuss projects, land opportunities and development partnerships directly with our owner and team.";
    let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (!meta) { meta = document.createElement("meta"); meta.name = "description"; document.head.appendChild(meta); }
    meta.content = description;
    let canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) { canonical = document.createElement("link"); canonical.rel = "canonical"; document.head.appendChild(canonical); }
    canonical.href = "https://truviventures.com/investor-club";
    const openGraph: Array<[string, string]> = [
      ["og:title", "TRUVI Investor Club | Talk to the Owner"],
      ["og:description", description],
      ["og:url", "https://truviventures.com/investor-club"],
      ["og:image", "https://truviventures.com/images/truvi-projects-dark-bg.jpg"],
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

  return (
    <main className="investor-club-page min-h-screen overflow-hidden bg-[#071321] text-white">
      <section className="relative isolate min-h-[700px] overflow-hidden bg-[#071321] lg:min-h-[calc(100svh-5.5rem)]">
        <img
          src="/images/truvi-projects-dark-bg.jpg"
          alt="Modern commercial skyline at dusk"
          fetchPriority="high"
          className="absolute inset-0 z-0 h-full w-full object-cover object-center"
        />
        <div className="absolute inset-0 z-10 bg-gradient-to-b from-[#071321]/35 via-[#071321]/50 to-[#071321]/90" />
        <div className="absolute inset-0 z-10 bg-gradient-to-r from-[#071321]/55 via-[#071321]/25 to-[#071321]/55" />
        <div className="absolute inset-0 z-10 opacity-30 [background-image:radial-gradient(circle_at_50%_38%,rgba(59,130,246,0.22),transparent_38%)]" />

        <div className="relative z-20 flex min-h-[700px] items-center lg:min-h-[calc(100svh-5.5rem)]">
          <div className="mx-auto flex max-w-7xl flex-col items-center px-5 py-14 text-center sm:px-8 sm:py-16 lg:py-20">
            <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.65, ease: [0.2, 0.8, 0.2, 1] }} className="flex max-w-4xl flex-col items-center">
              <span className="inline-flex items-center gap-2 rounded-full border border-[#60a5fa]/35 bg-[#3b82f6]/10 px-4 py-2 text-[10px] font-semibold uppercase tracking-[.2em] text-[#dbeafe] backdrop-blur-md sm:text-xs">
                <Sparkles size={13} className="text-[#60a5fa]" /> Private investor conversations · Truvi Ventures
              </span>
              <h1 className="mt-7 max-w-5xl font-display text-5xl font-medium leading-[1.04] tracking-[-.045em] text-white sm:text-6xl md:text-7xl lg:text-[84px]">
                Your investment goals.
                <span className="block italic text-[#60a5fa]">A direct conversation.</span>
              </h1>
              <p className="mt-7 max-w-2xl text-sm leading-7 text-white/75 sm:text-base sm:leading-8">
                Talk directly with Truvi about the projects, locations and investment structures you are exploring. Share your questions, then continue the discussion privately with our owner and team.
              </p>
              <div className="mt-9 flex w-full flex-col justify-center gap-3 sm:w-auto sm:flex-row">
                <button onClick={() => scrollTo("register")} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#3b82f6] px-7 py-3 text-sm font-semibold text-white shadow-xl shadow-[#3b82f6]/15 transition hover:-translate-y-0.5 hover:bg-[#2563eb]">
                  Talk to the owner <MessageCircle size={16} />
                </button>
                <button onClick={() => scrollTo("projects")} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-white/35 bg-white/[.06] px-7 py-3 text-sm font-semibold text-white backdrop-blur-md transition hover:border-[#60a5fa]/60 hover:bg-white/10">
                  Explore projects <ArrowUpRight size={16} />
                </button>
              </div>
            </motion.div>

            <div className="mt-16 grid w-full max-w-4xl gap-3 text-left sm:grid-cols-3">
              {[
                { icon: Landmark, title: "Project-level focus", copy: "Explore opportunities in their individual project context." },
                { icon: FileCheck2, title: "Diligence-led process", copy: "Bring title, approvals and feasibility into the conversation." },
                { icon: MessageCircle, title: "Direct owner discussion", copy: "Share your questions and discuss next steps privately with Truvi." },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.title} className="flex items-start gap-3 rounded-2xl border border-white/15 bg-[#071321]/55 p-4 backdrop-blur-lg sm:p-5">
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-[#60a5fa]/25 bg-[#3b82f6]/10 text-[#60a5fa]"><Icon size={19} /></span>
                    <span><span className="block text-sm font-semibold text-white">{item.title}</span><span className="mt-1 block text-xs leading-5 text-white/60">{item.copy}</span></span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <button onClick={() => scrollTo("register")} className="absolute bottom-5 left-1/2 z-20 hidden -translate-x-1/2 flex-col items-center gap-2 text-[9px] font-semibold uppercase tracking-[.25em] text-white/55 transition hover:text-[#60a5fa] md:flex">
          Scroll to explore <span className="grid size-8 place-items-center rounded-full border border-white/20"><ArrowDown size={14} /></span>
        </button>
      </section>

      <InvestorConversationScene projects={projects} projectsLoaded={projectsLoaded} />

      <section id="about" className="scroll-mt-24 bg-[#f8fafc] px-5 py-20 text-[#142235] sm:px-8 lg:py-28">
        <div className="mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-[.94fr_1.06fr] lg:gap-20">
          <div>
            <Eyebrow>The ecosystem</Eyebrow>
            <h2 className="mt-4 max-w-xl font-display text-4xl font-medium leading-[1.1] tracking-[-.035em] sm:text-5xl">A clearer view of <span className="italic text-[#2563eb]">real-estate opportunity.</span></h2>
            <p className="mt-6 max-w-xl text-sm leading-7 text-slate-600 sm:text-base sm:leading-8">
              Truvi connects investor interest with landowners, strategic land opportunities and development capabilities. The objective is to create a clearer process for evaluating projects and understanding project-level participation.
            </p>
            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              {["Investors", "Landowners", "Strategic land opportunities", "Grade A developers", "Grade B developers", "Emerging developers", "Project-level structures"].map((item) => (
                <div key={item} className="flex items-center gap-3 rounded-xl border border-[#dbe4f0] bg-white/70 px-4 py-3 text-sm font-medium text-[#27384c]">
                  <CheckCircle2 size={16} className="shrink-0 text-[#2563eb]" /> {item}
                </div>
              ))}
            </div>
          </div>
          <div className="relative mx-auto w-full max-w-2xl">
            <div className="absolute -inset-4 rounded-[2rem] border border-[#60a5fa]/50" />
            <img src="/images/truvi-luxury-dark-bg.jpg" alt="Contemporary residential development" loading="lazy" className="relative h-[420px] w-full rounded-[1.5rem] object-cover shadow-2xl shadow-slate-900/15 sm:h-[520px]" />
            <div className="absolute -bottom-6 left-4 right-4 rounded-2xl border border-white/15 bg-[#0b1725]/95 p-5 text-white shadow-2xl backdrop-blur-xl sm:left-8 sm:right-8 sm:p-6">
              <Eyebrow light>Truvi approach</Eyebrow>
              <p className="mt-2 font-display text-2xl leading-tight sm:text-3xl">Project context before participation.</p>
            </div>
          </div>
        </div>
      </section>

      <section id="process" className="scroll-mt-24 bg-[#0b1725] px-5 py-20 text-white sm:px-8 lg:py-28">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <SectionHeading eyebrow="The lifecycle" title="From land identification to project realisation." copy="A project lifecycle built around evaluation, defined responsibilities and reporting checkpoints." light />
            <p className="max-w-sm text-xs leading-6 text-white/50">Each project has its own legal structure, documentation, risk profile and decision process.</p>
          </div>
          <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {lifecycle.map((step, index) => {
              const Icon = step.icon;
              return (
                <motion.article key={step.n} initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.2 }} transition={{ duration: 0.4, delay: index * 0.04 }} className="group rounded-2xl border border-white/10 bg-white/[.035] p-6 transition duration-300 hover:-translate-y-1 hover:border-[#3b82f6]/35 hover:bg-white/[.06] sm:p-7">
                  <div className="flex items-center justify-between">
                    <span className="font-display text-4xl text-[#3b82f6]">{step.n}</span>
                    <span className="grid size-11 place-items-center rounded-xl border border-[#3b82f6]/25 bg-[#3b82f6]/10 text-[#60a5fa]"><Icon size={20} /></span>
                  </div>
                  <h3 className="mt-7 text-lg font-semibold text-white">{step.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-white/60">{step.copy}</p>
                  <div className="mt-6 h-px w-10 bg-[#3b82f6]/60 transition-all duration-300 group-hover:w-16" />
                </motion.article>
              );
            })}
          </div>
        </div>
      </section>

      <section id="developers" className="scroll-mt-24 bg-[#f8fafc] px-5 py-20 text-[#142235] sm:px-8 lg:py-28">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <SectionHeading eyebrow="Development network" title="The people behind the project." copy="Categories describe partner profiles Truvi may assess; they are not a list of appointed or verified partners." />
            <span className="max-w-xs text-xs leading-6 text-slate-500">Experience and capability are assessed in the context of each opportunity.</span>
          </div>
          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {developerTypes.map((item, index) => (
              <motion.article key={item.title} initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.2 }} transition={{ duration: 0.4, delay: index * 0.06 }} className="group overflow-hidden rounded-2xl border border-[#dbe4f0] bg-white shadow-[0_18px_55px_-38px_rgba(19,34,53,.35)]">
                <div className="relative h-60 overflow-hidden">
                  <img src={item.image} alt={item.title + " real-estate development"} loading="lazy" className="h-full w-full object-cover transition duration-700 group-hover:scale-105" />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#071321]/80 via-transparent to-transparent" />
                  <span className="absolute bottom-4 left-5 rounded-full border border-white/25 bg-[#071321]/60 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[.16em] text-white backdrop-blur">{item.tag}</span>
                </div>
                <div className="p-6">
                  <h3 className="font-display text-2xl text-[#142235]">{item.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-slate-600">{item.copy}</p>
                </div>
              </motion.article>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[#071321] px-5 py-20 text-white sm:px-8 lg:py-28">
        <div className="mx-auto max-w-7xl">
          <SectionHeading eyebrow="How we work" title="A more structured approach to due diligence." copy="Diligence and reporting disciplines intended to improve visibility into project-level decisions." light />
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {capabilities.map((item) => {
              const Icon = item.icon;
              return (
                <article key={item.title} className="rounded-2xl border border-white/10 bg-white/[.035] p-6 transition duration-300 hover:-translate-y-1 hover:border-[#3b82f6]/35 hover:bg-white/[.06]">
                  <span className="grid size-11 place-items-center rounded-xl border border-[#3b82f6]/25 bg-[#3b82f6]/10 text-[#60a5fa]"><Icon size={21} /></span>
                  <h3 className="mt-5 text-base font-semibold text-white">{item.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-white/60">{item.copy}</p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="bg-[#eff6ff] px-5 py-20 text-[#142235] sm:px-8 lg:py-28">
        <div className="mx-auto max-w-7xl">
          <SectionHeading eyebrow="Investment philosophy" title="Look beyond the land. Understand the whole project." copy="Weighing multiple dimensions helps distinguish a compelling narrative from a compelling project." />
          <div className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {pillars.map((pillar) => (
              <article key={pillar.n} className="rounded-2xl border border-[#cbd5e1] bg-white/65 p-6 sm:p-7">
                <span className="font-display text-4xl text-[#2563eb]">{pillar.n}</span>
                <h3 className="mt-6 text-lg font-semibold text-[#142235]">{pillar.title}</h3>
                <p className="mt-3 text-sm leading-6 text-slate-600">{pillar.copy}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[#0b1725] px-5 py-20 text-white sm:px-8 lg:py-28">
        <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[.85fr_1.15fr] lg:items-center">
          <div>
            <SectionHeading eyebrow="Investor experience" title="Visibility, context and informed conversations." copy="Potential benefits depend on the relevant project's final legal structure, eligibility requirements, agreements and disclosures." light />
            <button onClick={() => scrollTo("register")} className="mt-8 inline-flex min-h-11 items-center gap-2 rounded-full border border-[#3b82f6]/50 px-5 py-2.5 text-sm font-semibold text-[#60a5fa] transition hover:bg-[#3b82f6]/10">Connect with Truvi <ArrowUpRight size={15} /></button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {benefits.map((benefit) => (
              <div key={benefit} className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[.035] p-4 sm:p-5">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[#3b82f6]/10 text-[#60a5fa]"><BadgeCheck size={17} /></span>
                <span className="pt-1 text-sm leading-6 text-white/75">{benefit}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="projects" className="scroll-mt-24 bg-[#071321] px-5 py-20 text-white sm:px-8 lg:py-28">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <SectionHeading eyebrow="Project showcase" title="Explore real-estate opportunities." copy="Projects below are sourced from Truvi's existing approved-project feed; a public listing is not an investment offer." light />
            <span className="text-xs text-white/45">{projectsLoaded ? projects.length + " public projects available" : "Loading approved project listings…"}</span>
          </div>
          {!projectsLoaded ? (
            <div className="mt-12 grid gap-5 md:grid-cols-3">
              <div className="h-80 animate-pulse rounded-2xl bg-white/10" />
              <div className="h-80 animate-pulse rounded-2xl bg-white/10" />
              <div className="h-80 animate-pulse rounded-2xl bg-white/10" />
            </div>
          ) : projects.length === 0 ? (
            <div className="mt-12 rounded-3xl border border-white/10 bg-white/[.035] px-6 py-16 text-center">
              <Building2 size={34} className="mx-auto text-[#60a5fa]" />
              <h3 className="mt-4 font-display text-2xl">Projects are being curated.</h3>
              <p className="mt-2 text-sm text-white/55">There are no approved public projects to display right now.</p>
            </div>
          ) : (
            <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {projects.map((project) => (
                <article key={project._id} className="group overflow-hidden rounded-2xl border border-white/10 bg-[#10243a] shadow-xl shadow-black/10 transition hover:-translate-y-1 hover:border-[#3b82f6]/35">
                  <div className="relative h-56 overflow-hidden bg-slate-800">
                    {project.coverImageUrl ? <img src={project.coverImageUrl} alt={project.name} loading="lazy" className="h-full w-full object-cover transition duration-700 group-hover:scale-105" /> : <div className="grid h-full place-items-center text-white/30"><Building2 size={40} /></div>}
                    <span className="absolute left-4 top-4 rounded-full border border-white/20 bg-[#071321]/75 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[.15em] text-[#60a5fa] backdrop-blur">{project.projectType || "Real estate"}</span>
                  </div>
                  <div className="p-6">
                    <h3 className="font-display text-2xl">{project.name}</h3>
                    <p className="mt-3 flex items-center gap-1.5 text-xs text-white/60"><MapPin size={13} />{[project.location, project.city].filter(Boolean).join(", ") || "Location on request"}</p>
                    <p className="mt-4 text-xs text-white/50">Development partner: {project.developer || "Not disclosed"}</p>
                    <div className="mt-5 flex items-center justify-between border-t border-white/10 pt-4">
                      <span className="text-xs text-white/55">{project.availabilityStatus === "SOLD_OUT" ? "Sold out" : "Project listing"}</span>
                      <Link to={"/projects/" + project._id} className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#60a5fa] transition hover:text-white">View project <ArrowUpRight size={14} /></Link>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
          <p className="mt-7 max-w-4xl text-[11px] leading-5 text-white/40">Project listing and approval status are not the same as investment eligibility. Any participation requires separate legal and regulatory review and definitive project documentation.</p>
        </div>
      </section>

      <section className="bg-[#f8fafc] px-5 py-20 text-[#142235] sm:px-8 lg:py-24">
        <div className="mx-auto grid max-w-7xl gap-5 lg:grid-cols-2">
          <div className="rounded-3xl bg-[#0b1725] p-8 text-white sm:p-10">
            <Eyebrow light>Founder & leadership</Eyebrow>
            <h2 className="mt-5 max-w-lg font-display text-3xl leading-tight sm:text-4xl">Driven by vision. Built on real-estate intelligence.</h2>
            <p className="mt-5 max-w-xl text-sm leading-7 text-white/65">Truvi's vision is to bring structure, visibility and thoughtful diligence to real-estate opportunities and project partnerships.</p>
          </div>
          <div className="rounded-3xl border border-[#dbe4f0] bg-white p-8 sm:p-10">
            <Eyebrow>Leadership</Eyebrow>
            <h3 className="mt-4 font-display text-2xl text-[#142235]">Leadership information</h3>
            <p className="mt-4 text-sm leading-7 text-slate-600">Founder name, photograph, biography and professional credentials will be published here only after the company verifies the final approved profile. No unverified credentials or achievements are displayed.</p>
          </div>
        </div>
      </section>

      <section id="faqs" className="scroll-mt-24 bg-[#f8fafc] px-5 py-20 text-[#142235] sm:px-8 lg:py-28">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[.72fr_1.28fr] lg:gap-20">
          <SectionHeading eyebrow="FAQs" title="Questions before you connect." copy="General information about the model. Definitive project documents and applicable legal advice take precedence." />
          <div className="rounded-2xl border border-[#dbe4f0] bg-white px-5 sm:px-7">
            {faqs.map((item, index) => (
              <div key={item.q} className="border-b border-slate-200 last:border-b-0">
                <h3>
                  <button aria-expanded={expandedFaq === index} aria-controls={"investor-faq-" + index} onClick={() => setExpandedFaq((current) => current === index ? null : index)} className="flex w-full items-center justify-between gap-4 py-5 text-left text-sm font-semibold text-[#142235] sm:text-base">
                    <span>{item.q}</span>
                    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[#eff6ff] text-[#2563eb]"><ChevronDown size={16} className={"transition-transform " + (expandedFaq === index ? "rotate-180" : "")} /></span>
                  </button>
                </h3>
                {expandedFaq === index && <div id={"investor-faq-" + index} className="max-w-2xl pb-5 pr-8 text-sm leading-7 text-slate-600">{item.a}</div>}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="relative isolate overflow-hidden bg-[#071321] px-5 py-20 text-white sm:px-8 lg:py-24">
        <div className="absolute inset-0 z-0 bg-[radial-gradient(ellipse_at_80%_50%,rgba(59,130,246,0.13),transparent_42%)]" />
        <div className="relative z-10 mx-auto flex max-w-7xl flex-col items-start justify-between gap-8 rounded-3xl border border-white/10 bg-white/[.035] p-7 backdrop-blur-xl sm:p-10 md:flex-row md:items-center">
          <div>
            <Eyebrow light>Start a conversation</Eyebrow>
            <h2 className="mt-4 max-w-3xl font-display text-3xl leading-tight sm:text-4xl">Explore real estate with a clearer perspective.</h2>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-white/60">Start a private, on-site conversation with Truvi’s owner about projects, investment structures and partnership opportunities.</p>
          </div>
          <button onClick={() => scrollTo("register")} className="inline-flex min-h-12 shrink-0 items-center gap-2 rounded-full bg-[#3b82f6] px-7 py-3 text-sm font-semibold text-[#142235] transition hover:bg-[#93c5fd]">Talk to the owner <ArrowRight size={16} /></button>
        </div>
      </section>

      <footer className="bg-[#050d18] px-5 py-12 text-white/60 sm:px-8">
        <div className="mx-auto grid max-w-7xl gap-10 md:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <Link to="/" className="inline-flex items-center gap-3 text-white"><img src="/brand/icon-white.png" alt="" className="size-9 object-contain" /><span className="text-xs font-semibold tracking-[.2em]">TRUVI INVESTOR CLUB</span></Link>
            <p className="mt-4 max-w-sm text-xs leading-6">A real-estate information and relationship ecosystem connecting interested investors, land opportunities and development partners.</p>
          </div>
          <div><h3 className="text-xs font-semibold uppercase tracking-[.18em] text-white">Explore</h3><div className="mt-4 grid gap-3 text-xs"><Link to="/about" className="transition hover:text-white">About Truvi</Link><Link to="/inventory" className="transition hover:text-white">Property inventory</Link><button onClick={() => scrollTo("process")} className="text-left transition hover:text-white">Investment model</button><button onClick={() => scrollTo("register")} className="text-left transition hover:text-white">Register interest</button></div></div>
          <div><h3 className="text-xs font-semibold uppercase tracking-[.18em] text-white">Policies & contact</h3><div className="mt-4 grid gap-3 text-xs"><Link to="/privacy-policy" className="transition hover:text-white">Privacy Policy</Link><Link to="/terms" className="transition hover:text-white">Terms & Conditions</Link><Link to="/legal" className="transition hover:text-white">Legal information</Link><Link to="/grievance" className="transition hover:text-white">Grievance redressal</Link><a href="https://truviventures.com" className="transition hover:text-white">truviventures.com</a></div></div>
        </div>
        <div className="mx-auto mt-10 flex max-w-7xl flex-col gap-2 border-t border-white/10 pt-5 text-[10px] sm:flex-row sm:items-center sm:justify-between"><span>© {new Date().getFullYear()} Truvi Ventures. All rights reserved.</span><span>Real estate involves risk. No return or capital appreciation is guaranteed.</span></div>
      </footer>
      <div className="bg-[#050d18] px-5 pb-8 text-center text-[10px] leading-5 text-white/35">Project SPV structures, investment marketing and any participation opportunity must be reviewed by qualified Indian legal counsel for applicable securities, company, real-estate and other regulatory requirements before any offer or solicitation.</div>
    </main>
  );
}

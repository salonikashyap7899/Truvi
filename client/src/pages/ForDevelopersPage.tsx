import { useEffect } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  ArrowRight,
  BarChart3,
  Building2,
  MapPinned,
  ShieldCheck,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";
import { SiteNav } from "@/components/SiteNav";

const CAPABILITIES = [
  {
    icon: MapPinned,
    title: "Demand Heatmaps",
    description: "See where buyers are searching, enquiring and converting across local markets.",
  },
  {
    icon: BarChart3,
    title: "Pricing Intelligence",
    description: "Compare project pricing with relevant projects, corridors and locality benchmarks.",
  },
  {
    icon: Target,
    title: "Competitor Tracking",
    description: "Understand nearby launches, market positioning and competing project activity.",
  },
  {
    icon: Building2,
    title: "Inventory Signals",
    description: "Identify which plot, villa and configuration categories attract demand—and which need attention.",
  },
  {
    icon: Users,
    title: "Lead Intelligence",
    description: "Organise enquiries by intent, purpose and readiness, not just by lead volume.",
  },
  {
    icon: TrendingUp,
    title: "Location Opportunity",
    description: "Explore land and corridor opportunities using infrastructure and local-market signals.",
  },
];

const WORKFLOW = [
  {
    icon: Activity,
    title: "Connect your project",
    description: "Submit project details, inventory and available supporting documents.",
  },
  {
    icon: ShieldCheck,
    title: "Build a clearer profile",
    description: "Truvi organises available information and identifies what is verified, pending or unavailable.",
  },
  {
    icon: BarChart3,
    title: "Use market context",
    description: "Review demand, pricing and competition signals to support launch and inventory decisions.",
  },
];

export default function ForDevelopersPage() {
  useEffect(() => {
    document.title = "TRUVI — For Developers";
  }, []);

  return (
    <main className="relative z-10 min-h-screen pb-28 text-white">
      <SiteNav />

      <section className="mx-auto max-w-6xl px-6 pb-16 pt-32 md:px-10 md:pb-24 md:pt-40">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-300">
          Truvi for developers
        </p>
        <h1 className="mt-5 max-w-5xl font-display text-4xl font-medium leading-[1.04] tracking-tight sm:text-5xl md:text-7xl">
          Launch with market context.
          <span className="text-gradient-trust"> Decide with intelligence.</span>
        </h1>
        <p className="mt-7 max-w-2xl text-base leading-relaxed text-muted-foreground md:text-lg">
          Bring project information, buyer demand and local-market signals into one
          clearer view—so your team can make more informed launch, pricing and
          inventory decisions.
        </p>
        <div className="mt-9 flex flex-wrap items-center gap-3">
          <Link
            to="/signup?role=DEVELOPER"
            className="inline-flex items-center gap-2 rounded-full bg-[var(--trust)] px-6 py-3 text-sm font-semibold text-white transition hover:brightness-110"
          >
            List your project <ArrowRight size={16} />
          </Link>
          <Link
            to="/login"
            className="inline-flex items-center gap-2 rounded-full border border-white/20 px-6 py-3 text-sm font-semibold text-white/90 transition hover:bg-white/5"
          >
            Developer sign in
          </Link>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-12 md:px-10 md:py-16">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-300">
            Developer intelligence
          </p>
          <h2 className="mt-4 font-display text-3xl font-medium leading-tight md:text-5xl">
            The market, as your launch dashboard.
          </h2>
          <p className="mt-5 max-w-2xl text-muted-foreground md:text-lg">
            The same intelligence layer that helps buyers understand a property
            can give developers more context about demand, pricing and competition.
          </p>
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CAPABILITIES.map(({ icon: Icon, title, description }) => (
            <article
              key={title}
              className="h-full rounded-2xl border border-white/10 bg-slate-950/55 p-6 shadow-[0_16px_48px_-32px_rgba(0,0,0,0.9)] backdrop-blur-sm"
            >
              <span className="grid size-11 place-items-center rounded-xl border border-sky-400/20 bg-sky-400/10 text-sky-300">
                <Icon size={20} />
              </span>
              <h3 className="mt-5 font-display text-xl font-medium">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {description}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-12 md:px-10 md:py-16">
        <div className="rounded-3xl border border-sky-400/15 bg-slate-950/55 p-6 backdrop-blur-sm md:p-10">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-300">
            How it works
          </p>
          <h2 className="mt-4 max-w-3xl font-display text-3xl font-medium md:text-4xl">
            From project information to better-informed decisions.
          </h2>
          <div className="mt-9 grid gap-7 md:grid-cols-3">
            {WORKFLOW.map(({ icon: Icon, title, description }, index) => (
              <div key={title}>
                <div className="flex items-center gap-3 text-sky-300">
                  <span className="grid size-10 place-items-center rounded-full border border-sky-400/25 bg-sky-400/10">
                    <Icon size={18} />
                  </span>
                  <span className="text-xs font-semibold tracking-[0.18em]">
                    STEP 0{index + 1}
                  </span>
                </div>
                <h3 className="mt-4 font-display text-xl font-medium">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-20 pt-8 md:px-10">
        <div className="flex flex-col items-start justify-between gap-6 rounded-3xl border border-white/10 bg-slate-950/60 p-7 backdrop-blur-sm md:flex-row md:items-center md:p-10">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-300">
              Work with Truvi
            </p>
            <h2 className="mt-3 max-w-2xl font-display text-2xl font-medium md:text-4xl">
              Bring your next project into clearer focus.
            </h2>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
              Create a developer account to submit your project and explore the platform.
            </p>
          </div>
          <Link
            to="/signup?role=DEVELOPER"
            className="inline-flex shrink-0 items-center gap-2 rounded-full bg-[var(--trust)] px-6 py-3 text-sm font-semibold text-white transition hover:brightness-110"
          >
            Get started <ArrowRight size={16} />
          </Link>
        </div>
      </section>
    </main>
  );
}

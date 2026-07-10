import { Link } from "react-router-dom";

export default function HomePage() {
  return (
    <main className="min-h-screen text-foreground">
      <nav className="flex flex-wrap items-center justify-between gap-3 px-4 py-5 sm:px-6 md:px-16 md:py-6">
        <span className="font-display text-xl font-semibold">Truvi</span>
        <div className="flex flex-wrap items-center gap-3 text-sm sm:gap-4">
          <Link to="/about" className="hover:underline">About</Link>
          <Link to="/login" className="hover:underline">Log in</Link>
          <Link to="/join" className="rounded-full bg-[var(--trust)] px-4 py-2 text-white hover:bg-[var(--trust)]/85">Join Truvi</Link>
        </div>
      </nav>

      <section className="px-6 py-20 text-center md:px-16 md:py-32">
        <h1 className="mx-auto max-w-3xl font-display text-4xl font-semibold leading-tight md:text-6xl">
          Building Ventures. Building Communities. Building Futures.
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-lg text-muted-foreground">
          Truvi is the operating system behind India&apos;s real estate transactions — live inventory,
          real-time updates, transparent commissions, and verified partners, all in one place.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-4">
          <Link to="/join" className="rounded-full bg-[var(--trust)] px-6 py-3 text-white hover:bg-[var(--trust)]/85">Join as Developer</Link>
          <Link to="/join" className="rounded-full border border-white/20 px-6 py-3 hover:bg-white/5">Join as Channel Partner</Link>
        </div>
      </section>

      <section className="glass px-6 py-16 md:px-16">
        <h2 className="text-center font-display text-3xl font-semibold">Real estate runs on fragmented data</h2>
        <p className="mx-auto mt-4 max-w-2xl text-center text-muted-foreground">
          Inventory that&apos;s out of date the moment it&apos;s shared. Commissions that arrive months late,
          with no visibility into why. Truvi replaces all of it with one live, transparent backend —
          now with real-time updates the moment inventory or a lead changes.
        </p>
      </section>

      <section className="px-6 py-16 md:px-16">
        <h2 className="text-center font-display text-3xl font-semibold">Every Stakeholder, One Platform</h2>
        <div className="mx-auto mt-10 grid max-w-4xl grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { title: "Developers", desc: "List projects, manage live inventory, track CP performance and revenue." },
            { title: "Channel Partners", desc: "Discover verified projects, submit leads, track every rupee of commission." },
            { title: "Investors", desc: "Coming soon — portfolio visibility across Truvi-listed developments." },
            { title: "Buyers", desc: "Coming soon — a transparent, verified way to explore new projects." },
          ].map((card) => (
            <div key={card.title} className="rounded-xl border border-white/10 glass p-6">
              <h3 className="font-display text-lg font-semibold">{card.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{card.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Feature 7: Verified CTA section */}
      <section className="px-6 py-16 md:px-16 bg-white/[0.03]">
        <div className="mx-auto max-w-4xl text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-800">
            ✓ Truvi Verified
          </span>
          <h2 className="mt-4 font-display text-3xl font-semibold">Transact with confidence</h2>
          <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
            Every project on Truvi is RERA-checked, legally screened, and trust-scored — so you always know what you're buying into.
          </p>
          <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-3">
            {[
              {
                icon: "🔍",
                title: "Search Property",
                desc: "Browse verified, RERA-compliant projects with live inventory.",
                href: "/buyer/projects",
                cta: "Explore listings",
              },
              {
                icon: "🛡️",
                title: "Verify Property",
                desc: "Run a trust and legal check on any property before you commit.",
                href: "/verify",
                cta: "Start verification",
              },
              {
                icon: "🏗️",
                title: "List Property",
                desc: "List your project with full compliance tools and CP network access.",
                href: "/join",
                cta: "List on Truvi",
              },
            ].map((item) => (
              <div key={item.title} className="rounded-2xl border border-white/10 glass p-6 text-left hover:shadow-md transition-shadow">
                <span className="text-3xl">{item.icon}</span>
                <h3 className="mt-3 font-display text-lg font-semibold">{item.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{item.desc}</p>
                <Link
                  to={item.href}
                  className="mt-4 inline-block rounded-full bg-[var(--trust)] px-4 py-2 text-sm text-white hover:bg-[var(--trust)]/85 transition-colors"
                >
                  {item.cta} →
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[var(--trust)] px-6 py-16 text-center text-white md:px-16">
        <h2 className="font-display text-3xl font-semibold">Ready to build on Truvi?</h2>
        <Link to="/join" className="mt-6 inline-block rounded-full glass px-6 py-3 text-foreground hover:bg-white/10">
          Get started
        </Link>
      </section>

      <footer className="px-6 py-8 text-center text-sm text-muted-foreground md:px-16">
        © 2026 Truvi. Built for trust, transparency, and infrastructure that lasts.
      </footer>
    </main>
  );
}

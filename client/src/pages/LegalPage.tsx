import { useEffect, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";

function LegalSection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-28">
      <h2 className="font-display text-2xl font-semibold md:text-3xl">{title}</h2>
      <div className="mt-4 space-y-4 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}

export default function LegalPage() {
  const { hash } = useLocation();

  useEffect(() => {
    document.title = "TRUVI VENTURES — Legal & Methodology";
    if (hash) {
      const el = document.querySelector(hash);
      if (el) setTimeout(() => el.scrollIntoView({ behavior: "smooth" }), 100);
    } else {
      window.scrollTo(0, 0);
    }
  }, [hash]);

  return (
    <main className="min-h-screen px-6 pb-24 pt-28 md:px-12">
      <div className="mx-auto max-w-3xl">
        <Link to="/" className="flex items-center gap-2 font-display text-base font-semibold tracking-tight">
          <span className="grid size-6 place-items-center rounded-md bg-gradient-to-br from-[var(--trust)] to-[var(--tech)] text-[10px] font-bold">T</span>
          TRUVI VENTURES
        </Link>
        <h1 className="mt-6 font-display text-4xl font-semibold md:text-5xl">Legal & Methodology</h1>
        <p className="mt-3 text-muted-foreground">
          How Truvi handles information, verifies data and communicates its limitations.
        </p>

        <nav className="mt-8 flex flex-wrap gap-2 text-xs">
          {[
            ["#privacy-policy", "Privacy Policy"],
            ["#terms-of-use", "Terms of Use"],
            ["#data-policy", "Data Policy"],
            ["#verification-methodology", "Verification Methodology"],
            ["#disclaimer", "Disclaimer"],
          ].map(([href, label]) => (
            <a key={href} href={href} className="rounded-full glass px-3 py-1.5 text-muted-foreground transition hover:text-foreground">
              {label}
            </a>
          ))}
        </nav>

        <div className="mt-14 space-y-16">
          <LegalSection id="privacy-policy" title="Privacy Policy">
            <p>
              Truvi collects only the information needed to operate the platform: account details you
              provide (name, email, phone, role), project information submitted by developers, and
              usage information that helps us keep the service reliable and secure.
            </p>
            <p>
              Personal information is never sold. Inputs from buyers and residents that inform project
              intelligence are aggregated and anonymised before display — individual responses are not
              exposed. You can request deletion of your account and associated personal data by
              contacting the Truvi team.
            </p>
          </LegalSection>

          <LegalSection id="terms-of-use" title="Terms of Use">
            <p>
              By using Truvi you agree to use the platform lawfully and honestly: provide accurate
              information, respect other participants in the ecosystem, and refrain from misusing data
              made available through the service.
            </p>
            <p>
              Truvi provides information services to buyers, developers, channel partners and other
              real estate participants. Access to certain features requires an approved account.
              Accounts that submit false information or misuse the platform may be suspended.
            </p>
          </LegalSection>

          <LegalSection id="data-policy" title="Data Policy">
            <p>
              Every data point in Truvi carries a source label so you always know its origin: Truvi
              Verified (field-verified by our ambassador and surveyor network), Public Record
              (government registries, RERA filings and other public documents), Builder Submitted
              (provided by the developer, not independently verified unless noted), and User Submitted
              (aggregated, anonymised inputs from buyers and residents).
            </p>
            <p>
              Information also carries a Last Updated date wherever available. Where data could not be
              verified or was not found, it is labelled as such — it is never silently filled in.
            </p>
          </LegalSection>

          <LegalSection id="verification-methodology" title="Verification Methodology">
            <p>
              Truvi's intelligence follows a four-stage pipeline: <strong className="text-foreground">Collect</strong>,
              where ambassador site observations, public records and project information are gathered;{" "}
              <strong className="text-foreground">Verify</strong>, where each data point is checked and tagged with its
              source and confidence; <strong className="text-foreground">Structure</strong>, where fragmented information is
              organised into comparable, decision-ready records; and{" "}
              <strong className="text-foreground">Explain</strong>, where Ask Truvi AI presents it in simple language with
              sources and dates visible.
            </p>
            <p>
              Status labels communicate the state of each dimension honestly: Information Available,
              Needs Verification, Data Unavailable, Attention Required, and Information Mismatch. These
              labels reflect actual data availability — Truvi does not publish scores or claims that the
              underlying data cannot support.
            </p>
            <p>
              Limitations are part of the methodology. Site observations reflect conditions on the date
              of the visit; public records depend on the issuing authority's accuracy and timeliness;
              builder-submitted information is identified as such until independently verified.
            </p>
          </LegalSection>

          <LegalSection id="disclaimer" title="Disclaimer">
            <p>
              Truvi is an information and intelligence platform. It does not provide legal, financial or
              investment advice, does not certify legal approval of any project, and does not guarantee
              returns or outcomes. Content on this platform — including responses from Ask Truvi AI —
              is based on available data at the time shown and should be independently confirmed before
              making decisions.
            </p>
            <p>
              For legal or financial decisions, please consult certified professionals. Truvi presents
              evidence neutrally and identifies open questions; the decision always remains yours.
            </p>
          </LegalSection>
        </div>
      </div>
    </main>
  );
}

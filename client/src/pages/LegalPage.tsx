import { useEffect, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { SiteNav } from "@/components/SiteNav";

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
    document.title = "TRUVI — Legal & Methodology";
    if (hash) {
      const el = document.querySelector(hash);
      if (el) setTimeout(() => el.scrollIntoView({ behavior: "smooth" }), 100);
    } else {
      window.scrollTo(0, 0);
    }
  }, [hash]);

  return (
    <main className="min-h-screen px-4 pb-24 pt-28 sm:px-6 md:px-12">
      <SiteNav />
      <div className="mx-auto max-w-3xl">
        <h1 className="mt-6 font-display text-3xl font-semibold sm:text-4xl md:text-5xl">Legal & Methodology</h1>
        <p className="mt-3 text-muted-foreground">
          How Truvi handles information, verifies data and communicates its limitations.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Truvi is a property intelligence platform operated by Truvi Ventures.
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
              Truvi's full, current Privacy Policy is published separately and describes the personal
              information used across buyer, developer, channel partner, ambassador and employee
              workflows; KYC documents; support; payments; analytics; and AI-assisted features.
              This summary is not a substitute for that notice.
            </p>
            <p>
              <Link to="/privacy-policy" className="text-sky-300 underline underline-offset-2">
                Read the complete Privacy Policy, data categories, provider disclosures, retention
                approach and privacy-request process.
              </Link>
            </p>
          </LegalSection>

          <LegalSection id="terms-of-use" title="Terms of Use">
            <p>
              The binding Terms of Service, payment, property-listing, verification, cancellation and
              complaint provisions are published on the dedicated Terms page. This page is a short
              navigation summary and does not create a separate or conflicting set of terms.
            </p>
            <p>
              <Link to="/terms" className="text-sky-300 underline underline-offset-2">
                Read the complete Terms of Service.
              </Link>
            </p>
          </LegalSection>

          <LegalSection id="data-policy" title="Data Policy">
            <p>
              Where a source label is displayed, it distinguishes information collected by Truvi,
              information taken from public records, information supplied by a developer or other
              contributor, and user-submitted material. A source label describes provenance; it is not
              a legal-title opinion, government certificate or guarantee that the source remains current.
            </p>
            <p>
              A last-updated date and verification status are shown where available. Missing or
              unverified information should not be treated as confirmed. Users should check original
              records with the issuing authority before relying on a property claim.
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

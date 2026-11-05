import { Link } from "react-router-dom";
import { SiteNav } from "@/components/SiteNav";
import { legalDisclosure, missingLegalDisclosures } from "@/config/legalDisclosure";

const resources = [
  {
    title: "Privacy Policy",
    description: "Personal information collected, purposes, sharing, security, retention, privacy requests and grievance contacts.",
    to: "/privacy-policy",
  },
  {
    title: "Terms of Service",
    description: "Platform use, property information limitations, payments and user responsibilities.",
    to: "/terms",
  },
  {
    title: "Refund & Cancellation Policy",
    description: "How to request subscription cancellation, payment investigation and refunds.",
    to: "/refund-policy",
  },
  {
    title: "File a grievance",
    description: "Submit a complaint without creating a Truvi account and receive a case reference.",
    to: "/grievance",
  },
];

export default function LegalPage() {
  return (
    <main className="min-h-screen px-4 pb-24 pt-28 sm:px-6 md:px-12">
      <SiteNav />
      <div className="mx-auto max-w-3xl">
        <p className="mt-6 text-xs font-semibold uppercase tracking-[0.22em] text-sky-300">Trust & transparency</p>
        <h1 className="mt-3 font-display text-3xl font-semibold sm:text-4xl md:text-5xl">Legal information</h1>
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
          This page links to Truvi's current detailed policies. The Privacy Policy is the canonical description
          of personal-data handling; this page intentionally does not repeat abbreviated privacy or terms wording.
        </p>

        <section className="mt-8 rounded-2xl border border-white/10 bg-white/[0.025] p-5" aria-labelledby="statutory-disclosures">
          <h2 id="statutory-disclosures" className="text-base font-semibold text-foreground">Company and customer-care disclosures</h2>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            These details must be populated from current company records and the formal appointment of the grievance officer. Missing values are intentionally not guessed.
          </p>
          <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-2">
            {([
              ["Legal entity name", legalDisclosure.legalEntityName],
              ["Registered office", legalDisclosure.registeredOfficeAddress],
              ["Headquarters / principal address", legalDisclosure.headquartersAddress],
              ["All branch addresses", legalDisclosure.branchAddresses],
              ["CIN / LLPIN", legalDisclosure.cinOrLlpNumber],
              ["GSTIN (only if registered)", legalDisclosure.gstin],
              ["Website", "https://truviventures.com"],
              ["Customer-care email", "info@truviventures.com"],
              ["Customer-care mobile", legalDisclosure.customerCarePhone],
              ["Customer-care landline", legalDisclosure.customerCareLandline],
              ["Grievance Officer name", legalDisclosure.grievanceOfficerName],
              ["Grievance Officer designation", legalDisclosure.grievanceOfficerDesignation],
              ["Grievance Officer email", legalDisclosure.grievanceOfficerEmail],
              ["Grievance Officer mobile", legalDisclosure.grievanceOfficerPhone],
              ["Grievance Officer landline", legalDisclosure.grievanceOfficerLandline],
            ] as Array<[string, string | null]>).map(([label, value]) => (
              <div key={label}>
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="mt-1 break-words font-medium text-foreground">{value || "Not configured — management verification required"}</dd>
              </div>
            ))}
          </dl>
          {missingLegalDisclosures.length > 0 && (
            <p role="alert" className="mt-4 rounded-lg border border-amber-400/25 bg-amber-400/5 p-3 text-xs leading-relaxed text-amber-200">
              Required public identity or grievance contact details remain unconfigured. Truvi management must verify and publish them before the applicable e-commerce disclosure requirements take effect.
            </p>
          )}
          <p className="mt-3 text-xs text-muted-foreground">Submit a customer grievance at <Link to="/grievance" className="text-sky-300 underline">truviventures.com/grievance</Link>.</p>
        </section>

        <div className="mt-10 grid gap-3">
          {resources.map((resource) => (
            <Link
              key={resource.to}
              to={resource.to}
              className="group rounded-2xl border border-white/10 bg-white/[0.025] p-5 transition hover:-translate-y-0.5 hover:border-sky-400/30 hover:bg-white/[0.04]"
            >
              <div className="flex items-center justify-between gap-4">
                <h2 className="text-base font-semibold text-foreground">{resource.title}</h2>
                <span aria-hidden className="text-sky-300 transition group-hover:translate-x-1">→</span>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{resource.description}</p>
            </Link>
          ))}
        </div>

        <section className="mt-10 rounded-2xl border border-white/10 bg-white/[0.025] p-5">
          <h2 className="text-base font-semibold text-foreground">Verification methodology</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Project information may come from government records, site observations, developer submissions or
            user submissions. Each source has different limitations. A developer-provided approval number or an
            AI-generated answer is not, by itself, an official approval or legal opinion. Independently confirm
            project registration, title, approvals, prices and availability with the competent authority and
            qualified professionals before making a property decision.
          </p>
        </section>

        <p className="mt-8 text-xs leading-relaxed text-muted-foreground">
          General support: <a href="mailto:info@truviventures.com" className="text-sky-300 underline">info@truviventures.com</a>.
          The statutory operating-entity and Grievance Officer particulars are shown above and must be
          completed from verified company records before the applicable disclosure requirements take effect.
        </p>
      </div>
    </main>
  );
}

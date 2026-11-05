import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { SiteNav } from "@/components/SiteNav";
import { legalDisclosure, missingLegalDisclosures } from "@/config/legalDisclosure";

const COMPANY = "Truvi Ventures";
const CITY = "Lucknow, Uttar Pradesh, India";
const SUPPORT_EMAIL = "info@truviventures.com";
const UPDATED = "Last updated: 5 November 2026";

function PolicyShell({ title, children, updated }: { title: string; children: ReactNode; updated?: string }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteNav />
      <main className="mx-auto max-w-3xl px-4 pt-32 pb-20 sm:px-6">
        <h1 className="font-display text-3xl font-semibold sm:text-4xl">{title}</h1>
        <p className="mt-2 text-xs text-amber-300/80">{updated ?? UPDATED}</p>
        <div className="prose-invert mt-6 space-y-5 text-sm leading-relaxed text-muted-foreground [&_h2]:mt-8 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-foreground [&_strong]:text-foreground">
          {children}
        </div>

        <div className="mt-12 flex flex-wrap gap-x-5 gap-y-2 border-t border-white/10 pt-6 text-xs text-muted-foreground">
          <Link to="/terms" className="hover:text-foreground">Terms of Service</Link>
          <Link to="/refund-policy" className="hover:text-foreground">Refund &amp; Cancellation</Link>
          <Link to="/privacy-policy" className="hover:text-foreground">Privacy Policy</Link>
          <Link to="/grievance" className="hover:text-foreground">File a grievance</Link>
          <Link to="/pricing" className="hover:text-foreground">Pricing</Link>
        </div>
        <p className="mt-6 text-xs text-muted-foreground">
          {COMPANY} · {CITY} · <a href={`mailto:${SUPPORT_EMAIL}`} className="hover:text-foreground">{SUPPORT_EMAIL}</a>
        </p>
      </main>
    </div>
  );
}

export function TermsPage() {
  return (
    <PolicyShell title="Terms of Service">
      <p>By using the Truvi platform at truviventures.com, you agree to these Terms of Service. The statutory legal entity operating this platform is identified in the company disclosures in the Privacy Policy and on applicable invoices or contracts.</p>
      <h2>1. Services</h2>
      <p>Truvi provides real-estate intelligence, verification, listing and related services to buyers, channel partners and developers. Features and prices are described on our Pricing page and may change with notice.</p>
      <h2>2. Payments</h2>
      <p>Paid services are billed in Indian Rupees and payment processing is handled by the payment provider identified at checkout. Any applicable GST or other tax will be calculated and displayed before payment based on the supplier's registration, the service classification, place-of-supply rules and applicable tax law. The invoice will state the tax actually charged. Do not assume one tax rate applies to every Truvi service.</p>
      <h2>3. Acceptable use</h2>
      <p>You agree not to misuse the platform, resell data without authorisation, or use it for any unlawful purpose.</p>
      <h2>4. Limitation of liability</h2>
      <p>Truvi's intelligence and verification outputs are provided in good faith to assist your decisions but do not constitute legal, financial or investment advice. To the extent permitted by law, our liability for any claim is limited to the amount you paid for the specific service.</p>
      <h2>5. Property information and verification</h2>
      <p>Project details, approvals, prices, inventory and availability can change. A developer-supplied registration number or document is not an independent government verification. Before paying or signing, verify the project's applicable registration or documented exemption with the competent authority and review the underlying documents. Truvi's information tools do not replace legal title due diligence or professional advice.</p>
      <h2>6. Complaints and contact</h2>
      <p>You can submit a grievance without signing in at <Link to="/grievance" className="text-sky-300 underline">File a grievance</Link>, or email <strong>{SUPPORT_EMAIL}</strong>. Statutory consumer and other legal rights are not limited by these Terms.</p>
    </PolicyShell>
  );
}

export function RefundPolicyPage() {
  return (
    <PolicyShell title="Refund &amp; Cancellation Policy">
      <p>This policy explains the process for cancellation and refund requests for paid Truvi services. The specific service, deliverable, price, tax, renewal date and applicable cancellation conditions must be shown before the customer places an order.</p>
      <h2>1. Digital and verification services</h2>
      <p>Where a service is customised or begins immediately after purchase, the applicable scope and cancellation conditions will be shown before payment. A fee may be non-refundable only to the extent permitted by applicable law and where the service has actually been supplied. Nothing in this policy removes a consumer's statutory rights or remedies for deficiency, misrepresentation, an undelivered service or an unauthorised charge.</p>
      <h2>2. Failed, duplicate or unauthorised payments</h2>
      <p>Contact <strong>{SUPPORT_EMAIL}</strong> promptly with your order reference and payment ID. Truvi will investigate the payment with the payment provider and process any refund that is due under the applicable law, provider rules and transaction facts. This policy does not impose a seven-day cut-off on statutory rights.</p>
      <h2>3. Subscription cancellation</h2>
      <p>Use the cancellation control provided in your account where available. Otherwise, email <strong>{SUPPORT_EMAIL}</strong> before the next renewal and include the account email and subscription reference. Truvi will confirm the cancellation request, its effective date and whether another renewal is scheduled. Refund eligibility for an already-started billing period will be assessed under the plan terms and applicable law; no blanket exclusion of statutory rights is intended.</p>
      <h2>4. Refund processing</h2>
      <p>Approved refunds are normally sent to the original payment method through the payment provider. The provider or bank may require additional processing time; Truvi will share the refund reference when available. Any stated processing estimate begins after the refund is actually initiated, not merely when a request is received.</p>
      <h2>5. How to raise a request</h2>
      <p>Email <strong>{SUPPORT_EMAIL}</strong> or use <Link to="/grievance" className="text-sky-300 underline">File a grievance</Link>. Include the order/payment reference, the service concerned and a short explanation. Do not email card numbers, CVV, passwords or OTPs.</p>
    </PolicyShell>
  );
}

export function PrivacyPolicyPage() {
  const L = ({ items }: { items: string[] }) => (
    <ul className="ml-1 list-disc space-y-1 pl-5">{items.map((t, i) => <li key={i}>{t}</li>)}</ul>
  );

  const dataFlows = [
    {
      category: "Account, identity and contact",
      data: "Name, email, phone, role, login/OTP verification state, profile photo, bio and account settings.",
      use: "Registration, login, account recovery, role permissions, support, service notices and account security.",
      access: "The account owner and authorised Truvi personnel who administer accounts or provide support.",
    },
    {
      category: "Developer and partner business profile",
      data: "Company details, business contacts, project ownership, referral relationships, partner tier, payout instructions and onboarding information.",
      use: "Developer/Channel Partner/Ambassador workspaces, project management, referrals, commissions, invoicing and payout administration.",
      access: "The account owner, relevant authorised finance/operations staff and counterparties where needed for a requested transaction.",
    },
    {
      category: "Buyer enquiries, leads and requirements",
      data: "Property preferences, city/locality, budget, area, purpose, buying timeline, client name/contact details where supplied, notes, follow-ups and site-visit details.",
      use: "Requirement matching, property recommendations, lead routing, CRM, contact coordination, site visits and transaction support.",
      access: "The submitter, assigned/authorised team members and relevant project/developer/partner participants when needed to respond to the enquiry. The public/role-based requirement board uses privacy-filtered summaries rather than exposing private client contacts.",
    },
    {
      category: "Employee and workforce records",
      data: "Employee code, official work email and phone, department, designation, employment type, reporting manager, recruitment source, application/interview/joining dates, attendance and check-in/check-out timestamps, leave requests/reasons, assigned tasks, work activity, salary/payroll and manager notes.",
      use: "Employee account provisioning, permissions, HR administration, task allocation, attendance/leave management, performance and workload reporting, salary calculations and payroll records.",
      access: "The employee can access their own permitted records. Authorised administrators, HR/finance staff and reporting managers may access the records required for their assigned responsibilities.",
    },
    {
      category: "KYC and identity documents",
      data: "Aadhaar details/documents, PAN details/documents, selfie image, document type, masked identifiers and verification/review status, where KYC is requested for a role.",
      use: "Channel Partner/Ambassador onboarding, identity checks, fraud prevention and manual compliance review.",
      access: "Restricted to authorised verification and administrator personnel. Channel Partner/Ambassador KYC image bytes are held in restricted PostgreSQL records and served only through authenticated review routes. Buyer identity, address and income-proof files submitted through Buyer Documents are stored separately in a private server directory outside the public uploads folder; only the document owner and authorised administrators receive access through expiring signed links.",
    },
    {
      category: "Projects, property and files",
      data: "Project descriptions, addresses/coordinates, inventory, pricing, brochures, photographs, floor plans, legal/approval/RERA documents and uploaded supporting files.",
      use: "Project publishing, map display, inventory management, legal-document review, property discovery, due diligence and buyer/developer workflows.",
      access: "Developers manage their own projects; authorised reviewers/admins review submitted evidence; approved listing details and files may be shown to users or the public as part of the listing.",
    },
    {
      category: "Payments and financial records",
      data: "Checkout name, email and phone, plan/product, amount, GST calculation, voucher, order/payment identifiers, payment status, subscription records, commissions and payout details.",
      use: "Checkout, payment confirmation, subscriptions/entitlements, refunds, invoices, commissions, accounting, fraud prevention and dispute handling.",
      access: "Razorpay processes the payment transaction. Truvi stores its own order, payment reference, amount, status and related account/finance records; authorised finance/admin personnel can access the records needed for operations.",
    },
    {
      category: "Usage, security and device information",
      data: "IP/network data, browser/device characteristics, request and access times, pages/routes, session/refresh-cookie events, rate-limit events, audit records and error/security telemetry.",
      use: "Authentication, abuse prevention, session revocation, troubleshooting, platform reliability, security investigations and required recordkeeping.",
      access: "Restricted infrastructure, security and authorised administrator personnel.",
    },
    {
      category: "Messages, AI and communications",
      data: "Support/grievance messages, notification preferences, emails/SMS delivery events, call metadata/recordings where call recording is enabled, and prompts/context sent to AI features.",
      use: "Support, account/transaction notifications, OTP delivery, masked calling, call follow-up, AI answers, project/lead analysis and operational assistance.",
      access: "The intended recipient and authorised Truvi personnel; the relevant external provider receives the content or metadata needed to deliver the specific feature.",
    },
  ];

  const providers = [
    ["Supabase PostgreSQL", "Core Truvi account, project, CRM, consent, privacy-request, grievance and transaction records, including restricted KYC document records."],
    ["Hostinger VPS (current production application hosting)", "Runs the deployed Truvi web/API application and hosts its configured server-side upload directories and application logs. Public listing/profile media and restricted buyer-document files are stored on the application host in separate upload locations."],
    ["Razorpay", "Checkout and payment processing. Razorpay receives the information required for payment and returns payment/order references and status to Truvi."],
    ["Google Maps / Places", "Map rendering, address autocomplete, place search and geocoding when a user opens or uses location/map features."],
    ["Google Gemini", "AI requests. Text prompts, selected conversation context and, for image-analysis features, images submitted to that feature may be sent to Google's AI service."],
    ["Twilio", "SMS delivery, including phone verification codes and configured lead alerts or operational text messages."],
    ["Meta WhatsApp Business Cloud API", "WhatsApp messages when the Meta WhatsApp Business integration is configured, including configured developer notifications and lead alerts."],
    ["AiSensy", "An alternative WhatsApp Business messaging provider. When its API key and campaign templates are configured, approved campaigns may send welcome, onboarding or lead-alert messages."],
    ["Configured SMTP email provider", "Account verification, password-reset, employee invitation, property-match and transactional emails. The actual SMTP provider is selected in the deployment configuration."],
    ["Resend (optional)", "Used only when configured and explicitly selected by the property-match email delivery workflow; it is not the default OTP email provider."],
    ["Exotel (when configured)", "Masked/bridged business calls, call status metadata and call recordings if recording is enabled for the account/telephony setup."],
    ["Esri and CARTO", "Map tile imagery and map layers loaded by map screens; the providers may receive normal browser/network request metadata."],
  ];

  return (
    <PolicyShell title="Privacy Policy" updated="Last Updated: 5 November 2026 · Effective Date: 5 November 2026">
      <p>
        Truvi Ventures ("Truvi", "we", "us", or "our") explains here what personal information we collect,
        why we use it, which Truvi features use it, which service providers may receive it, and how you can
        exercise your privacy choices. This notice applies when you visit truviventures.com, register, submit
        an enquiry or requirement, list/manage a project, communicate with Truvi, or use any Truvi workspace.
      </p>
      <p>
        This notice is intended to describe the current product and its configured integrations. A feature may
        send data to a provider only when that feature is used and the relevant provider is enabled. Please do
        not submit information that is not required for the feature you are using.
      </p>

      <h2>1. Who handles your information</h2>
      <p>
        Truvi Ventures is the brand/platform name used on truviventures.com. The exact legal entity
        responsible for the services, its registered office and its statutory identifiers must be read
        from the verified company disclosures below and the applicable invoice or contract. The general
        privacy/support email is <strong>{SUPPORT_EMAIL}</strong>.
      </p>
      <section className="not-prose rounded-xl border border-white/10 bg-white/[0.025] p-4">
        <h2 className="text-base font-semibold text-foreground">Company and grievance disclosures</h2>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          These particulars must be populated from current company records and the formal appointment
          of the responsible grievance officer. No statutory identity or officer name is inferred from
          the Truvi brand.
        </p>
        <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-2">
          {([
            ["Legal entity name", legalDisclosure.legalEntityName],
            ["Registered / principal office", legalDisclosure.registeredOfficeAddress],
            ["CIN / LLPIN", legalDisclosure.cinOrLlpNumber],
            ["GSTIN (if registered)", legalDisclosure.gstin],
            ["Branch addresses (if any)", legalDisclosure.branchAddresses],
            ["Customer care phone", legalDisclosure.customerCarePhone],
            ["Grievance Officer name", legalDisclosure.grievanceOfficerName],
            ["Grievance Officer designation", legalDisclosure.grievanceOfficerDesignation],
            ["Grievance Officer email", legalDisclosure.grievanceOfficerEmail],
            ["Grievance Officer phone", legalDisclosure.grievanceOfficerPhone],
            ["UP RERA agent registration (where required)", legalDisclosure.upReraAgentRegistration],
          ] as Array<[string, string | null]>).map(([label, value]) => (
            <div key={label}>
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="mt-1 break-words font-medium text-foreground">{value || "Not configured — management verification required"}</dd>
            </div>
          ))}
        </dl>
        {missingLegalDisclosures.length > 0 && (
          <p role="alert" className="mt-4 rounded-lg border border-amber-400/25 bg-amber-400/5 p-3 text-xs leading-relaxed text-amber-200">
            Some required public identity or grievance contact details have not yet been configured in the website build. Truvi management must verify and publish them before representing the platform as fully compliant.
          </p>
        )}
        <p className="mt-4 text-xs text-muted-foreground">
          General enquiries: <a href={"mailto:" + SUPPORT_EMAIL} className="text-sky-300 underline">{SUPPORT_EMAIL}</a>.
          {" "}Consumers may submit a grievance at <Link to="/grievance" className="text-sky-300 underline">truviventures.com/grievance</Link>.
        </p>
      </section>

      <h2>2. Information we collect</h2>
      <p>Depending on your role and the features you use, we may collect:</p>
      <L items={[
        "Account details: name, email, phone number, password hash, role, email/phone verification state, login and account settings.",
        "Profile and business details: profile image, bio, company/developer details, partner/referral information and role permissions.",
        "Employee/workforce details (for Employee accounts and staff records): work contact details, department/designation, employment and recruitment dates, attendance/check-in/check-out, leave requests, tasks, work activity, salary/payroll and manager notes.",
        "Property and project details: project name, description, locality/address, map coordinates, pricing, inventory, brochures, images, legal/approval documents and listing information.",
        "Buyer, enquiry and lead details: property preferences, budget, area, purchase purpose, timeline, contact details supplied by the buyer or by a lead submitter with the relevant client's permission, CRM notes, follow-ups and site visits.",
        "KYC information, where required: Aadhaar number/details and document, PAN details/document, selfie image, masked identifier and verification/review state.",
        "Financial information: checkout contact details, plan/product, amount and tax calculation, voucher, payment/order identifiers and status, subscription, commission, invoice and payout records.",
        "Communications: support messages, grievance and privacy-request details, notification preferences, SMS/email delivery metadata, and call metadata/recordings where telephony recording is enabled.",
        "Technical and security data: IP/network information, browser/device type, access times, routes/pages used, session and cookie data, security/audit events, rate-limit signals and error diagnostics.",
        "AI feature content: prompts, chat history and selected project/lead/property context that you choose to submit to Ask Truvi or another AI-assisted feature.",
      ]} />
      <p>
        We may also receive information you choose to provide through a referral, partner, developer, authorised
        lead submitter or an external form/advertising platform. A person submitting another individual's contact
        information must have the authority or permission required to share it with Truvi for the stated enquiry.
      </p>

      <h2>3. How your information is used inside Truvi</h2>
      <p>The table below explains the main product areas where information is used. Access is intended to be role-based and limited to people who need it for the relevant task.</p>
      <div className="not-prose my-5 space-y-3">
        {dataFlows.map((item) => (
          <section key={item.category} className="rounded-xl border border-white/10 bg-white/[0.025] p-4">
            <h3 className="text-sm font-semibold text-foreground">{item.category}</h3>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground"><strong className="text-foreground/80">Information:</strong> {item.data}</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground"><strong className="text-foreground/80">Used in:</strong> {item.use}</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground"><strong className="text-foreground/80">Who may access it:</strong> {item.access}</p>
          </section>
        ))}
      </div>

      <h2>4. Role-based access and sharing with other Truvi users</h2>
      <L items={[
        "Buyers can access their own account, saved requirements, enquiries, documents and transaction history.",
        "Developers can manage their own company/project information and see enquiries or leads routed to their projects where the workflow permits.",
        "Channel Partners, Ambassadors and Employees can access their assigned/submitted leads, tasks, follow-ups, site visits and commission or work information relevant to their role and permissions.",
        "Verifiers and authorised administrators may review submitted KYC, project, legal and compliance evidence. Access to identity documents is restricted to authorised review routes.",
        "A requirement noticeboard may show privacy-filtered property need summaries. It is not intended to publish the submitter's private notes, user ID or client contact details.",
        "When you ask Truvi to connect you with a developer, partner, service provider or prospective customer, relevant contact or requirement information may be shared with that recipient to fulfil your request.",
      ]} />
      <p>Information is not made available to every Truvi user merely because an account exists. Exact access depends on the user's role, permissions, assignment and the feature being used.</p>

      <h2>5. Service providers and external data flows</h2>
      <p>
        Truvi uses external providers to host data, deliver communications, process payments, render maps and
        provide optional AI or telephony features. The providers currently present in the application code and
        their feature purposes include:
      </p>
      <div className="not-prose my-5 overflow-hidden rounded-xl border border-white/10">
        {providers.map(([name, purpose]) => (
          <div key={name} className="border-b border-white/10 p-4 last:border-b-0">
            <p className="text-sm font-semibold text-foreground">{name}</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{purpose}</p>
          </div>
        ))}
      </div>
      <p>
        File storage depends on the document type. Project brochures, listing media, profile images and other
        ordinary uploads are held in the application's configured upload directory and may be viewable by users
        or the public when deliberately attached to a published profile or listing. Sensitive buyer identity,
        address and income-proof files submitted through Buyer Documents are held in a separate private directory
        on the application server, outside the public uploads directory; the database stores their references and
        status, and access is limited to the document owner and authorised administrators through expiring signed
        links. Channel Partner/Ambassador KYC image bytes are stored as restricted records in PostgreSQL and are
        available only through authenticated review routes. The production application currently runs on a
        Hostinger VPS; the database is hosted separately on Supabase PostgreSQL.
      </p>
      <p>
        The email, hosting, database and telephony provider settings may be changed by Truvi's operators. Some
        providers may process information in locations outside your state or country. The exact location,
        subprocessors and transfer arrangements depend on the configured provider and its contract. You may
        contact us to ask for current provider information relevant to your account.
      </p>
      <p>
        Truvi does not sell personal information as a standalone product. We may disclose it to authorised
        service providers acting for Truvi, relevant project/transaction participants where you request a
        service, professional advisers, auditors, financial institutions, regulators or government authorities
        where required or permitted by law, and in connection with a business reorganisation subject to
        applicable protections.
      </p>

      <h2>6. KYC and identity verification</h2>
      <p>
        Channel Partner and Ambassador onboarding may require identity information such as Aadhaar, PAN and
        a selfie. The current application performs format/checksum-level validation and routes the submitted
        documents for manual administrator review. The current KYC service code does not perform an automated
        government-database identity check or an automated selfie/liveness match. Do not interpret an uploaded
        document or a format check as government verification.
      </p>
      <p>
        Channel Partner/Ambassador KYC image bytes are stored as restricted records in PostgreSQL and are
        served through authenticated administrator review routes rather than public document URLs. Buyer
        identity, address and income-proof files submitted through the Buyer Documents workflow are stored in a
        separate private directory on the application host; the database stores their file references/status,
        and files are not served through the public uploads directory. The app issues expiring signed links only
        to the document owner or an authorised administrator. Access is restricted to the people who need the
        documents for verification or review. KYC data may be retained where needed for onboarding, fraud
        prevention, partner obligations, disputes or legal requirements.
      </p>

      <h2>7. AI-assisted features</h2>
      <p>
        Ask Truvi and other AI-assisted features may send the prompt you enter, relevant conversation history,
        and selected project/property/lead context to Google Gemini for generating a response, summary, score
        or analysis. Image-analysis features may send the specific image you submit for that analysis. Do not
        enter passwords, OTPs, full Aadhaar/PAN numbers, bank credentials or other highly sensitive data into
        an AI prompt. AI responses may be inaccurate and should be checked before you rely on them.
      </p>
      <p>
        The external AI provider processes the submitted prompt/context under its own terms and privacy
        documentation. Truvi uses the returned result to provide the feature; whether the provider retains or
        uses submitted content is governed by the provider's current settings and terms, not by a guarantee
        made in this policy.
      </p>

      <h2>8. Maps, location and property searches</h2>
      <p>
        If you use map, address autocomplete, nearby-place or geocoding features, the search text, address or
        coordinates needed for that request may be sent to Google Maps/Places. Map screens may also load
        imagery or tiles from Esri and CARTO. A project or site address/coordinate may be shown in a listing
        when the developer or authorised user has added it. Browser/network requests to those providers may
        disclose normal technical information such as IP address and device/browser details.
      </p>

      <h2>9. Payments and financial records</h2>
      <p>
        When you check out, Truvi sends the checkout contact and order information required by Razorpay to
        process the payment. Razorpay handles the payment instrument and payment-processing flow. Truvi stores
        the purchase/order record, customer contact details submitted at checkout, amount/tax/discount
        calculations, provider order/payment identifiers and the resulting payment status. Truvi may separately
        store commission, invoice, subscription and payout records needed for its business and accounting.
      </p>

      <h2>10. Email, SMS, WhatsApp and telephone communications</h2>
      <p>
        Truvi sends essential account messages such as OTPs, password-reset codes, employee invitations,
        transaction updates and support notifications. Email is sent through the SMTP provider configured for
        the application; Resend is an optional provider used by the property-match email workflow when
        explicitly configured. SMS delivery uses Twilio when configured. WhatsApp messages may be sent through
        Meta's WhatsApp Business Cloud API or AiSensy when the respective credentials and approved templates
        are configured. Depending on the event, message fields may include a user's name, phone number, project
        or lead reference, appointment/site-visit time, and the message text or template parameters.
      </p>
      <p>
        For configured new-lead alerts, information supplied about the prospective customer may be sent to
        the lead-alert phone number and/or email configured by Truvi administrators. This can include the
        customer's name, phone number, project, inventory, lead source, requested site-visit date/time and
        notes. It is intended for the authorised Truvi team handling that lead. Do not submit another person's
        contact details unless you have the permission or other lawful authority needed to share them for this
        purpose.
      </p>
      <p>
        Telephony features may use Exotel for masked/bridged calls; call recording depends on the configured
        recording setting. Message and call providers receive the destination contact details and message/call
        metadata/content required to deliver the relevant communication.
      </p>
      <p>
        Optional promotional communication is separate from necessary account, security and transaction
        messages. You can withdraw the optional marketing permission in Privacy & Support Centre. Withdrawing
        promotional permission does not stop essential account or transaction messages.
      </p>

      <h2>11. Cookies, sessions and technical logs</h2>
      <p>
        Truvi uses an in-memory access token and an HTTP-only refresh cookie for signed-in sessions. The cookie
        is used to restore and maintain authentication and is not intended to be available to ordinary page
        scripts. Truvi also processes IP/network information, request metadata, access times, audit events and
        technical diagnostics to protect accounts, enforce rate limits, investigate misuse, troubleshoot
        problems and keep the platform reliable. Your browser may also store limited functional preferences.
      </p>
      <p>
        Map, payment and other embedded third-party features may set or read their own technologies subject
        to their respective provider settings. You can manage browser cookie controls, but disabling essential
        session cookies may prevent sign-in or checkout from working.
      </p>

      <h2>12. Security</h2>
      <p>
        Truvi uses measures including server-side role checks, private file routes for restricted documents,
        encrypted transport where supported, hashed passwords and OTPs, session revocation, rate limits,
        audit events and restricted administrative access. No internet service can guarantee absolute security.
        Please do not share passwords, OTPs, recovery links, payment authentication codes or identity-document
        numbers in support messages.
      </p>

      <h2>13. Retention</h2>
      <p>
        Truvi retains information for the period reasonably needed to provide the feature, maintain the
        account, support property/partner transactions, operate commissions and payouts, resolve grievances,
        prevent fraud, preserve security/audit evidence and meet legal, tax, accounting or regulatory
        requirements. Different categories may have different retention periods. When information no longer
        needs to be retained, Truvi will delete, anonymise or securely dispose of it where technically and
        legally appropriate. Backups, security logs, financial evidence and records linked to other people or
        active transactions may not be removed immediately when an account is deactivated.
      </p>

      <h2>14. Your privacy choices and requests</h2>
      <p>
        Subject to applicable law, you may ask Truvi for access to your personal information, correction of
        inaccurate information, erasure where available, information about relevant processing, or withdrawal
        of an optional consent. You can submit and track these requests in the signed-in <strong>Privacy &
        Support Centre</strong>, or contact <strong>info@truviventures.com</strong>. Truvi may need to verify
        your identity before acting on a request and may ask for clarification.
      </p>

      <h2>15. Account deletion and restoration by email</h2>
      <p>
        You can start account deletion from Privacy & Support Centre. Truvi sends a six-digit OTP to the
        verified email address on the account. The account is deactivated only after the OTP is correctly
        confirmed. Deactivation blocks sign-in and revokes existing sessions.
      </p>
      <p>
        After deactivation, Truvi emails a single-use restoration link to the same verified email address.
        The link expires after 30 days. Opening the link does not restore the account automatically; you must
        confirm the restore action on the recovery page. Successful restoration re-enables the account and
        requires you to sign in again.
      </p>
      <p>
        When the 30-day restoration period ends, the account remains deactivated and the case moves to an
        authorised erasure/retention review. Deactivation is not the same as immediate physical deletion of
        every linked record. Truvi reviews data linked to projects, leads, KYC, employee/payroll, payments,
        taxes, commissions, payouts, fraud/security logs, grievances and other users before final deletion
        or anonymisation. Records that must be retained by law or are needed for an active transaction,
        payment, dispute, fraud investigation or the rights of another person may be retained for the
        applicable period. This is why some records may remain after the account itself is disabled.
      </p>
      <p>
        If you cannot access the email account or the restore link has expired, contact
        <strong> info@truviventures.com</strong> and provide enough information for us to verify your request.
      </p>

      <h2>16. Grievances and privacy support</h2>
      <p>
        You can submit a grievance and track its case number, status and customer-visible response in Privacy
        & Support Centre. You may also write to <strong>info@truviventures.com</strong>. Internal handling notes
        are restricted to authorised administrators and are not displayed as public case responses.
      </p>

      <h2>17. Children</h2>
      <p>
        Truvi is designed for property buyers, businesses and real-estate professionals. It is not intended
        for children under 18. Please do not create an account or submit a child's personal information.
        Contact us if you believe a child has provided information and we will review the situation under
        applicable law.
      </p>

      <h2>18. Changes to this policy</h2>
      <p>
        We may update this policy when features, providers, data uses or legal requirements change. The
        current version and effective date will be shown on this page. Where required, we will seek a fresh
        acknowledgement or consent for a material change.
      </p>

      <h2>19. Contact and grievance submission</h2>
      <p>
        General privacy/support email: <a href="mailto:info@truviventures.com" className="hover:text-foreground">info@truviventures.com</a>.
        You may submit a grievance without signing in through the <Link to="/grievance" className="text-sky-300 underline">public grievance form</Link>.
        The statutory Grievance Officer identity and monitored contact details are shown in the company and grievance disclosures in Section 1, once configured by Truvi management.
      </p>
      <p className="text-xs text-muted-foreground">
        This policy describes the current code-level data flows and should be checked against actual provider
        contracts, deployment regions, retention schedules and legal requirements before publication.
      </p>
    </PolicyShell>
  );
}

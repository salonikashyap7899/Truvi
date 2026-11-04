import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { SiteNav } from "@/components/SiteNav";

const COMPANY = "Truvi Ventures";
const CITY = "Lucknow, Uttar Pradesh, India";
const SUPPORT_EMAIL = "info@truviventures.com";
const publicEnv = import.meta.env as ImportMetaEnv & {
  readonly VITE_LEGAL_ENTITY_NAME?: string;
  readonly VITE_REGISTERED_OFFICE_ADDRESS?: string;
  readonly VITE_COMPANY_CIN?: string;
  readonly VITE_CUSTOMER_CARE_EMAIL?: string;
  readonly VITE_CUSTOMER_CARE_PHONE?: string;
  readonly VITE_GRIEVANCE_OFFICER_NAME?: string;
  readonly VITE_GRIEVANCE_OFFICER_DESIGNATION?: string;
  readonly VITE_GRIEVANCE_OFFICER_EMAIL?: string;
  readonly VITE_GRIEVANCE_OFFICER_PHONE?: string;
};
const LEGAL_ENTITY_NAME = publicEnv.VITE_LEGAL_ENTITY_NAME?.trim() || "";
const REGISTERED_OFFICE_ADDRESS = publicEnv.VITE_REGISTERED_OFFICE_ADDRESS?.trim() || "";
const COMPANY_CIN = publicEnv.VITE_COMPANY_CIN?.trim() || "";
const CUSTOMER_CARE_EMAIL = publicEnv.VITE_CUSTOMER_CARE_EMAIL?.trim() || SUPPORT_EMAIL;
const CUSTOMER_CARE_PHONE = publicEnv.VITE_CUSTOMER_CARE_PHONE?.trim() || "+91 70542 80101";
const GRIEVANCE_OFFICER_NAME = publicEnv.VITE_GRIEVANCE_OFFICER_NAME?.trim() || "";
const GRIEVANCE_OFFICER_DESIGNATION = publicEnv.VITE_GRIEVANCE_OFFICER_DESIGNATION?.trim() || "Grievance Officer";
const GRIEVANCE_OFFICER_EMAIL = publicEnv.VITE_GRIEVANCE_OFFICER_EMAIL?.trim() || CUSTOMER_CARE_EMAIL;
const GRIEVANCE_OFFICER_PHONE = publicEnv.VITE_GRIEVANCE_OFFICER_PHONE?.trim() || CUSTOMER_CARE_PHONE;
const UPDATED = "Last updated: 4 November 2026";

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
          <Link to="/pricing" className="hover:text-foreground">Pricing</Link>
        </div>
        <p className="mt-6 text-xs text-muted-foreground">
          {COMPANY} · {CITY} · <a href={`mailto:${CUSTOMER_CARE_EMAIL}`} className="hover:text-foreground">{CUSTOMER_CARE_EMAIL}</a> · {CUSTOMER_CARE_PHONE}
        </p>
        <section className="mt-8 rounded-2xl border border-white/10 bg-white/[0.025] p-4 text-xs leading-relaxed text-muted-foreground">
          <h2 className="text-sm font-semibold text-foreground">Company, customer-care and grievance disclosures</h2>
          <dl className="mt-3 grid gap-2 sm:grid-cols-2">
            <div><dt className="text-foreground/70">Legal entity</dt><dd>{LEGAL_ENTITY_NAME || "Not configured — confirm the exact name against MCA records before publication."}</dd></div>
            <div><dt className="text-foreground/70">CIN</dt><dd>{COMPANY_CIN || "Not configured — add the CIN only after checking the MCA master data."}</dd></div>
            <div className="sm:col-span-2"><dt className="text-foreground/70">Registered office</dt><dd>{REGISTERED_OFFICE_ADDRESS || "Not configured — add the complete registered-office address from company records."}</dd></div>
            <div><dt className="text-foreground/70">Customer care email</dt><dd><a className="underline underline-offset-2" href={`mailto:${CUSTOMER_CARE_EMAIL}`}>{CUSTOMER_CARE_EMAIL}</a></dd></div>
            <div><dt className="text-foreground/70">Customer care phone</dt><dd><a className="underline underline-offset-2" href={`tel:${CUSTOMER_CARE_PHONE.replace(/[^+\\d]/g, "")}`}>{CUSTOMER_CARE_PHONE}</a></dd></div>
            <div><dt className="text-foreground/70">Grievance Officer</dt><dd>{GRIEVANCE_OFFICER_NAME || "Not configured — a named officer must be designated where the applicable rules require one."}</dd></div>
            <div><dt className="text-foreground/70">Designation</dt><dd>{GRIEVANCE_OFFICER_DESIGNATION}</dd></div>
            <div><dt className="text-foreground/70">Grievance email</dt><dd><a className="underline underline-offset-2" href={`mailto:${GRIEVANCE_OFFICER_EMAIL}`}>{GRIEVANCE_OFFICER_EMAIL}</a></dd></div>
            <div><dt className="text-foreground/70">Grievance phone</dt><dd><a className="underline underline-offset-2" href={`tel:${GRIEVANCE_OFFICER_PHONE.replace(/[^+\\d]/g, "")}`}>{GRIEVANCE_OFFICER_PHONE}</a></dd></div>
          </dl>
          <p className="mt-3">Signed-in users may submit and track a grievance in Privacy &amp; Support Centre. Anyone may contact the grievance channel by email or phone. Truvi's service target is to acknowledge a complaint within 48 hours and resolve it within one month; where a different statutory deadline applies, that law controls.</p>
          {(!LEGAL_ENTITY_NAME || !REGISTERED_OFFICE_ADDRESS || !COMPANY_CIN || !GRIEVANCE_OFFICER_NAME) && (
            <p className="mt-3 rounded-lg border border-amber-400/25 bg-amber-400/5 p-3 text-amber-200">Publication setup incomplete: company identity, registered-office/CIN and named Grievance Officer fields must be completed and checked before Truvi claims compliance with any applicable e-commerce or company-disclosure requirement.</p>
          )}
        </section>
      </main>
    </div>
  );
}

export function TermsPage() {
  return (
    <PolicyShell title="Terms of Service">
      <p>By using {COMPANY} ("Truvi", "we", "us") at truviventures.com and paying for any service, you agree to these terms.</p>
      <h2>1. Services</h2>
      <p>Truvi provides real-estate intelligence, verification, listing and related services to buyers, channel partners and developers. Features and prices are described on our Pricing page and may change with notice.</p>
      <h2>2. Payments</h2>
      <p>Paid services are billed in Indian Rupees and payment instruments are processed by Razorpay. Any GST or other tax that is lawfully chargeable is calculated using the applicable tax treatment and shown before you confirm payment. The correct rate and invoice treatment depend on the service supplied, place of supply, Truvi's GST registration and applicable law; contact {SUPPORT_EMAIL} for billing questions. Do not infer a GST registration or a universal tax rate from a pricing label.</p>
      <h2>3. Acceptable use</h2>
      <p>You agree not to misuse the platform, resell data without authorisation, or use it for any unlawful purpose.</p>
      <h2>4. Limitation of liability</h2>
      <p>Truvi's intelligence and verification outputs are provided in good faith to assist your decisions but do not constitute legal, financial or investment advice. No term in these Terms removes a statutory consumer right or limits liability to the extent that Indian law does not permit that exclusion or limitation.</p>
      <h2>5. Property listings, project approvals and transaction roles</h2>
      <p>Truvi provides property-information, discovery, listing, verification-support, lead-coordination and related services. Truvi's legal capacity may differ by project or transaction. The relevant project page and transaction documents must identify the promoter/seller or service provider and describe Truvi's role for that transaction. A listing, field observation, badge, uploaded document, AI response or status label is not a title certificate, government endorsement, RERA certificate or guarantee of returns.</p>
      <p>Before paying or booking, users should independently verify the promoter, land title, encumbrances, land use, project permissions, applicable RERA registration and phase, any claimed exemption, and the written sale/booking agreement with the competent authority and qualified advisers. Where RERA applies, only appropriately registered projects and agents may be advertised or facilitated as required by law. A missing RERA number by itself is not a determination that a project is unlawful; the applicable registration requirement or documented statutory exemption must be checked for that project.</p>
      <h2>6. Contact</h2>
      <p>Questions about these terms: <strong>{SUPPORT_EMAIL}</strong>.</p>
    </PolicyShell>
  );
}

export function RefundPolicyPage() {
  return (
    <PolicyShell title="Refund &amp; Cancellation Policy">
      <p>This policy explains refunds and cancellations for services purchased on truviventures.com.</p>
      <h2>1. Digital services and service failures</h2>
      <p>Where a digital report, verification or other deliverable has been correctly supplied as described, a change-of-mind request after delivery may not qualify for a refund where that restriction was disclosed before purchase and is permitted by law. This does not remove statutory remedies for a deficient, missing, misrepresented or undelivered service, an unauthorised charge, or any other right that cannot lawfully be excluded.</p>
      <h2>2. Failed, duplicate or incorrect payments</h2>
      <p>If a payment was debited but the service was not activated or delivered, a duplicate charge occurred, or the amount charged differs from the confirmed checkout, contact customer care promptly. Truvi will investigate the payment-provider record and communicate the decision and next steps. Do not send card numbers, CVV, OTPs or banking passwords.</p>
      <h2>3. Subscription and renewal cancellation</h2>
      <p>Where a recurring subscription is offered, the purchase/activation confirmation must identify the cancellation channel and renewal terms. You may request cancellation through the channel shown in that confirmation or by emailing customer care before the next renewal. Truvi will confirm the effective date and whether any future renewal remains scheduled. No cancellation fee will be imposed unless it is lawful and any required reciprocal treatment is provided. Refunds for an already-started billing period are assessed under the disclosed plan terms and applicable consumer law; this policy does not waive statutory rights.</p>
      <h2>4. How to request a refund or cancellation</h2>
      <p>Email <strong>{SUPPORT_EMAIL}</strong> with your name, order/payment reference and a short explanation, or use the signed-in Privacy &amp; Support Centre for a grievance. Never include payment authentication secrets. Where a refund is approved, Truvi will initiate it to the original payment method through the payment provider; the provider/bank settlement time may vary, and the case update will state the initiation date and reference where available.</p>
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
      category: "Identity and KYC documents",
      data: "A masked Aadhaar or other accepted identity document, PAN details/documents where required for a role, selfie image, document type, masked identifiers and verification/review status.",
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
    <PolicyShell title="Privacy Policy" updated="Last Updated: 4 November 2026 · Effective Date: 4 November 2026">
      <p>
        TRUVI Ventures ("TRUVI", "we", "us", or "our") explains here what personal information we collect,
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
        {COMPANY} ("Truvi", "we", "us" or "our"), based in {CITY}, operates the Truvi real-estate
        platform and related services. The support contact for privacy questions and grievances is
        <strong> {SUPPORT_EMAIL}</strong>. The website is <strong> truviventures.com</strong>.
      </p>

      <h2>2. Information we collect</h2>
      <p>Depending on your role and the features you use, we may collect:</p>
      <L items={[
        "Account details: name, email, phone number, password hash, role, email/phone verification state, login and account settings.",
        "Profile and business details: profile image, bio, company/developer details, partner/referral information and role permissions.",
        "Employee/workforce details (for Employee accounts and staff records): work contact details, department/designation, employment and recruitment dates, attendance/check-in/check-out, leave requests, tasks, work activity, salary/payroll and manager notes.",
        "Property and project details: project name, description, locality/address, map coordinates, pricing, inventory, brochures, images, legal/approval documents and listing information.",
        "Buyer, enquiry and lead details: property preferences, budget, area, purchase purpose, timeline, contact details supplied by the buyer or by a lead submitter with the relevant client's permission, CRM notes, follow-ups and site visits.",
        "Identity/KYC information, where required: a masked Aadhaar or other accepted identity document, PAN details/document for applicable roles, a selfie image, masked identifiers and verification/review status.",
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
        Channel Partner and Ambassador onboarding may request a masked Aadhaar or another identity document
        accepted by Truvi's compliance process, PAN for applicable roles, and a selfie. Do not enter a full
        Aadhaar number or upload an unmasked Aadhaar image, Aadhaar OTP, biometric information or a document
        exposing more identity data than the verification purpose requires. Mask the first eight Aadhaar digits
        before uploading. Contact customer care for an alternative-document route if you cannot provide a
        properly masked document. The current application routes documents for manual administrator review;
        it does not perform UIDAI authentication, government-database identity checks, or automated selfie
        liveness/face matching. An uploaded document or administrator review is not a UIDAI verification.
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
        Signed-in users may submit a grievance and track its case number, status and customer-visible response
        in Privacy &amp; Support Centre. Users without an account may contact the Grievance Officer by email
        or phone using the details published below. Truvi aims to acknowledge consumer complaints within
        48 hours and redress them within one month. If a different statutory period applies, that period controls.
        Internal handling notes are restricted to authorised administrators and are not disclosed as public
        case responses. Please include enough information to identify the issue, but do not send passwords,
        OTPs, full Aadhaar numbers or payment authentication data.

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

      <h2>19. Contact</h2>
      <p>
        <strong>{COMPANY}</strong><br />
        Website: www.truviventures.com<br />
        Legal entity: {LEGAL_ENTITY_NAME || "Not yet configured — confirm against MCA records."}<br />
        Registered office: {REGISTERED_OFFICE_ADDRESS || "Not yet configured — add the complete address from company records."}<br />
        CIN: {COMPANY_CIN || "Not yet configured — add the verified CIN."}<br />
        Customer care: <a href={`mailto:${CUSTOMER_CARE_EMAIL}`} className="hover:text-foreground">{CUSTOMER_CARE_EMAIL}</a> · {CUSTOMER_CARE_PHONE}<br />
        Grievance Officer: {GRIEVANCE_OFFICER_NAME || "Not yet designated"} ({GRIEVANCE_OFFICER_DESIGNATION})<br />
        Grievance contact: <a href={`mailto:${GRIEVANCE_OFFICER_EMAIL}`} className="hover:text-foreground">{GRIEVANCE_OFFICER_EMAIL}</a> · {GRIEVANCE_OFFICER_PHONE}
      </p>
      <p className="text-xs text-muted-foreground">
        This policy must be checked against the exact legal entity, provider contracts, deployment/data regions,
        retention schedule and actual operations. Fields marked not configured are launch blockers where
        applicable law requires those particulars to be published.
      </p>
    </PolicyShell>
  );
}

import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { SiteNav } from "@/components/SiteNav";

const COMPANY = "Truvi Ventures (Truston Developers Pvt. Ltd.)";
const CITY = "Lucknow, Uttar Pradesh, India";
const SUPPORT_EMAIL = "info@truviventures.com";
const UPDATED = "Last updated: August 2026";

function PolicyShell({ title, children, updated }: { title: string; children: ReactNode; updated?: string }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteNav />
      <main className="mx-auto max-w-3xl px-4 pt-28 pb-20 sm:px-6">
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
          {COMPANY} · {CITY} · <a href={`mailto:${SUPPORT_EMAIL}`} className="hover:text-foreground">{SUPPORT_EMAIL}</a>
        </p>
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
      <p>Paid services are billed in Indian Rupees and processed securely by Razorpay. All prices are exclusive of 18% GST unless stated otherwise. You are responsible for providing accurate contact and payment details.</p>
      <h2>3. Acceptable use</h2>
      <p>You agree not to misuse the platform, resell data without authorisation, or use it for any unlawful purpose.</p>
      <h2>4. Limitation of liability</h2>
      <p>Truvi's intelligence and verification outputs are provided in good faith to assist your decisions but do not constitute legal, financial or investment advice. To the extent permitted by law, our liability for any claim is limited to the amount you paid for the specific service.</p>
      <h2>5. Contact</h2>
      <p>Questions about these terms: <strong>{SUPPORT_EMAIL}</strong>.</p>
    </PolicyShell>
  );
}

export function RefundPolicyPage() {
  return (
    <PolicyShell title="Refund &amp; Cancellation Policy">
      <p>This policy explains refunds and cancellations for services purchased on truviventures.com.</p>
      <h2>1. Digital services</h2>
      <p>Reports, verifications, badges and other digital deliverables are generated on demand. Once a report or verification has been delivered, the fee is generally non-refundable.</p>
      <h2>2. Failed or duplicate payments</h2>
      <p>If you were charged but did not receive the service, or were charged more than once for the same order, contact us within 7 days for a full refund of the affected amount.</p>
      <h2>3. Subscriptions</h2>
      <p>Subscriptions (Pro plans) can be cancelled any time and will not renew for the next cycle. Amounts already paid for the current cycle are non-refundable.</p>
      <h2>4. How to request</h2>
      <p>Email <strong>{SUPPORT_EMAIL}</strong> with your payment ID. Approved refunds are returned to the original payment method within 5–7 business days via Razorpay.</p>
    </PolicyShell>
  );
}

export function PrivacyPolicyPage() {
  const L = ({ items }: { items: string[] }) => (
    <ul className="ml-1 list-disc space-y-1 pl-5">{items.map((t, i) => <li key={i}>{t}</li>)}</ul>
  );
  return (
    <PolicyShell title="Privacy Policy" updated="Last Updated: 2 September 2026 · Effective Date: 2 September 2026">
      <p>
        TRUVI Ventures ("TRUVI", "we", "us", or "our") respects your privacy and is committed to protecting the
        personal information you share with us. This Privacy Policy explains how TRUVI collects, uses, stores, processes,
        and protects information when you visit our website, use our platform, submit an enquiry or lead form, register
        as a real estate developer or channel partner, communicate with us, or use our services.
      </p>
      <p>By accessing or using our website, platform, or services, you acknowledge that you have read and understood this Privacy Policy.</p>

      <h2>1. About TRUVI</h2>
      <p>TRUVI is a real-estate growth platform and business support service designed to help real estate developers and industry professionals with solutions including:</p>
      <L items={["Digital Marketing", "Lead Generation", "Sales Support", "Channel Partner Network", "Project Visibility", "Property & Inventory Support", "Business/Market Insights", "AI-powered insights and assistance", "Real Estate Growth Solutions"]} />
      <p>TRUVI may also facilitate communication between developers, channel partners, prospective customers and other real-estate ecosystem participants.</p>

      <h2>2. Information We Collect</h2>
      <p>Depending on how you interact with TRUVI, we may collect the following information.</p>
      <p><strong>A. Information You Provide</strong> — when you submit a form, register, contact us, or request our services, we may collect:</p>
      <L items={["Full name", "Mobile/telephone number", "Email address", "Company/developer name", "Business information", "Project details", "Project location", "Number of projects", "Real-estate business requirements", "Channel partner/business information", "Information you voluntarily provide in messages or enquiries"]} />
      <p><strong>B. Automatically Collected Information</strong> — when you visit our website, certain technical information may be collected automatically, including:</p>
      <L items={["IP address", "Browser type", "Device type", "Operating system", "Pages visited", "Date and time of access", "Referring website", "General website usage information", "Cookies and similar technologies"]} />
      <p><strong>C. Information from Marketing Platforms</strong> — if you interact with TRUVI through advertising platforms such as Meta/Facebook/Instagram, Google, LinkedIn or other marketing platforms, we may receive information that you choose to submit through those platforms. For example, if you submit a TRUVI lead form, we may receive the information you provide in that form.</p>

      <h2>3. How We Use Your Information</h2>
      <p>We may use the information collected to:</p>
      <L items={["Respond to your enquiries", "Contact you regarding TRUVI services", "Provide requested services", "Evaluate business requirements", "Onboard developers and channel partners", "Generate and manage leads", "Provide marketing and sales support", "Improve project visibility", "Provide relevant real-estate information", "Provide AI-powered insights and assistance", "Improve our website, platform and services", "Understand user behaviour and website performance", "Communicate service updates", "Send relevant business/marketing communications where permitted", "Prevent fraud, misuse or unauthorized activity", "Maintain security", "Comply with applicable laws and regulations"]} />

      <h2>4. Lead Generation and Enquiries</h2>
      <p>If you submit your information through a TRUVI website form, Meta Lead Form, Google form, social-media form, advertisement or any other enquiry channel, we may use the information to contact you regarding your enquiry. By submitting your information, you acknowledge that TRUVI and its authorized representatives may contact you through appropriate communication channels, including Phone, SMS, WhatsApp, Email, or other business communication channels.</p>
      <p>You may request that we stop sending marketing communications at any time, subject to applicable legal requirements.</p>

      <h2>5. Real Estate Developer Information</h2>
      <p>If you register or provide information as a real estate developer, builder, project owner or authorized representative, TRUVI may collect and process information relating to:</p>
      <L items={["Developer/company details", "Project details", "Project location", "Property/inventory information", "Business contact details", "Project documentation provided for verification", "Marketing requirements", "Sales requirements", "Channel partner requirements"]} />
      <p>Such information may be used to evaluate, verify, market, manage or provide services relating to the relevant real-estate project.</p>

      <h2>6. Project Verification and Documents</h2>
      <p>Where applicable, TRUVI may request or process documents and information relating to a real-estate project for verification, due diligence, listing, compliance assessment or related business purposes. Such information may include, where applicable: RERA-related information, project approvals, title/property documents, developer/company information, project status, construction-related information, and other documents voluntarily provided by the developer.</p>
      <p>TRUVI will use such information for legitimate business purposes related to its platform and services. Submission of documents does not automatically mean that TRUVI guarantees the legal validity, title, quality, financial performance, profitability, or future performance of a project unless expressly stated otherwise.</p>

      <h2>7. AI-Powered Services</h2>
      <p>TRUVI may use artificial intelligence and automated technologies to provide features such as business insights, market insights, lead analysis, project analysis, recommendations, marketing assistance, sales insights and automated support. Information processed through AI-powered features may be used to generate relevant insights and recommendations. TRUVI will take reasonable measures to protect information processed through such systems and will use information in accordance with this Privacy Policy and applicable law.</p>

      <h2>8. Cookies and Tracking Technologies</h2>
      <p>TRUVI may use cookies, pixels, analytics tools and similar technologies to improve website functionality, understand website usage, measure advertising performance, analyze traffic, improve user experience, and support marketing and remarketing activities. You may be able to control cookies through your browser settings. Disabling certain cookies may affect some website functionality.</p>

      <h2>9. Advertising and Analytics</h2>
      <p>TRUVI may use third-party advertising and analytics platforms, including platforms such as Meta, Facebook, Instagram, Google, LinkedIn or other analytics or advertising providers. These platforms may use cookies, pixels or similar technologies according to their own privacy policies. TRUVI may use information received through these platforms to measure campaign performance, understand enquiries and improve marketing activities.</p>

      <h2>10. Sharing of Information</h2>
      <p>TRUVI does not sell your personal information as a standalone product. We may share information with authorized third parties where reasonably necessary to operate our business and provide services, including service providers, technology providers, CRM providers, marketing and advertising platforms, communication providers, analytics providers, authorized TRUVI team members, professional advisors, business partners where necessary to provide requested services, and government authorities or regulators where legally required. Third parties receiving information may be subject to contractual, legal or organizational obligations regarding the handling of such information.</p>

      <h2>11. Data Security</h2>
      <p>TRUVI takes reasonable technical and organizational measures to protect personal information against unauthorized access, misuse, alteration, disclosure or destruction. However, no internet transmission or electronic storage system can be guaranteed to be completely secure. Therefore, while we take reasonable precautions, we cannot guarantee absolute security of information transmitted to or stored by us.</p>

      <h2>12. Data Retention</h2>
      <p>We retain personal information only for as long as reasonably necessary for the purposes described in this Privacy Policy, including providing services, managing business relationships, maintaining records, resolving disputes, preventing fraud, complying with legal obligations and protecting legitimate business interests. When information is no longer reasonably required, we may delete, anonymize or securely dispose of it, subject to applicable legal and operational requirements.</p>

      <h2>13. Your Rights and Choices</h2>
      <p>Subject to applicable law, you may have rights regarding your personal information, including the ability to request access to certain personal information, request correction of inaccurate information, request deletion where legally applicable, withdraw consent where processing is based on consent, request information about how your data is processed, and opt out of certain marketing communications. To exercise applicable rights, you can contact us using the details provided below.</p>

      <h2>14. Marketing Communications</h2>
      <p>If you provide your contact information to TRUVI, we may contact you regarding TRUVI services, real-estate opportunities, developer services, channel partner opportunities, product updates, business solutions and marketing-related communications. You can request to stop receiving promotional communications by contacting us. Please note that you may still receive essential service-related communications where necessary.</p>

      <h2>15. Third-Party Websites</h2>
      <p>Our website or communications may contain links to third-party websites, platforms or services. TRUVI is not responsible for the privacy practices, security or content of third-party websites. We recommend reviewing the privacy policies of third-party websites before providing them with personal information.</p>

      <h2>16. Children's Privacy</h2>
      <p>TRUVI's services are intended for businesses, real-estate professionals and general users capable of legally using such services. We do not knowingly collect personal information from children where prohibited by applicable law. If you believe that a child has provided personal information to us, please contact us so that we can take appropriate action.</p>

      <h2>17. Changes to This Privacy Policy</h2>
      <p>TRUVI may update this Privacy Policy from time to time to reflect changes in our services, technology, legal or regulatory requirements, or our privacy practices. The updated version will be published on this page with a revised "Last Updated" date.</p>

      <h2>18. Consent</h2>
      <p>By using our website, submitting an enquiry, registering with TRUVI, or providing personal information to us, you acknowledge that you have read and understood this Privacy Policy. Where consent is required under applicable law, TRUVI will seek appropriate consent before processing personal information for the relevant purpose.</p>

      <h2>19. Contact Us</h2>
      <p>If you have questions, concerns, requests or complaints regarding this Privacy Policy or the processing of your personal information, please contact us:</p>
      <p>
        <strong>TRUVI Ventures</strong><br />
        Website: www.truviventures.com<br />
        Email: <a href="mailto:info@truviventures.com" className="hover:text-foreground">info@truviventures.com</a><br />
        Phone: +91 96366 33588
      </p>

      <h2>20. Grievance / Privacy Requests</h2>
      <p>For privacy-related requests, corrections, deletion requests or concerns regarding your personal information, please contact: <strong>info@truviventures.com</strong>. Please include sufficient information to help us understand and respond to your request.</p>
    </PolicyShell>
  );
}

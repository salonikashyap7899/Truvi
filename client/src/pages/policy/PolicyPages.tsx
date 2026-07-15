import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { SiteNav } from "@/components/SiteNav";

const COMPANY = "Truvi Ventures (Truston Developers Pvt. Ltd.)";
const CITY = "Lucknow, Uttar Pradesh, India";
const SUPPORT_EMAIL = "info@truviventures.com";
const UPDATED = "These are placeholder policies — replace with your finalised legal copy before going live.";

function PolicyShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteNav />
      <main className="mx-auto max-w-3xl px-4 pt-28 pb-20 sm:px-6">
        <h1 className="font-display text-3xl font-semibold sm:text-4xl">{title}</h1>
        <p className="mt-2 text-xs text-amber-300/80">{UPDATED}</p>
        <div className="prose-invert mt-6 space-y-5 text-sm leading-relaxed text-muted-foreground [&_h2]:mt-8 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-foreground [&_strong]:text-foreground">
          {children}
        </div>

        <div className="mt-12 flex flex-wrap gap-x-5 gap-y-2 border-t border-white/10 pt-6 text-xs text-muted-foreground">
          <Link to="/terms" className="hover:text-foreground">Terms of Service</Link>
          <Link to="/refund-policy" className="hover:text-foreground">Refund &amp; Cancellation</Link>
          <Link to="/privacy" className="hover:text-foreground">Privacy Policy</Link>
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
  return (
    <PolicyShell title="Privacy Policy">
      <p>{COMPANY} respects your privacy. This policy explains what we collect and why.</p>
      <h2>1. What we collect</h2>
      <p>Contact details you provide (name, email, phone), the services you purchase, and payment metadata (order and payment IDs). Card and bank details are handled directly by Razorpay — we never see or store them.</p>
      <h2>2. How we use it</h2>
      <p>To deliver the services you buy, send confirmations and receipts, provide support, and comply with legal and tax obligations.</p>
      <h2>3. Sharing</h2>
      <p>We share the minimum necessary with our payment processor (Razorpay) and service providers who help us operate the platform. We do not sell your personal data.</p>
      <h2>4. Your rights</h2>
      <p>You may request access to, correction of, or deletion of your personal data by emailing <strong>{SUPPORT_EMAIL}</strong>.</p>
    </PolicyShell>
  );
}

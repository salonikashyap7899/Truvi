import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { SiteNav } from "@/components/SiteNav";

const COMPANY = "Truvi Ventures (Truston Developers Pvt. Ltd.)";
const CITY = "Lucknow, Uttar Pradesh, India";
const SUPPORT_EMAIL = "info@truviventures.com";
const UPDATED = "Last updated: August 2026";

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
      <p>{COMPANY} ("Truvi", "we", "us") respects your privacy. This policy explains what we collect, why, and your choices — and applies to our website (truviventures.com) and our Truvi mobile app.</p>

      <h2>1. Information we collect</h2>
      <p><strong>Account &amp; contact details</strong> you provide — name, email, phone, city, and your role (buyer, channel partner, ambassador, developer).</p>
      <p><strong>Identity verification (KYC)</strong> — for Channel Partners and Ambassadors, we collect your Aadhaar number and document, PAN (for Channel Partners), and a <strong>live selfie captured using your device camera</strong>. These are used solely to verify your identity and are stored securely; they are never sold or used for advertising.</p>
      <p><strong>Camera</strong> — the app uses your camera only when you actively take the live selfie during identity verification. It is not used at any other time and no images are captured without your action.</p>
      <p><strong>Location</strong> — for on-site verification tasks, an ambassador may share their device location to confirm they are physically at the project site. Location is used only for that task and only when you grant permission.</p>
      <p><strong>Payments</strong> — order and payment IDs for services and investments. Card, UPI and bank details are handled directly by our payment processor, <strong>Razorpay</strong> — we never see or store them.</p>
      <p><strong>Referrals</strong> — if you join through someone&apos;s referral code, we record that link to attribute referral commissions.</p>
      <p><strong>Usage &amp; device data</strong> — basic technical logs needed to operate, secure and improve the service.</p>

      <h2>2. How we use it</h2>
      <p>To create and secure your account, verify identity where required, deliver the services and investments you request, process payments and payouts, attribute referrals, provide support, and comply with legal, tax and regulatory obligations.</p>

      <h2>3. Sharing</h2>
      <p>We share the minimum necessary with our payment processor (Razorpay) and service providers who help us operate the platform, and with authorities where required by law. We do <strong>not</strong> sell your personal data or use your identity documents or camera images for advertising.</p>

      <h2>4. Data retention</h2>
      <p>We keep personal and KYC data for as long as your account is active and as required by law, then delete or anonymise it. Identity documents are retained only as long as needed for verification and legal compliance.</p>

      <h2>5. Your rights &amp; data deletion</h2>
      <p>You may request access to, correction of, or <strong>deletion</strong> of your personal data — including your account and KYC documents — by emailing <strong>{SUPPORT_EMAIL}</strong>. We will action verified requests within a reasonable period, subject to legal retention requirements.</p>

      <h2>6. Children</h2>
      <p>The platform is intended for users aged 18 and over and is not directed at children.</p>

      <h2>7. Contact</h2>
      <p>Questions or requests: <strong>{SUPPORT_EMAIL}</strong> · {COMPANY}, {CITY}.</p>
    </PolicyShell>
  );
}

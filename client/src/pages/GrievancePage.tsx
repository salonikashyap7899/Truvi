import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { SiteNav } from "@/components/SiteNav";
import { api } from "@/lib/api";
import { POLICY_VERSIONS } from "@/lib/compliance";

const categories = [
  ["PRIVACY", "Privacy or personal data"],
  ["ACCOUNT", "Account or access"],
  ["PAYMENT", "Payment, invoice or subscription"],
  ["PROJECT_LISTING", "Property or project listing"],
  ["KYC", "Identity or KYC"],
  ["TECHNICAL", "Website or technical issue"],
  ["OTHER", "Other complaint"],
] as const;

type Receipt = { caseNumber: string; acknowledgementEmailSent: boolean };

export default function GrievancePage() {
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    category: "OTHER",
    subject: "",
    description: "",
    website: "",
  });
  const [privacyNoticeAcknowledged, setPrivacyNoticeAcknowledged] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function update(name: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const response = await api.post("/compliance/public-grievances", {
        ...form,
        privacyNoticeAcknowledged,
        privacyNoticeVersion: POLICY_VERSIONS.PRIVACY_NOTICE,
      });
      setReceipt({
        caseNumber: response.data.ticket.caseNumber,
        acknowledgementEmailSent: Boolean(response.data.acknowledgementEmailSent),
      });
      setForm({ name: "", email: "", phone: "", category: "OTHER", subject: "", description: "", website: "" });
      setPrivacyNoticeAcknowledged(false);
    } catch (err: any) {
      setError(err?.response?.data?.error || "We could not submit your complaint. Please try again or email info@truviventures.com.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <SiteNav />
      <div className="mx-auto max-w-2xl px-4 pb-20 pt-32 sm:px-6">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-300">Customer support</p>
        <h1 className="mt-3 font-display text-3xl font-semibold sm:text-4xl">File a grievance</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          You can submit a complaint without creating a Truvi account. We will create a case number and email you an acknowledgement with a copy of your complaint.
        </p>

        {receipt ? (
          <section className="mt-8 rounded-2xl border border-emerald-400/25 bg-emerald-400/5 p-6" role="status">
            <h2 className="text-lg font-semibold text-emerald-300">Your complaint has been recorded</h2>
            <p className="mt-3 text-sm text-muted-foreground">Your case number is:</p>
            <p className="mt-1 break-all font-mono text-xl font-semibold">{receipt.caseNumber}</p>
            <p className="mt-3 text-sm text-muted-foreground">
              {receipt.acknowledgementEmailSent
                ? "An acknowledgement with your case number and a copy of your complaint was sent to your email."
                : "The case is recorded, but the email receipt could not be delivered. Please save your case number and contact info@truviventures.com if needed."}
            </p>
            <button type="button" onClick={() => setReceipt(null)} className="mt-5 rounded-xl bg-sky-500 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-400">Submit another complaint</button>
          </section>
        ) : (
          <form onSubmit={submit} className="mt-8 space-y-4 rounded-2xl border border-white/10 bg-white/[0.025] p-5 sm:p-7">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="mb-1.5 block text-foreground/80">Full name *</span>
                <input required minLength={2} maxLength={120} autoComplete="name" value={form.name} onChange={(e) => update("name", e.target.value)} className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 outline-none focus:border-sky-400/60" />
              </label>
              <label className="block text-sm">
                <span className="mb-1.5 block text-foreground/80">Email address *</span>
                <input required type="email" maxLength={254} autoComplete="email" value={form.email} onChange={(e) => update("email", e.target.value)} className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 outline-none focus:border-sky-400/60" />
              </label>
            </div>
            <label className="block text-sm">
              <span className="mb-1.5 block text-foreground/80">Phone number (optional)</span>
              <input type="tel" maxLength={25} autoComplete="tel" value={form.phone} onChange={(e) => update("phone", e.target.value)} className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 outline-none focus:border-sky-400/60" />
            </label>
            <label className="block text-sm">
              <span className="mb-1.5 block text-foreground/80">Complaint category *</span>
              <select value={form.category} onChange={(e) => update("category", e.target.value)} className="w-full rounded-xl border border-white/10 bg-[#111827] px-3 py-2.5 outline-none focus:border-sky-400/60">
                {categories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1.5 block text-foreground/80">Subject *</span>
              <input required minLength={5} maxLength={160} value={form.subject} onChange={(e) => update("subject", e.target.value)} className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 outline-none focus:border-sky-400/60" />
            </label>
            <label className="block text-sm">
              <span className="mb-1.5 block text-foreground/80">Complaint details *</span>
              <textarea required minLength={15} maxLength={5000} rows={6} value={form.description} onChange={(e) => update("description", e.target.value)} className="w-full resize-y rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 outline-none focus:border-sky-400/60" />
            </label>
            <label aria-hidden="true" className="absolute -left-[10000px] top-auto h-px w-px overflow-hidden">
              Website
              <input tabIndex={-1} autoComplete="off" value={form.website} onChange={(e) => update("website", e.target.value)} />
            </label>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Please do not include passwords, OTPs, full Aadhaar/PAN numbers or bank credentials. Read our <Link to="/privacy-policy" className="text-sky-300 underline">Privacy Policy</Link> to understand how complaint information is handled.
            </p>
            <label className="flex items-start gap-2.5 text-xs leading-relaxed text-foreground/80">
              <input required type="checkbox" checked={privacyNoticeAcknowledged} onChange={(event) => setPrivacyNoticeAcknowledged(event.target.checked)} className="mt-0.5 size-4 shrink-0 accent-sky-400" />
              <span>I have read the Privacy Policy and acknowledge that Truvi will use these details to receive, investigate and respond to this complaint. *</span>
            </label>
            {error && <p role="alert" className="rounded-lg border border-red-400/20 bg-red-400/5 p-3 text-sm text-red-300">{error}</p>}
            <button type="submit" disabled={submitting} className="w-full rounded-xl bg-sky-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-50">
              {submitting ? "Submitting complaint…" : "Submit grievance"}
            </button>
            <p className="text-center text-xs text-muted-foreground">You may also write to <a className="text-sky-300 underline" href="mailto:info@truviventures.com">info@truviventures.com</a>.</p>
          </form>
        )}
      </div>
    </main>
  );
}

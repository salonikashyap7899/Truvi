import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { roleLabel } from "@/lib/rolePaths";
import { formatDate, formatINR } from "@/lib/utils";
import {
  ArrowLeft, Loader2, ExternalLink, BadgeCheck, Clock, ShieldX, ShieldQuestion,
  Truck, Handshake, Users, Wallet, FileText, Mail, Phone, Calendar, LogIn, IdCard,
} from "lucide-react";

// ---- Shape of the admin-only detailed profile (GET /admin/users/:id/profile) --
interface ProfileDoc {
  category: string;
  kind: "KYC" | "BUYER" | "LEGAL" | "ASSET";
  fileName?: string | null;
  fileUrl?: string | null;
  streamUrl?: string | null;
  mime?: string | null;
  project?: string | null;
  status?: string | null;
  createdAt?: string | null;
}
interface HistoryEntry {
  _id: string;
  action: string;
  metadata?: Record<string, unknown> | null;
  actorName?: string | null;
  createdAt: string;
}
interface DetailedProfile {
  _id: string;
  name: string;
  email: string;
  role: string;
  phone?: string | null;
  avatarUrl?: string | null;
  bio?: string | null;
  disabled?: boolean;
  approvalStatus?: string;
  emailVerified?: boolean;
  phoneVerified?: boolean;
  onboardingVerified?: boolean;
  onboardingChecks?: {
    aadhaarVerified?: boolean;
    phoneVerified?: boolean;
    emailVerified?: boolean;
    panVerified?: boolean;
    kycStatus?: "PENDING" | "APPROVED" | "REJECTED";
    kycRejectionReason?: string | null;
  } | null;
  cpTier?: string | null;
  cpProfile?: { isPremium: boolean; premiumExpiresAt?: string | null; conversionRatio: number; totalBookings: number } | null;
  developerProfile?: { companyName?: string; reraNumber?: string } | null;
  referralCode?: string | null;
  createdAt?: string;
  lastLoginAt?: string | null;
  kycStatus: "VERIFIED" | "PENDING" | "REJECTED" | "NONE";
  verification: {
    panNumberMasked: string | null;
    kycSubmittedAt: string | null;
    hasAadhaar: boolean;
    hasPan: boolean;
    hasSelfie: boolean;
  };
  documents: ProfileDoc[];
  stats: {
    deliveries: { completed: number; accepted: number; earnings: number };
    bookings: { total: number; gmv: number; commissionEarned: number };
    leads: { submitted: number; assigned: number };
    siteVisits: { total: number; completed: number };
    referrals: {
      registered: number; successful: number; enrolled: number; enrolledActive: number;
      transactions: number; salesValue: number; earnings: number;
    };
    transactions: {
      paymentsCount: number; paymentsTotal: number; subscriptions: number;
      activeSubscriptions: number; leadPurchases: number; leadSpend: number;
    };
  };
  referredList: { _id: string; name: string; email: string; role: string; createdAt: string; activated: boolean }[];
  enrolledReferralList: { _id: string; developerName: string; companyName?: string | null; city?: string | null; status: string; createdAt: string }[];
  history: HistoryEntry[];
}

function KycBadge({ status }: { status: DetailedProfile["kycStatus"] }) {
  if (status === "VERIFIED") return <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-300"><BadgeCheck size={13} /> Verified</span>;
  if (status === "PENDING") return <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-3 py-1 text-xs font-semibold text-amber-300"><Clock size={13} /> Pending</span>;
  if (status === "REJECTED") return <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/15 px-3 py-1 text-xs font-semibold text-rose-300"><ShieldX size={13} /> Rejected</span>;
  return <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-muted-foreground"><ShieldQuestion size={13} /> Not required</span>;
}

export default function AdminUserProfilePage() {
  const { id } = useParams<{ id: string }>();
  const [profile, setProfile] = useState<DetailedProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get(`/admin/users/${id}/profile`);
        if (!cancelled) setProfile(res.data.profile);
      } catch (err: any) {
        if (!cancelled) toast.error(err?.response?.data?.error || "Failed to load profile");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  if (loading) {
    return (
      <main className="grid min-h-screen place-items-center text-white">
        <Loader2 className="animate-spin text-muted-foreground" />
      </main>
    );
  }
  if (!profile) {
    return (
      <main className="min-h-screen p-6 text-white md:p-10">
        <Link to="/admin/users" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-white">
          <ArrowLeft size={15} /> Back to users
        </Link>
        <p className="mt-10 text-sm text-muted-foreground">This user could not be found.</p>
      </main>
    );
  }

  const p = profile;
  const s = p.stats;
  const showDeliveries = p.role === "AMBASSADOR" || s.deliveries.accepted > 0;
  const showReferrals = ["CP", "AMBASSADOR", "DEVELOPER"].includes(p.role) || s.referrals.registered > 0 || s.referrals.enrolled > 0;

  return (
    <main className="min-h-screen p-6 text-white md:p-10">
      <Link to="/admin/users" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-white">
        <ArrowLeft size={15} /> Back to users
      </Link>

      {/* Identity header */}
      <section className="mt-4 rounded-2xl border border-white/10 glass p-5 md:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            {p.avatarUrl ? (
              <img src={p.avatarUrl} alt={p.name} className="size-16 shrink-0 rounded-full object-cover" />
            ) : (
              <div className="grid size-16 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[var(--trust,#3b82f6)] to-[#2563eb] text-2xl font-bold text-white">
                {(p.name || p.email || "?").trim().charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-2xl font-semibold">{p.name}</h1>
                <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-medium">{roleLabel(p.role as any)}</span>
                {p.role === "CP" && p.cpTier && <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-medium">{p.cpTier}</span>}
                {p.disabled && <span className="rounded-full bg-red-500/15 px-2.5 py-0.5 text-xs font-medium text-red-300">Deactivated</span>}
              </div>
              <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-1"><Mail size={13} /> {p.email}</span>
                {p.phone && <span className="inline-flex items-center gap-1"><Phone size={13} /> {p.phone}</span>}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">User ID: <span className="font-mono">{p._id}</span></p>
            </div>
          </div>
          <div className="shrink-0"><KycBadge status={p.kycStatus} /></div>
        </div>
        {p.bio && <p className="mt-4 border-t border-white/10 pt-3 text-sm text-foreground/80">{p.bio}</p>}

        {/* Account meta */}
        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-white/10 pt-4 sm:grid-cols-4">
          <Meta icon={<Calendar size={14} />} label="Account created" value={p.createdAt ? formatDate(p.createdAt) : "—"} />
          <Meta icon={<LogIn size={14} />} label="Last login" value={p.lastLoginAt ? formatDate(p.lastLoginAt) : "Never"} />
          <Meta icon={<Mail size={14} />} label="Email verified" value={p.emailVerified ? "Yes" : "No"} />
          <Meta icon={<Phone size={14} />} label="Phone verified" value={p.phoneVerified ? "Yes" : "No"} />
        </div>
      </section>

      {/* Performance stats */}
      <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat icon={<Handshake size={16} />} label="Total Bookings" value={String(s.bookings.total)} sub={`GMV ${formatINR(s.bookings.gmv)}`} />
        <Stat icon={<Wallet size={16} />} label="Commission Earned" value={formatINR(s.bookings.commissionEarned)} sub={`${s.leads.assigned} leads assigned`} />
        {showDeliveries && <Stat icon={<Truck size={16} />} label="Deliveries Completed" value={String(s.deliveries.completed)} sub={`${s.deliveries.accepted} accepted · ${formatINR(s.deliveries.earnings)} paid`} />}
        {showReferrals && <Stat icon={<Users size={16} />} label="Referral Earnings" value={formatINR(s.referrals.earnings)} sub={`${s.referrals.registered + s.referrals.enrolled} referrals`} />}
        <Stat icon={<Wallet size={16} />} label="Payments" value={formatINR(s.transactions.paymentsTotal)} sub={`${s.transactions.paymentsCount} paid${s.transactions.activeSubscriptions ? ` · ${s.transactions.activeSubscriptions} active sub` : ""}`} />
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* KYC details */}
        <section className="rounded-2xl border border-white/10 glass p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-foreground/80"><IdCard size={15} /> KYC details</h2>
          <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <Field label="Status" value={<KycBadge status={p.kycStatus} />} />
            <Field label="PAN (masked)" value={p.verification.panNumberMasked || "—"} />
            <Field label="Aadhaar verified" value={p.onboardingChecks?.aadhaarVerified ? "Yes" : "No"} />
            <Field label="PAN verified" value={p.onboardingChecks?.panVerified ? "Yes" : "No"} />
            <Field label="Submitted" value={p.verification.kycSubmittedAt ? formatDate(p.verification.kycSubmittedAt) : "—"} />
            <Field label="Onboarding" value={p.onboardingVerified ? "Complete" : "Incomplete"} />
          </div>
          {p.onboardingChecks?.kycStatus === "REJECTED" && p.onboardingChecks?.kycRejectionReason && (
            <p className="mt-3 rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-300">Rejection reason: {p.onboardingChecks.kycRejectionReason}</p>
          )}
          {p.developerProfile && (p.developerProfile.companyName || p.developerProfile.reraNumber) && (
            <div className="mt-3 grid grid-cols-2 gap-2 border-t border-white/10 pt-3 text-sm">
              {p.developerProfile.companyName && <Field label="Company" value={p.developerProfile.companyName} />}
              {p.developerProfile.reraNumber && <Field label="RERA number" value={p.developerProfile.reraNumber} />}
            </div>
          )}
        </section>

        {/* Activity summary */}
        <section className="rounded-2xl border border-white/10 glass p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-foreground/80"><Wallet size={15} /> Transaction &amp; activity summary</h2>
          <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <Field label="Payments made" value={`${s.transactions.paymentsCount} · ${formatINR(s.transactions.paymentsTotal)}`} />
            <Field label="Subscriptions" value={`${s.transactions.subscriptions} (${s.transactions.activeSubscriptions} active)`} />
            <Field label="Lead purchases" value={`${s.transactions.leadPurchases} · ${formatINR(s.transactions.leadSpend)}`} />
            <Field label="Site visits" value={`${s.siteVisits.completed}/${s.siteVisits.total} completed`} />
            <Field label="Leads submitted" value={String(s.leads.submitted)} />
            <Field label="Leads assigned" value={String(s.leads.assigned)} />
          </div>
          {showReferrals && (
            <div className="mt-3 grid grid-cols-2 gap-2 border-t border-white/10 pt-3 text-sm">
              <Field label="Total referrals" value={String(s.referrals.registered + s.referrals.enrolled)} />
              <Field label="Successful referrals" value={String(s.referrals.successful + s.referrals.enrolledActive)} />
              <Field label="Referral transactions" value={String(s.referrals.transactions)} />
              <Field label="Referral earnings" value={formatINR(s.referrals.earnings)} />
              {p.referralCode && <Field label="Referral code" value={<span className="font-mono">{p.referralCode}</span>} />}
            </div>
          )}
        </section>
      </div>

      {/* Uploaded documents */}
      <section className="mt-5 rounded-2xl border border-white/10 glass p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-foreground/80"><FileText size={15} /> Uploaded documents ({p.documents.length})</h2>
        {p.documents.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No documents on file for this user.</p>
        ) : (
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {p.documents.map((d, i) => <DocTile key={i} doc={d} />)}
          </div>
        )}
      </section>

      {/* Referred users / enrolled developers */}
      {showReferrals && (p.referredList.length > 0 || p.enrolledReferralList.length > 0) && (
        <section className="mt-5 rounded-2xl border border-white/10 glass p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-foreground/80"><Users size={15} /> Referrals</h2>
          {p.referredList.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-medium text-muted-foreground">Signed up with this user's code</p>
              <div className="mt-2 space-y-1.5">
                {p.referredList.map((r) => (
                  <div key={r._id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white/[0.03] px-3 py-2 text-sm">
                    <span className="truncate"><span className="font-medium">{r.name}</span> <span className="text-muted-foreground">· {roleLabel(r.role as any)} · {r.email}</span></span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${r.activated ? "bg-emerald-500/15 text-emerald-300" : "bg-white/10 text-muted-foreground"}`}>{r.activated ? "Active" : "Registered"}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {p.enrolledReferralList.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-medium text-muted-foreground">Developers / landowners enrolled</p>
              <div className="mt-2 space-y-1.5">
                {p.enrolledReferralList.map((r) => (
                  <div key={r._id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white/[0.03] px-3 py-2 text-sm">
                    <span className="truncate"><span className="font-medium">{r.developerName}</span>{r.companyName ? <span className="text-muted-foreground"> · {r.companyName}</span> : ""}{r.city ? <span className="text-muted-foreground"> · {r.city}</span> : ""}</span>
                    <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-semibold text-foreground/80">{r.status}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {/* Verification & approval history */}
      <section className="mt-5 rounded-2xl border border-white/10 glass p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-foreground/80"><Clock size={15} /> Verification &amp; approval history</h2>
        {p.history.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No recorded actions for this account yet.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {p.history.map((h) => (
              <div key={h._id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white/[0.03] px-3 py-2 text-sm">
                <span><span className="font-medium">{prettyAction(h.action)}</span>{h.actorName ? <span className="text-muted-foreground"> · by {h.actorName}</span> : ""}{reasonOf(h.metadata) ? <span className="text-muted-foreground"> — {reasonOf(h.metadata)}</span> : ""}</span>
                <span className="text-xs text-muted-foreground">{new Date(h.createdAt).toLocaleString("en-IN")}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function prettyAction(action: string): string {
  const map: Record<string, string> = {
    "kyc.approve": "KYC approved",
    "kyc.reject": "KYC rejected",
    "user.approved": "Account approved",
    "user.rejected": "Account rejected",
    "user.disable": "Account deactivated",
    "user.enable": "Account restored",
  };
  return map[action] || action.replace(/[._]/g, " ");
}
function reasonOf(metadata?: Record<string, unknown> | null): string {
  if (!metadata) return "";
  const r = (metadata as any).reason;
  return typeof r === "string" ? r : "";
}

function Meta({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div>
      <p className="flex items-center gap-1 text-xs text-muted-foreground">{icon} {label}</p>
      <p className="mt-0.5 text-sm font-medium">{value}</p>
    </div>
  );
}
function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="mt-0.5 font-medium">{value}</div>
    </div>
  );
}
function Stat({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">{icon} {label}</p>
      <p className="mt-1 font-display text-xl font-semibold">{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

/** Renders one document. KYC identity images stream as an authenticated blob
 *  (never a public URL); other documents link directly to their stored file. */
function DocTile({ doc }: { doc: ProfileDoc }) {
  const [src, setSrc] = useState<string | null>(null);
  const [isPdf, setIsPdf] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!doc.streamUrl) return;
    let url: string | null = null;
    let cancelled = false;
    api
      .get(doc.streamUrl, { responseType: "blob" })
      .then((res) => {
        if (cancelled) return;
        const blob = res.data as Blob;
        url = URL.createObjectURL(blob);
        setIsPdf(blob.type === "application/pdf");
        setSrc(url);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [doc.streamUrl]);

  const href = doc.streamUrl ? src : doc.fileUrl || null;
  const badge = doc.status && (
    <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
      doc.status === "APPROVED" ? "bg-emerald-500/15 text-emerald-300"
        : doc.status === "REJECTED" ? "bg-rose-500/15 text-rose-300"
          : "bg-amber-500/15 text-amber-300"}`}>{doc.status}</span>
  );

  return (
    <div className="rounded-xl border border-white/10 bg-black/30 p-2">
      <div className="mb-1.5 flex items-center justify-between gap-1 px-1 text-xs text-muted-foreground">
        <span className="truncate">{doc.category}</span>
        {href && <a href={href} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1 hover:text-white">Open <ExternalLink size={11} /></a>}
      </div>
      {failed ? (
        <div className="grid h-32 place-items-center text-xs text-muted-foreground">Failed to load</div>
      ) : doc.streamUrl && !src ? (
        <div className="grid h-32 place-items-center text-muted-foreground"><Loader2 size={18} className="animate-spin" /></div>
      ) : isPdf || (doc.fileUrl && /\.pdf($|\?)/i.test(doc.fileUrl)) ? (
        <a href={href || undefined} target="_blank" rel="noreferrer" className="grid h-32 place-items-center rounded-lg bg-white/5 text-sm text-[var(--trust)] hover:bg-white/10">View PDF</a>
      ) : href ? (
        <a href={href} target="_blank" rel="noreferrer">
          <img src={href} alt={doc.category} className="h-32 w-full rounded-lg object-cover" onError={() => setFailed(true)} />
        </a>
      ) : (
        <div className="grid h-32 place-items-center text-xs text-muted-foreground">Not available</div>
      )}
      <div className="mt-1.5 flex items-center justify-between gap-1 px-1">
        <span className="truncate text-[10px] text-muted-foreground">{doc.project || doc.fileName || doc.kind}</span>
        {badge}
      </div>
    </div>
  );
}

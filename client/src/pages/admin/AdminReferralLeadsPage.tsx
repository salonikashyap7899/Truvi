import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Handshake, Loader2, ChevronDown, ChevronUp, Phone, Mail, MapPin, Building2, CheckCircle2, ShieldCheck, XCircle } from "lucide-react";
import SectionInfoTooltip from "@/components/admin/SectionInfoTooltip";

type Status = "PENDING" | "VERIFIED" | "ACTIVE" | "REJECTED";

interface ReferralLead {
  _id: string;
  cpName: string | null;
  developerName: string;
  companyName: string | null;
  phone: string;
  email: string | null;
  city: string | null;
  landDetails: string | null;
  notes: string | null;
  status: Status;
  incentivePercent: number;
  createdAt: string;
}

export default function AdminReferralLeadsPage() {
  const [leads, setLeads] = useState<ReferralLead[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    try {
      const res = await api.get("/onboarding/developers");
      setLeads(res.data.referrals || []);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to load referral leads");
    } finally {
      setLoaded(true);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const summary = useMemo(() => {
    const s = { total: leads.length, pending: 0, verified: 0, active: 0, rejected: 0 };
    for (const l of leads) {
      if (l.status === "PENDING") s.pending++;
      else if (l.status === "VERIFIED") s.verified++;
      else if (l.status === "ACTIVE") s.active++;
      else if (l.status === "REJECTED") s.rejected++;
    }
    return s;
  }, [leads]);

  async function setStatus(id: string, status: Status) {
    setBusyId(id);
    try {
      const res = await api.patch(`/onboarding/developers/${id}`, { status });
      setLeads((prev) => prev.map((l) => (l._id === id ? { ...l, status: res.data.referral.status } : l)));
      toast.success(`Marked ${status.toLowerCase()}`);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Action failed");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main className="min-h-screen p-4 sm:p-6 lg:p-8 text-foreground max-w-[1600px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold sm:text-3xl flex items-center gap-2.5">
              <Handshake size={24} className="text-emerald-400" />
              Referral Developer Leads
            </h1>
            <SectionInfoTooltip
              title="Developer Referral Pipeline"
              content="Track developer leads submitted by Channel Partners and Ambassadors, verify land details, and monitor incentive payout percentages."
            />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Review inbound developer partner referrals, verify project land credentials, and approve partner commission incentives.
          </p>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Sum label="Total Leads" value={summary.total} />
        <Sum label="Awaiting Review" value={summary.pending} dotColor="bg-amber-400" />
        <Sum label="Verified" value={summary.verified} dotColor="bg-sky-400" />
        <Sum label="Active" value={summary.active} dotColor="bg-emerald-400" />
        <Sum label="Rejected" value={summary.rejected} dotColor="bg-rose-400" />
      </div>

      {!loaded ? (
        <div className="flex items-center justify-center p-16 text-muted-foreground gap-3">
          <Loader2 size={18} className="animate-spin text-emerald-400" />
          <span>Loading developer referrals…</span>
        </div>
      ) : leads.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-card p-12 text-center text-sm text-muted-foreground">
          No referral developer leads registered yet.
        </div>
      ) : (
        <div className="space-y-3">
          {leads.map((l) => {
            const open = expandedId === l._id;
            const isApproved = l.status === "ACTIVE";
            const isVerified = l.status === "VERIFIED";
            const isPending = l.status === "PENDING";
            return (
              <div key={l._id} className="rounded-xl border border-white/10 bg-card p-4 sm:p-5 shadow-sm transition hover:border-white/20">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-base text-foreground">{l.developerName}</span>
                      {l.companyName && (
                        <span className="text-xs text-muted-foreground">· {l.companyName}</span>
                      )}
                      <div className="flex items-center gap-1.5 text-xs font-semibold pl-2">
                        <span
                          className={`size-1.5 rounded-full ${
                            isApproved ? "bg-emerald-400" : isVerified ? "bg-sky-400" : isPending ? "bg-amber-400 animate-pulse" : "bg-rose-400"
                          }`}
                        />
                        <span className={isApproved ? "text-emerald-400" : isVerified ? "text-sky-400" : isPending ? "text-amber-400" : "text-rose-400"}>
                          {l.status}
                        </span>
                      </div>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Referred by <strong className="text-foreground">{l.cpName ?? "Direct Partner"}</strong> · {new Date(l.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setExpandedId(open ? null : l._id)}
                    className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-white/5 transition"
                  >
                    {open ? "Hide details" : "View details"} {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                  </button>
                </div>

                {open && (
                  <div className="mt-4 border-t border-white/10 pt-4 space-y-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Detail icon={<Phone size={13} />} label="Mobile" value={l.phone} href={`tel:${l.phone}`} />
                      <Detail icon={<Mail size={13} />} label="Email" value={l.email} href={l.email ? `mailto:${l.email}` : undefined} />
                      <Detail icon={<Building2 size={13} />} label="Company / Developer" value={l.companyName} />
                      <Detail icon={<MapPin size={13} />} label="City" value={l.city} />
                    </div>

                    {l.landDetails && (
                      <div className="rounded-lg border border-white/5 bg-white/[0.02] p-3 text-xs">
                        <p className="font-semibold text-muted-foreground uppercase text-[10px] tracking-wider">Land / Project Specs</p>
                        <p className="mt-1 text-foreground leading-relaxed">{l.landDetails}</p>
                      </div>
                    )}

                    {l.notes && (
                      <div className="rounded-lg border border-white/5 bg-white/[0.02] p-3 text-xs">
                        <p className="font-semibold text-muted-foreground uppercase text-[10px] tracking-wider">Internal Notes</p>
                        <p className="mt-1 text-foreground whitespace-pre-wrap leading-relaxed">{l.notes}</p>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex flex-wrap items-center gap-2 pt-2">
                      {l.phone && (
                        <a href={`tel:${l.phone}`} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-white/5 transition">
                          <Phone size={13} /> Call
                        </a>
                      )}
                      {l.email && (
                        <a href={`mailto:${l.email}`} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-white/5 transition">
                          <Mail size={13} /> Email
                        </a>
                      )}
                      <div className="grow" />
                      {l.status !== "VERIFIED" && (
                        <button
                          type="button"
                          onClick={() => setStatus(l._id, "VERIFIED")}
                          disabled={busyId === l._id}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-1.5 text-xs font-semibold text-sky-300 hover:bg-sky-500/20 transition disabled:opacity-50"
                        >
                          <ShieldCheck size={13} /> Verify Lead
                        </button>
                      )}
                      {l.status !== "ACTIVE" && (
                        <button
                          type="button"
                          onClick={() => setStatus(l._id, "ACTIVE")}
                          disabled={busyId === l._id}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 transition disabled:opacity-50"
                        >
                          {busyId === l._id ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />} Approve
                        </button>
                      )}
                      {l.status !== "REJECTED" && (
                        <button
                          type="button"
                          onClick={() => setStatus(l._id, "REJECTED")}
                          disabled={busyId === l._id}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-300 hover:bg-rose-500/20 transition disabled:opacity-50"
                        >
                          <XCircle size={13} /> Reject
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}

function Sum({ label, value, dotColor }: { label: string; value: number; dotColor?: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-card p-4 space-y-1">
      <div className="flex items-center gap-1.5">
        {dotColor && <span className={`size-1.5 rounded-full ${dotColor}`} />}
        <p className="text-xs text-muted-foreground font-medium">{label}</p>
      </div>
      <p className="text-2xl font-bold tracking-tight text-foreground tabular-nums">{value}</p>
    </div>
  );
}

function Detail({ icon, label, value, href }: { icon: React.ReactNode; label: string; value: string | null; href?: string }) {
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-white/10 bg-white/[0.02] p-2.5 text-xs">
      <span className="mt-0.5 text-muted-foreground">{icon}</span>
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{label}</p>
        {value ? (
          href ? (
            <a href={href} className="truncate text-xs font-medium text-sky-400 hover:underline block">{value}</a>
          ) : (
            <p className="truncate text-xs font-medium text-foreground">{value}</p>
          )
        ) : (
          <p className="text-xs text-muted-foreground">—</p>
        )}
      </div>
    </div>
  );
}

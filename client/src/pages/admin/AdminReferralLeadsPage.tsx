import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Badge } from "@/components/ui/primitives";
import { ArrowLeft, Handshake, Loader2, ChevronDown, ChevronUp, Phone, Mail, MapPin, Building2, CheckCircle2, ShieldCheck, XCircle } from "lucide-react";

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

const STATUS_VARIANT: Record<Status, "success" | "warning" | "info" | "danger"> = {
  PENDING: "warning",
  VERIFIED: "info",
  ACTIVE: "success",
  REJECTED: "danger",
};

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
    <main className="min-h-screen p-6 text-white md:p-10">
      <Link to="/admin/dashboard" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-white">
        <ArrowLeft size={15} /> Back to dashboard
      </Link>
      <h1 className="mt-3 flex items-center gap-2 text-2xl font-semibold">
        <Handshake size={22} className="text-emerald-400" /> Referral Developer Leads
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Every developer referred by a Channel Partner or Ambassador — with full details, so you can verify, contact and approve without hunting through notifications.
      </p>

      {/* Summary */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Sum label="Total" value={summary.total} tone="text-white" />
        <Sum label="Pending" value={summary.pending} tone="text-amber-300" />
        <Sum label="Verified" value={summary.verified} tone="text-sky-300" />
        <Sum label="Active" value={summary.active} tone="text-emerald-300" />
        <Sum label="Rejected" value={summary.rejected} tone="text-red-300" />
      </div>

      {!loaded ? (
        <p className="mt-10 text-sm text-muted-foreground">Loading…</p>
      ) : leads.length === 0 ? (
        <p className="mt-10 text-sm text-muted-foreground">No referral developer leads yet.</p>
      ) : (
        <div className="mt-6 space-y-3">
          {leads.map((l) => {
            const open = expandedId === l._id;
            return (
              <div key={l._id} className="rounded-2xl border border-white/10 glass p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 font-semibold">
                      {l.developerName}
                      {l.companyName && <span className="text-sm font-normal text-muted-foreground">· {l.companyName}</span>}
                      <Badge variant={STATUS_VARIANT[l.status]}>{l.status}</Badge>
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Referred by {l.cpName ?? "—"} · {new Date(l.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                    </p>
                  </div>
                  <button
                    onClick={() => setExpandedId(open ? null : l._id)}
                    className="inline-flex items-center gap-1 rounded-full border border-white/15 px-3 py-1.5 text-xs font-medium text-sky-300 hover:bg-white/5"
                  >
                    {open ? "Hide details" : "View full details"} {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                  </button>
                </div>

                {open && (
                  <div className="mt-4 border-t border-white/10 pt-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Detail icon={<Phone size={13} />} label="Mobile" value={l.phone} href={`tel:${l.phone}`} />
                      <Detail icon={<Mail size={13} />} label="Email" value={l.email} href={l.email ? `mailto:${l.email}` : undefined} />
                      <Detail icon={<Building2 size={13} />} label="Company / Developer" value={l.companyName} />
                      <Detail icon={<MapPin size={13} />} label="City" value={l.city} />
                    </div>
                    {l.landDetails && (
                      <div className="mt-3">
                        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Land / project details</p>
                        <p className="mt-0.5 text-sm text-foreground/90">{l.landDetails}</p>
                      </div>
                    )}
                    {l.notes && (
                      <div className="mt-3">
                        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Notes</p>
                        <p className="mt-0.5 whitespace-pre-wrap text-sm text-foreground/90">{l.notes}</p>
                      </div>
                    )}

                    {/* Actions — only after the admin has opened the full details */}
                    <div className="mt-4 flex flex-wrap gap-2">
                      {l.phone && (
                        <a href={`tel:${l.phone}`} className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-2 text-sm text-white hover:bg-white/5">
                          <Phone size={14} /> Call
                        </a>
                      )}
                      {l.email && (
                        <a href={`mailto:${l.email}`} className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-2 text-sm text-white hover:bg-white/5">
                          <Mail size={14} /> Email
                        </a>
                      )}
                      <div className="grow" />
                      {l.status !== "VERIFIED" && (
                        <button onClick={() => setStatus(l._id, "VERIFIED")} disabled={busyId === l._id} className="inline-flex items-center gap-1.5 rounded-lg border border-sky-600/50 px-3 py-2 text-sm font-medium text-sky-300 hover:bg-sky-900/20 disabled:opacity-50">
                          <ShieldCheck size={14} /> Verify
                        </button>
                      )}
                      {l.status !== "ACTIVE" && (
                        <button onClick={() => setStatus(l._id, "ACTIVE")} disabled={busyId === l._id} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold hover:bg-emerald-500 disabled:opacity-60">
                          {busyId === l._id ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Approve
                        </button>
                      )}
                      {l.status !== "REJECTED" && (
                        <button onClick={() => setStatus(l._id, "REJECTED")} disabled={busyId === l._id} className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/40 px-3 py-2 text-sm font-medium text-red-300 hover:bg-red-500/10 disabled:opacity-60">
                          <XCircle size={14} /> Reject
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

function Sum({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-0.5 font-display text-2xl font-semibold ${tone}`}>{value}</p>
    </div>
  );
}

function Detail({ icon, label, value, href }: { icon: React.ReactNode; label: string; value: string | null; href?: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2">
      <span className="mt-0.5 text-muted-foreground">{icon}</span>
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
        {value ? (
          href ? (
            <a href={href} className="truncate text-sm text-sky-300 hover:underline">{value}</a>
          ) : (
            <p className="truncate text-sm text-foreground/90">{value}</p>
          )
        ) : (
          <p className="text-sm text-muted-foreground">—</p>
        )}
      </div>
    </div>
  );
}

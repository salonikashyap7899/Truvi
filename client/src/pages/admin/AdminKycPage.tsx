import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { ShieldCheck, ExternalLink, Loader2, ArrowLeft } from "lucide-react";

interface KycSubmission {
  _id: string;
  name: string;
  email: string;
  phone?: string;
  role: string;
  panNumberMasked: string | null;
  hasAadhaar: boolean;
  hasPan: boolean;
  hasSelfie: boolean;
  submittedAt: string | null;
}

export default function AdminKycPage() {
  const [submissions, setSubmissions] = useState<KycSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    try {
      const res = await api.get("/admin/kyc/pending");
      setSubmissions(res.data.submissions || []);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to load submissions");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function decide(userId: string, approve: boolean) {
    let reason: string | undefined;
    if (!approve) {
      reason = window.prompt("Reason for rejection (shown to the partner):") || undefined;
      if (reason === undefined) return; // cancelled
    }
    setBusyId(userId);
    try {
      await api.post(`/admin/kyc/${userId}/decision`, { approve, reason });
      toast.success(approve ? "Approved — access unlocked." : "Rejected.");
      setSubmissions((prev) => prev.filter((s) => s._id !== userId));
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
        <ShieldCheck size={22} className="text-[var(--trust)]" /> Identity verification
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Review Channel Partner Aadhaar, PAN and selfie submissions. Approving unlocks their workspace; documents are
        deleted once you decide.
      </p>

      {loading ? (
        <p className="mt-10 text-sm text-muted-foreground">Loading…</p>
      ) : submissions.length === 0 ? (
        <p className="mt-10 text-sm text-muted-foreground">No submissions awaiting review.</p>
      ) : (
        <div className="mt-6 space-y-5">
          {submissions.map((s) => (
            <div key={s._id} className="rounded-2xl border border-white/10 glass p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{s.name} <span className="ml-1 rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-medium">{s.role}</span></p>
                  <p className="text-sm text-muted-foreground">{s.email}{s.phone ? ` · ${s.phone}` : ""}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    PAN: {s.panNumberMasked || "—"}
                    {s.submittedAt ? ` · submitted ${new Date(s.submittedAt).toLocaleString("en-IN")}` : ""}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => decide(s._id, true)}
                    disabled={busyId === s._id}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold hover:bg-emerald-500 disabled:opacity-60"
                  >
                    {busyId === s._id && <Loader2 size={14} className="animate-spin" />} Approve
                  </button>
                  <button
                    onClick={() => decide(s._id, false)}
                    disabled={busyId === s._id}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/40 px-3 py-2 text-sm font-semibold text-red-300 hover:bg-red-500/10 disabled:opacity-60"
                  >
                    Reject
                  </button>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <DocTile label="Aadhaar" userId={s._id} type="aadhaar" present={s.hasAadhaar} />
                <DocTile label="PAN" userId={s._id} type="pan" present={s.hasPan} />
                <DocTile label="Selfie" userId={s._id} type="selfie" present={s.hasSelfie} />
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}

/** Fetches the document through the authenticated admin route (as a blob) so the
 *  identity image is never exposed via a public URL. */
function DocTile({ label, userId, type, present }: { label: string; userId: string; type: string; present: boolean }) {
  const [src, setSrc] = useState<string | null>(null);
  const [isPdf, setIsPdf] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!present) return;
    let url: string | null = null;
    let cancelled = false;
    api
      .get(`/admin/kyc/${userId}/file/${type}`, { responseType: "blob" })
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
  }, [userId, type, present]);

  return (
    <div className="rounded-xl border border-white/10 bg-black/30 p-2">
      <div className="mb-1.5 flex items-center justify-between px-1 text-xs text-muted-foreground">
        <span>{label}</span>
        {src && (
          <a href={src} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-white">
            Open <ExternalLink size={11} />
          </a>
        )}
      </div>
      {!present || failed ? (
        <div className="grid h-36 place-items-center text-xs text-muted-foreground">{failed ? "Failed to load" : "Not provided"}</div>
      ) : !src ? (
        <div className="grid h-36 place-items-center text-muted-foreground"><Loader2 size={18} className="animate-spin" /></div>
      ) : isPdf ? (
        <a href={src} target="_blank" rel="noreferrer" className="grid h-36 place-items-center rounded-lg bg-white/5 text-sm text-[var(--trust)] hover:bg-white/10">
          View PDF
        </a>
      ) : (
        <a href={src} target="_blank" rel="noreferrer">
          <img src={src} alt={label} className="h-36 w-full rounded-lg object-cover" />
        </a>
      )}
    </div>
  );
}

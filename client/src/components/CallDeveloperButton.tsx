import { useState } from "react";
import { api } from "@/lib/api";
import { Phone, PhoneCall, X, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

/**
 * "Call Developer" — a Channel-Partner-only masked call. Tapping it bridges the
 * CP and the listing's developer through a Truvi virtual number; neither party
 * ever sees the other's real number, and no number is exposed to the frontend.
 * The developer is resolved server-side from the project, so nothing is
 * hardcoded here.
 */
export default function CallDeveloperButton({ projectId, className = "" }: { projectId: string; className?: string }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [calling, setCalling] = useState(false);
  const [placed, setPlaced] = useState<string | null>(null);

  // Only Channel Partners (and admins, for testing) can place a masked call.
  if (!user || (user.role !== "CP" && user.role !== "ADMIN")) return null;

  async function placeCall() {
    setCalling(true);
    try {
      const res = await api.post(`/projects/${projectId}/call-developer`);
      setPlaced(res.data?.message || "Connecting your call — your phone will ring shortly.");
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Couldn't start the call. Please try again.");
    } finally {
      setCalling(false);
    }
  }

  return (
    <>
      <button
        onClick={() => { setPlaced(null); setOpen(true); }}
        className={`inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-5 py-2.5 text-sm font-semibold text-emerald-200 transition hover:border-emerald-400/60 hover:bg-emerald-500/20 ${className}`}
      >
        <Phone size={15} /> Call Developer
      </button>

      {open && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !calling && setOpen(false)} />
          <div className="relative w-full max-w-sm overflow-hidden rounded-2xl border border-white/10 bg-[#0a0d14]/95 p-6 text-center text-white shadow-2xl backdrop-blur-xl">
            <button onClick={() => !calling && setOpen(false)} className="absolute right-3 top-3 grid size-8 place-items-center rounded-full text-white/60 hover:bg-white/10" aria-label="Close"><X size={16} /></button>

            {placed ? (
              <>
                <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-emerald-500/15 text-emerald-300"><PhoneCall size={22} /></div>
                <h3 className="mt-4 font-display text-lg font-semibold">Connecting your call</h3>
                <p className="mx-auto mt-1.5 max-w-xs text-sm text-muted-foreground">{placed}</p>
                <button onClick={() => setOpen(false)} className="mt-6 w-full rounded-full bg-[var(--trust)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--trust)]/85">Done</button>
              </>
            ) : (
              <>
                <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-emerald-500/15 text-emerald-300"><Phone size={22} /></div>
                <h3 className="mt-4 font-display text-lg font-semibold">Call the developer</h3>
                <p className="mx-auto mt-1.5 max-w-xs text-sm text-muted-foreground">
                  We'll connect you through a Truvi virtual number — your phone rings first, then the developer's. Both numbers stay private.
                </p>
                <p className="mx-auto mt-3 flex max-w-xs items-start gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] p-2.5 text-left text-[11px] text-white/70">
                  <ShieldCheck size={13} className="mt-0.5 shrink-0 text-emerald-300" />
                  This call may be recorded for quality and safety. By continuing you consent to the call being connected and recorded.
                </p>
                <button
                  onClick={placeCall}
                  disabled={calling}
                  className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-emerald-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-400 disabled:opacity-60"
                >
                  {calling ? <Loader2 size={16} className="animate-spin" /> : <PhoneCall size={16} />} {calling ? "Connecting…" : "Call now"}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

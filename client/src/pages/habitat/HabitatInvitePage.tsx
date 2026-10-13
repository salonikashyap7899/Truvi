import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";

type Invitation = { code: string; projectName: string; city: string; expiresAt: string | null };

function apiError(error: unknown) {
  if (typeof error === "object" && error !== null && "response" in error) {
    const response = (error as { response?: { data?: { error?: string } } }).response;
    if (response?.data?.error) return response.data.error;
  }
  return "The invitation could not be loaded. It may have expired or been revoked.";
}

export default function HabitatInvitePage() {
  const { code = "" } = useParams();
  const navigate = useNavigate();
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [consented, setConsented] = useState(false);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);

  useEffect(() => {
    api.get(`/habitat/invitations/${encodeURIComponent(code)}`)
      .then((response) => setInvitation(response.data.invitation))
      .catch((error) => toast.error(apiError(error)))
      .finally(() => setLoading(false));
  }, [code]);

  async function claim() {
    setClaiming(true);
    try {
      await api.post(`/habitat/invitations/${encodeURIComponent(code)}/claim`, { consented: true });
      toast.success("Your project is connected to Truvi Habitat");
      navigate("/habitat", { replace: true });
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setClaiming(false);
    }
  }

  return (
    <main className="grid min-h-[75vh] place-items-center px-4 py-12 text-white">
      <section className="w-full max-w-lg rounded-3xl border border-white/10 bg-white/[0.035] p-6 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-300">Truvi Habitat invitation</p>
        {loading ? (
          <p className="mt-5 text-sm text-white/55">Checking invitation…</p>
        ) : invitation ? (
          <>
            <h1 className="mt-3 text-2xl font-semibold">Welcome to Habitat</h1>
            <p className="mt-3 text-sm leading-6 text-white/65">
              This invitation connects your account with <strong className="text-white">{invitation.projectName}</strong> in {invitation.city}. It enables eligible Habitat service discovery and project attribution.
            </p>
            <label className="mt-5 flex items-start gap-2 text-sm leading-6 text-white/65">
              <input type="checkbox" checked={consented} onChange={(event) => setConsented(event.target.checked)} className="mt-1 accent-emerald-300" />
              I consent to Truvi recording this project invitation attribution and using it to provide Habitat services, as described in the privacy notice.
            </label>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button type="button" disabled={!consented || claiming} onClick={() => void claim()}>
                {claiming ? "Connecting…" : "Accept invitation"}
              </Button>
              <Link to="/privacy-policy" className="self-center text-sm text-emerald-300 hover:text-emerald-200">Privacy notice</Link>
            </div>
          </>
        ) : (
          <>
            <h1 className="mt-3 text-2xl font-semibold">Invitation unavailable</h1>
            <p className="mt-2 text-sm text-white/60">Ask your developer or Truvi contact for a current Habitat invitation.</p>
            <Link to="/habitat" className="mt-5 inline-block text-sm text-emerald-300 hover:text-emerald-200">Go to Habitat</Link>
          </>
        )}
      </section>
    </main>
  );
}

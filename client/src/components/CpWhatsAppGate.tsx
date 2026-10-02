import { useState } from "react";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { toast } from "sonner";
import { MessageCircle, CheckCircle2, Loader2, Megaphone, ExternalLink } from "lucide-react";
import UserMenu from "@/components/UserMenu";

/** Official Truvi Ventures Channel Partners updates channel. */
const WHATSAPP_CHANNEL_URL = "https://whatsapp.com/channel/0029Vb8UCCs4IBhCSVZBHK1h";

/**
 * Mandatory WhatsApp-channel gate for Channel Partners. Shown in place of the
 * CP dashboard once KYC is done but the CP hasn't yet confirmed following the
 * Truvi Ventures Channel Partners updates channel. WhatsApp exposes no API to
 * verify membership, so the CP opens the channel and then confirms — the
 * confirmation unlocks the workspace and is remembered on their account.
 */
export function CpWhatsAppGate() {
  const user = useAuthStore((s) => s.user);
  const [opened, setOpened] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function confirm() {
    if (submitting) return;
    setSubmitting(true);
    try {
      await api.post("/auth/join-whatsapp-channel");
      const cur = useAuthStore.getState().user;
      if (cur) useAuthStore.getState().setUser({ ...cur, whatsappChannelJoined: true });
      toast.success("Thanks for joining — your workspace is unlocked.");
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Couldn't confirm right now. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen p-6 text-white md:p-10">
      <div className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-2 font-display font-semibold tracking-wide">
          <Megaphone size={18} className="text-[var(--trust)]" /> One last step
        </div>
        <UserMenu />
      </div>

      <div className="mx-auto max-w-xl">
        <div className="rounded-2xl border border-white/10 glass p-6 sm:p-8">
          <div className="grid size-12 place-items-center rounded-2xl bg-[#25D366]/15 text-[#25D366] ring-1 ring-inset ring-[#25D366]/25">
            <MessageCircle size={22} />
          </div>
          <h1 className="mt-4 text-xl font-semibold">Join our WhatsApp updates channel</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Following the <b className="text-white">Truvi Ventures Channel Partners Updates</b> channel is required to use
            the Channel Partner workspace. You'll get new project launches, price updates, offers and important
            announcements — the moment they go live.
          </p>

          <ol className="mt-6 space-y-3 text-sm">
            <li className="flex gap-3">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-white/10 text-xs font-semibold">1</span>
              <span>Tap the button below to open the channel in WhatsApp, then press <b>Follow</b>.</span>
            </li>
            <li className="flex gap-3">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-white/10 text-xs font-semibold">2</span>
              <span>Come back here and tap <b>“I’ve joined the channel”</b> to unlock your dashboard.</span>
            </li>
          </ol>

          <a
            href={WHATSAPP_CHANNEL_URL}
            target="_blank"
            rel="noreferrer"
            onClick={() => setOpened(true)}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-[#25D366] py-3 text-sm font-semibold text-black transition hover:brightness-105"
          >
            <MessageCircle size={16} /> Open WhatsApp channel <ExternalLink size={14} />
          </a>

          <button
            type="button"
            onClick={confirm}
            disabled={submitting || !opened}
            title={!opened ? "Open the channel first" : undefined}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[var(--trust)] to-[#2563eb] py-3 text-sm font-semibold text-white shadow-[0_10px_30px_-8px_rgba(59,130,246,0.7)] transition-all hover:shadow-[0_14px_36px_-6px_rgba(59,130,246,0.9)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={16} />}
            {submitting ? "Confirming…" : "I’ve joined the channel"}
          </button>

          {!opened && (
            <p className="mt-3 text-center text-xs text-muted-foreground">
              Open the channel first — the confirm button unlocks after that.
            </p>
          )}

          <p className="mt-5 text-center text-[11px] text-muted-foreground">
            Signed in as {user?.name || user?.email}. Following the channel is a one-time step.
          </p>
        </div>
      </div>
    </main>
  );
}

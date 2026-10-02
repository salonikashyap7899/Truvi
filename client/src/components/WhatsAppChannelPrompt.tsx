import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { WHATSAPP_CHANNEL_URL } from "@/lib/social";

/**
 * After a user authenticates, invite them (once) to follow the
 * "Truvi Ventures — Channel Partners Updates" broadcast channel on WhatsApp.
 *
 * Mounted globally in App. It watches the auth state and, the first time a
 * given user is seen signed-in, raises a persistent toast with a one-tap
 * link to the channel. The "seen" flag is keyed per user id so every account
 * is prompted exactly once — the prompt won't re-appear on later logins.
 */

const SEEN_PREFIX = "truvi-wa-channel-seen:";

export default function WhatsAppChannelPrompt() {
  const { user } = useAuth();
  // Guard against React StrictMode double-invoking the effect in dev.
  const firedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!user?._id) return;

    const key = `${SEEN_PREFIX}${user._id}`;
    if (firedFor.current === user._id) return;
    if (localStorage.getItem(key)) return;

    firedFor.current = user._id;
    localStorage.setItem(key, "1");

    const toastId = toast("Join our WhatsApp channel", {
      description:
        "Follow the Truvi Ventures — Channel Partners Updates channel on WhatsApp for the latest launches, leads and announcements.",
      duration: Infinity,
      action: {
        label: "Join Channel",
        onClick: () => {
          window.open(WHATSAPP_CHANNEL_URL, "_blank", "noopener,noreferrer");
          toast.dismiss(toastId);
        },
      },
    });
  }, [user?._id]);

  return null;
}

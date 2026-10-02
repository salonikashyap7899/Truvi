import { useState } from "react";
import { Headphones, X } from "lucide-react";

/**
 * A short, dismissible "How to use" voice guide shown on a role's dashboard.
 * Plays a static audio asset (e.g. /media/buyer-guide.mp3). The dismissal is
 * remembered in localStorage under `storageKey` so it doesn't nag returning
 * users. `preload="none"` means the audio only downloads when played.
 */
export function HowToUseGuide({
  audioSrc,
  storageKey,
  title = "New here? How to use Truvi",
  description,
  className = "",
}: {
  audioSrc: string;
  storageKey: string;
  title?: string;
  description: string;
  className?: string;
}) {
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(storageKey) === "1";
    } catch {
      return false;
    }
  });
  if (dismissed) return null;

  function dismiss() {
    setDismissed(true);
    try {
      localStorage.setItem(storageKey, "1");
    } catch {
      /* ignore */
    }
  }

  return (
    <div className={`rounded-2xl border border-blue-500/25 bg-blue-500/[0.06] p-4 sm:p-5 ${className}`}>
      <div className="flex items-start gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-full bg-blue-500/15 text-blue-300">
          <Headphones size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-semibold">{title}</p>
              <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
            </div>
            <button
              onClick={dismiss}
              aria-label="Dismiss guide"
              className="shrink-0 rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-white/10 hover:text-white"
            >
              <X size={16} />
            </button>
          </div>
          <audio controls preload="none" src={audioSrc} className="mt-3 w-full">
            Your browser does not support audio playback.
          </audio>
        </div>
      </div>
    </div>
  );
}

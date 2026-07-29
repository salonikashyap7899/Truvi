import { useRef, useState } from "react";
import { Play, Pause } from "lucide-react";

/**
 * A compact circular play/pause button that plays a short voice guide audio
 * (e.g. /media/buyer-guide.mp3). Used in the top-left corner of the auth card
 * so a new visitor can hear "how to use Truvi" without a big panel. The audio
 * only downloads when first played (`preload="none"`).
 */
export function VoiceGuideButton({
  audioSrc,
  label = "Play voice guide — how to use Truvi",
}: {
  audioSrc: string;
  label?: string;
}) {
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);

  function toggle() {
    const a = ref.current;
    if (!a) return;
    if (a.paused) void a.play();
    else a.pause();
  }

  return (
    <>
      <button
        type="button"
        onClick={toggle}
        aria-label={label}
        title={label}
        className="grid size-11 place-items-center rounded-full bg-blue-500/20 text-blue-100 ring-1 ring-blue-400/40 shadow-[0_6px_18px_-6px_rgba(59,130,246,0.8)] transition hover:bg-blue-500/30 active:scale-95"
      >
        {playing ? <Pause size={18} /> : <Play size={18} className="ml-0.5" />}
      </button>
      <audio
        ref={ref}
        src={audioSrc}
        preload="none"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
      />
    </>
  );
}

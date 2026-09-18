import { useRef, useState } from "react";
import { Building2, Play } from "lucide-react";

export interface MediaItem {
  url: string;
  type: "image" | "video";
}

/**
 * Instagram-style media carousel for a listing card: images and videos slide
 * horizontally with snap + dot indicators. Tapping an image slide fires
 * `onOpen` (used to open the property); videos play in place. Falls back to a
 * single cover image, then a branded placeholder, when there's no media.
 */
export default function MediaCarousel({
  media,
  fallback,
  alt,
  onOpen,
  className = "",
}: {
  media?: MediaItem[];
  fallback?: string | null;
  alt: string;
  onOpen?: () => void;
  className?: string;
}) {
  const list: MediaItem[] =
    media && media.length > 0 ? media : fallback ? [{ url: fallback, type: "image" }] : [];
  const [active, setActive] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);

  const onScroll = () => {
    const el = trackRef.current;
    if (!el) return;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    if (i !== active) setActive(i);
  };

  if (list.length === 0) {
    return (
      <div className={`grid place-items-center bg-gradient-to-br from-[#0f1830] via-[#0a0d14] to-[#131a2e] ${className}`}>
        <Building2 size={40} className="text-white/15" />
      </div>
    );
  }

  return (
    <div className={`relative ${className}`}>
      <div
        ref={trackRef}
        onScroll={onScroll}
        className="flex h-full w-full snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ scrollBehavior: "smooth" }}
      >
        {list.map((m, i) =>
          m.type === "video" ? (
            <video
              key={i}
              src={m.url}
              className="h-full w-full shrink-0 snap-center object-cover"
              muted
              playsInline
              loop
              controls
              preload="metadata"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <img
              key={i}
              src={m.url}
              alt={alt}
              loading="lazy"
              onClick={onOpen}
              className="h-full w-full shrink-0 snap-center object-cover"
            />
          ),
        )}
      </div>

      {/* Video badge on the active slide */}
      {list[active]?.type === "video" && (
        <span className="pointer-events-none absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur">
          <Play size={9} fill="currentColor" /> Video
        </span>
      )}

      {/* Dots */}
      {list.length > 1 && (
        <div className="pointer-events-none absolute inset-x-0 bottom-2 flex items-center justify-center gap-1.5">
          {list.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all ${i === active ? "w-4 bg-white" : "w-1.5 bg-white/50"}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

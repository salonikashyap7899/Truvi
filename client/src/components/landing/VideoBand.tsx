import { useEffect, useRef, useState, type ReactNode } from "react";
import { motion } from "framer-motion";

type OverlayPos = "center" | "top" | "bottom";

/**
 * Full-bleed cinematic video band for the landing page. The clip is AV1/webm
 * (great quality, tiny size) so it plays in Chrome/Firefox/Edge/modern Android;
 * browsers that can't (Safari/iOS, which has no webm) fall back to the poster
 * still, so the band always looks intentional. Perf-friendly: the video is only
 * fetched + played once the band scrolls near the viewport, and it stays paused
 * for visitors who prefer reduced motion (poster shown instead).
 */
export function VideoBand({
  srcWebm,
  srcMp4,
  poster,
  eyebrow,
  title,
  subtitle,
  align = "center",
  overlayPos = "center",
  height = "clamp(360px, 66vh, 680px)",
  tint = 0,
  zoom = 1,
}: {
  /** webm/AV1 source (Chrome/Firefox/Edge). At least one of srcWebm/srcMp4 required. */
  srcWebm?: string;
  /** mp4/H.264 source — the most compatible (plays on Safari/iOS too). */
  srcMp4?: string;
  poster: string;
  eyebrow?: ReactNode;
  title?: ReactNode;
  subtitle?: ReactNode;
  align?: "center" | "left";
  overlayPos?: OverlayPos;
  height?: string;
  /** 0–1 strength of a blue→violet brand recolour blended over the clip. */
  tint?: number;
  /** Scale the clip up to crop dark letterbox/room edges (1 = none). */
  zoom?: number;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [visible, setVisible] = useState(false);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    setReduced(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);
  }, []);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        setVisible(e.isIntersecting);
        if (e.isIntersecting) setLoaded(true); // once loaded, stay mounted
      },
      { rootMargin: "150px 0px", threshold: 0.01 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Play only while on screen; pause when scrolled away so the AV1 decoder
  // isn't burning CPU off-screen (a big cause of scroll jank).
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (visible && !reduced) v.play().catch(() => {});
    else v.pause();
  }, [visible, reduced, loaded]);

  const zoomStyle = zoom !== 1 ? { transform: `scale(${zoom})`, transformOrigin: "center" as const } : undefined;

  const hasText = Boolean(eyebrow || title || subtitle);
  const justify = overlayPos === "top" ? "justify-start pt-10 sm:pt-14" : overlayPos === "bottom" ? "justify-end pb-10 sm:pb-14" : "justify-center";
  const items = align === "center" ? "items-center text-center" : "items-start text-left";

  return (
    <section ref={wrapRef} className="relative w-full overflow-hidden" style={{ height }}>
      {/* Poster: instant paint + the fallback for browsers without AV1/webm. */}
      <img src={poster} alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover" style={zoomStyle} />
      {loaded && !reduced && (
        <video
          ref={videoRef}
          className="absolute inset-0 h-full w-full object-cover"
          style={zoomStyle}
          poster={poster}
          muted
          loop
          playsInline
          autoPlay
          preload="none"
        >
          {srcMp4 && <source src={srcMp4} type="video/mp4" />}
          {srcWebm && <source src={srcWebm} type="video/webm" />}
        </video>
      )}

      {/* Brand recolour — maps the clip's hues onto Truvi's blue→violet palette
          (luminance/detail preserved) so the animations match the site. */}
      {tint > 0 && (
        <>
          <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: "linear-gradient(130deg, #3b82f6 0%, #6d5cff 52%, #a855f7 100%)", mixBlendMode: "color", opacity: tint }} />
          <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(120% 90% at 50% 50%, transparent 40%, rgba(59,130,246,0.18) 100%)", mixBlendMode: "soft-light", opacity: Math.min(1, tint + 0.2) }} />
        </>
      )}

      {/* Blend the top & bottom edges into the page so the band feels seamless. */}
      <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: "linear-gradient(to bottom, var(--background), transparent 15%, transparent 80%, var(--background))" }} />
      {hasText && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ background: align === "center" ? "radial-gradient(ellipse at center, rgba(5,7,12,0.5), transparent 62%)" : "linear-gradient(to right, rgba(5,7,12,0.72), transparent 62%)" }}
        />
      )}

      {hasText && (
        <div className={`absolute inset-0 z-10 flex flex-col gap-3 px-6 sm:px-12 ${justify} ${items}`}>
          {eyebrow && (
            <motion.span
              initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5 }}
              className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-black/30 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/90 backdrop-blur-sm"
            >
              {eyebrow}
            </motion.span>
          )}
          {title && (
            <motion.h2
              initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.55, delay: 0.05 }}
              className="max-w-3xl font-display text-3xl font-semibold leading-[1.05] text-white drop-shadow-[0_2px_20px_rgba(0,0,0,0.6)] sm:text-4xl md:text-5xl"
            >
              {title}
            </motion.h2>
          )}
          {subtitle && (
            <motion.p
              initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.55, delay: 0.1 }}
              className="max-w-xl text-sm text-white/80 sm:text-base"
            >
              {subtitle}
            </motion.p>
          )}
        </div>
      )}
    </section>
  );
}

export default VideoBand;

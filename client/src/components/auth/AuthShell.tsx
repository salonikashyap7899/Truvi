import { motion } from "framer-motion";

/**
 * Premium animated backdrop shared by every auth screen. Additive — it layers
 * slowly drifting aurora glows and a focus vignette over whatever is behind it.
 */
export function AuthAurora() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-[#05070c]" />
      <motion.div
        className="absolute -top-[18%] left-1/2 h-[55vh] w-[75vw] -translate-x-1/2 rounded-full blur-[120px]"
        style={{ background: "radial-gradient(circle, rgba(59,130,246,0.38), transparent 70%)" }}
        animate={{ y: [0, 26, 0], opacity: [0.55, 0.85, 0.55] }}
        transition={{ duration: 13, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute top-[28%] -left-[8%] h-[42vh] w-[42vw] rounded-full blur-[130px]"
        style={{ background: "radial-gradient(circle, rgba(56,189,248,0.28), transparent 70%)" }}
        animate={{ x: [0, 38, 0], y: [0, -22, 0] }}
        transition={{ duration: 17, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute -bottom-[16%] -right-[6%] h-[46vh] w-[46vw] rounded-full blur-[140px]"
        style={{ background: "radial-gradient(circle, rgba(139,92,246,0.24), transparent 70%)" }}
        animate={{ x: [0, -34, 0], y: [0, 20, 0] }}
        transition={{ duration: 19, repeat: Infinity, ease: "easeInOut" }}
      />
      {/* Faint grid, masked toward the centre */}
      <div
        className="absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.7) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.7) 1px, transparent 1px)",
          backgroundSize: "46px 46px",
          maskImage: "radial-gradient(ellipse at center, black 25%, transparent 72%)",
          WebkitMaskImage: "radial-gradient(ellipse at center, black 25%, transparent 72%)",
        }}
      />
      <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at center, transparent 42%, rgba(0,0,0,0.6) 100%)" }} />
    </div>
  );
}

/**
 * The premium glassy auth card — soft outer glow, gradient hairline border,
 * blurred surface and a top light sheen. Shared by signup, login and verify.
 */
export function AuthCard({
  children,
  className,
  topLeft,
}: {
  children: React.ReactNode;
  className?: string;
  /** Optional element pinned to the card's top-left corner (e.g. a voice-guide
   *  play button). It stays fixed while the card body scrolls. */
  topLeft?: React.ReactNode;
}) {
  return (
    <div className="relative">
      {/* Soft glow behind the card */}
      <div
        aria-hidden
        className="absolute -inset-1 rounded-[32px] bg-gradient-to-b from-[var(--trust)]/25 via-[var(--trust)]/5 to-transparent blur-2xl"
      />
      {/* Gradient hairline border */}
      <div
        className="relative rounded-[28px] p-px"
        style={{ background: "linear-gradient(160deg, rgba(255,255,255,0.30), rgba(59,130,246,0.38) 45%, rgba(255,255,255,0.04) 85%)" }}
      >
        <div className="relative rounded-[27px] bg-[#0a0d14]/85 backdrop-blur-2xl">
          {/* Top sheen */}
          <div aria-hidden className="absolute inset-x-8 top-0 z-10 h-px bg-gradient-to-r from-transparent via-white/50 to-transparent" />
          {/* Pinned top-left slot (doesn't scroll with the body) */}
          {topLeft && <div className="absolute left-4 top-4 z-20 sm:left-5 sm:top-5">{topLeft}</div>}
          {/* Card body — scrolls inside the card so the page itself never scrolls */}
          <div
            className={`max-h-[calc(100dvh-6rem)] overflow-y-auto overscroll-contain rounded-[27px] p-7 sm:p-8 [scrollbar-color:rgba(148,163,184,0.35)_transparent] [scrollbar-width:thin] ${className ?? ""}`}
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

import { motion } from "framer-motion";

/**
 * Premium animated backdrop shared by every auth screen. Additive — it layers
 * slowly drifting aurora glows and a focus vignette over whatever is behind it.
 */
export function AuthAurora() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute inset-0" style={{ background: "var(--background)" }} />
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
      <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at center, transparent 42%, var(--auth-vignette) 100%)" }} />
    </div>
  );
}

/**
 * The premium glassy auth card — soft outer glow, gradient hairline border,
 * blurred surface and a top light sheen. Shared by signup, login and verify.
 */
export function AuthCard({ children, className }: { children: React.ReactNode; className?: string }) {
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
        <div className={`relative max-h-[88dvh] overflow-y-auto rounded-[27px] bg-card/85 p-7 text-foreground backdrop-blur-2xl sm:p-8 ${className ?? ""}`}>
          {/* Top sheen */}
          <div aria-hidden className="absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-white/50 to-transparent" />
          {children}
        </div>
      </div>
    </div>
  );
}

import type { CSSProperties } from "react";

interface TruviMarkProps {
  /** Width and height of the reserved logo footprint, in pixels. */
  size?: number;
  className?: string;
}

/**
 * Official Truvi shield mark for small brand-icon placements.
 * The full-colour artwork is used in Light Mode and the white artwork in
 * Dark Mode. Both images are the original supplied brand assets.
 */
export function TruviMark({ size = 28, className = "" }: TruviMarkProps) {
  const dimensions: CSSProperties = { width: size, height: size };

  return (
    <span
      className={["truvi-mark", className].filter(Boolean).join(" ")}
      style={dimensions}
      role="img"
      aria-label="Truvi Ventures"
    >
      <img src="/brand/icon.png" alt="" className="truvi-mark__asset truvi-mark__light" />
      <img src="/brand/icon-white.png" alt="" className="truvi-mark__asset truvi-mark__dark" />
    </span>
  );
}

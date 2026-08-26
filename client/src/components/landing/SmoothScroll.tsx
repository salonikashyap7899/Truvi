import { useEffect } from "react";
import Lenis from "lenis";
import { IS_TOUCH } from "@/lib/device";

export function SmoothScroll() {
  useEffect(() => {
    // On phones, native momentum scrolling feels faster and smoother than a
    // JS-driven scroll loop — and it frees a per-frame rAF that competes with
    // the 3D canvas. Lenis stays on desktop for the wheel smoothing.
    if (IS_TOUCH) return;
    const lenis = new Lenis({
      duration: 1.4,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
    });
    let rafId = 0;
    function raf(time: number) {
      lenis.raf(time);
      rafId = requestAnimationFrame(raf);
    }
    rafId = requestAnimationFrame(raf);
    return () => {
      cancelAnimationFrame(rafId);
      lenis.destroy();
    };
  }, []);
  return null;
}

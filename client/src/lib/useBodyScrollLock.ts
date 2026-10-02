import { useEffect } from "react";

/**
 * Lock <body> scroll while `active` is true (e.g. a modal / bottom-sheet /
 * chat panel is open), so scrolling inside the overlay doesn't scroll the
 * page behind it. Restores the previous overflow value on close/unmount.
 * Safe as a no-op during SSR / when document is unavailable.
 */
export function useBodyScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active || typeof document === "undefined") return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [active]);
}

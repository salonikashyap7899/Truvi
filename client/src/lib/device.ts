/**
 * Coarse pointer = phone / touch tablet (including the installed Capacitor
 * app). Computed once at module load. We use this to drop desktop-only eye
 * candy that costs GPU/CPU without being visible or useful on a phone —
 * keeping the app smooth and native-feeling on mobile.
 *
 * Guarded for SSR / non-browser just in case; defaults to false (desktop).
 */
export const IS_TOUCH =
  typeof window !== "undefined" &&
  !!window.matchMedia &&
  window.matchMedia("(pointer: coarse)").matches;

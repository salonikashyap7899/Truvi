/**
 * Coarse pointer indicates a phone or touch tablet. Computed once at module
 * load and used to skip desktop-only visual effects that cost GPU/CPU without
 * adding value on touch screens.
 *
 * Guarded for SSR / non-browser just in case; defaults to false (desktop).
 */
export const IS_TOUCH =
  typeof window !== "undefined" &&
  !!window.matchMedia &&
  window.matchMedia("(pointer: coarse)").matches;

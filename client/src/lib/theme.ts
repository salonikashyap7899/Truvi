import { useSyncExternalStore } from "react";

/**
 * App-wide light/dark theme. Backed by a tiny module store (no provider needed)
 * so any component — nav, auth card, user menu — can read or flip the theme.
 *
 * The theme is applied by stamping `data-theme` on <html>; the light palette in
 * landing.css keys off `:root[data-theme="light"]`. Defaults to dark (the
 * historical look) unless the visitor has previously chosen light.
 */
export type Theme = "light" | "dark";

const STORAGE_KEY = "truvi-theme";
const listeners = new Set<() => void>();

function readStored(): Theme | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === "light" || v === "dark" ? v : null;
  } catch {
    return null;
  }
}

// Default to dark so the existing look is preserved for everyone who hasn't
// opted into light mode yet.
let current: Theme = readStored() ?? "dark";

function apply(theme: Theme) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
}

/** Apply the stored/initial theme once, before React paints (call in main). */
export function initTheme() {
  apply(current);
}

export function setTheme(theme: Theme) {
  if (theme === current) return;
  current = theme;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* private mode — theme still applies for this session */
  }
  apply(theme);
  listeners.forEach((l) => l());
}

export function toggleTheme() {
  setTheme(current === "dark" ? "light" : "dark");
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Reactive theme hook. Returns the active theme and setters. */
export function useTheme(): { theme: Theme; setTheme: (t: Theme) => void; toggle: () => void } {
  const theme = useSyncExternalStore(subscribe, () => current, () => "dark" as Theme);
  return { theme, setTheme, toggle: toggleTheme };
}

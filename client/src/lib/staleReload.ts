/**
 * Stale-build recovery. After a deploy, a browser/app holding the old
 * index.html tries to lazy-load chunk files whose hashed names no longer
 * exist, which throws "Failed to fetch dynamically imported module" /
 * "Unable to preload CSS…". The fix is to reload once so the fresh index
 * (with the current chunk names) is fetched — but never loop.
 */
const KEY = "truvi_stale_reload_at";

/** Does this error look like a stale-bundle / failed-chunk load? */
export function isStaleBundleError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err ?? "")).toLowerCase();
  return (
    msg.includes("loading chunk") ||
    msg.includes("loading css chunk") ||
    msg.includes("unable to preload") || // Vite: "Unable to preload CSS for …"
    msg.includes("dynamically imported module") ||
    msg.includes("importing a module script failed") ||
    msg.includes("failed to fetch dynamically imported module") ||
    msg.includes("unexpected token '<'") // old index cached; server returned HTML for a missing asset
  );
}

/**
 * Reload once to pull the fresh build. Guarded so it can't loop: if we already
 * reloaded within the last 10s (a genuinely broken/missing chunk that reload
 * won't fix), it does nothing and returns false so the caller can show a
 * visible fallback instead.
 */
export function reloadForStaleBuild(): boolean {
  try {
    const last = Number(sessionStorage.getItem(KEY) || 0);
    if (Date.now() - last < 10000) return false;
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    return false; // storage blocked (private mode) — let the fallback UI show
  }
  try {
    window.location.reload();
  } catch {
    /* ignore */
  }
  return true;
}

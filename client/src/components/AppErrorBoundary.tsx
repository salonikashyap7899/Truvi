import { Component, type ReactNode } from "react";
import { isStaleBundleError, reloadForStaleBuild } from "@/lib/staleReload";

/**
 * App-level error boundary. Without one, ANY uncaught render error unmounts the
 * whole React tree and the user sees a blank white screen — which is exactly
 * what a stale cached bundle on a phone produces (a chunk the new index.html no
 * longer ships fails to load and throws).
 *
 * This boundary:
 *  - auto-reloads ONCE for a stale-bundle / failed-chunk error (fetches the
 *    fresh build instead of staying blank), guarded by sessionStorage so it can
 *    never loop, and
 *  - otherwise shows a visible, recoverable fallback (Reload + the message) so
 *    a crash is never an unexplained blank screen.
 */
export class AppErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean; message: string }> {
  state = { failed: false, message: "" };

  static getDerivedStateFromError(err: unknown) {
    return { failed: true, message: err instanceof Error ? err.message : String(err ?? "Unknown error") };
  }

  componentDidCatch(err: unknown) {
    // A stale-bundle error means the browser is holding an old build (a chunk
    // the new index.html replaced fails to load). Reload once to pull the
    // current build — the common "error on my phone but fine on desktop" fix.
    // reloadForStaleBuild is time-guarded so it can never loop.
    if (isStaleBundleError(err)) reloadForStaleBuild();
    // Best-effort telemetry hook; never throws.
    try { console.error("App crashed:", err); } catch { /* ignore */ }
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, background: "#0a0d14", color: "#fff", fontFamily: "system-ui, sans-serif" }}>
        <div style={{ maxWidth: 420, textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>⚠️</div>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 8px" }}>Something went wrong</h1>
          <p style={{ fontSize: 14, color: "#9aa4b2", margin: "0 0 16px" }}>
            The page hit an unexpected error. This is usually fixed by reloading — your phone may be showing an older version of the app.
          </p>
          <button
            onClick={() => { try { sessionStorage.removeItem("truvi_stale_reload_at"); } catch { /* ignore */ } window.location.reload(); }}
            style={{ borderRadius: 999, border: "none", background: "linear-gradient(90deg,#10b981,#0d9488)", color: "#fff", fontSize: 14, fontWeight: 600, padding: "10px 24px", cursor: "pointer" }}
          >
            Reload the page
          </button>
          {this.state.message && (
            <p style={{ marginTop: 16, fontSize: 11, color: "#6b7280", wordBreak: "break-word" }}>{this.state.message}</p>
          )}
        </div>
      </div>
    );
  }
}

export default AppErrorBoundary;

import { Component, type ErrorInfo, type ReactNode } from "react";

const RELOAD_KEY = "truvi:lazy-chunk-reload-at";
const RELOAD_COOLDOWN_MS = 30_000;

type Props = { children: ReactNode };
type State = { hasError: boolean; isChunkLoadError: boolean };

export function isLazyChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /failed to fetch dynamically imported module|importing a module script failed|unable to preload css|loading chunk [\w-]+ failed|chunkloaderror|error loading dynamically imported module/i.test(message);
}

/**
 * A deployment can replace hashed JS assets while a visitor still has an old
 * page open. Catch rejected React.lazy imports, reload once to get the current
 * HTML/chunk manifest, then show a recovery screen rather than a blank page if
 * the same failure persists. Other render errors get a visible fallback too.
 */
export default class ChunkLoadBoundary extends Component<Props, State> {
  state: State = { hasError: false, isChunkLoadError: false };

  static getDerivedStateFromError(error: unknown): State {
    return {
      hasError: true,
      isChunkLoadError: isLazyChunkLoadError(error),
    };
  }

  componentDidCatch(error: Error, _info: ErrorInfo) {
    if (!isLazyChunkLoadError(error) || typeof window === "undefined") return;

    try {
      const now = Date.now();
      const previous = Number(window.sessionStorage.getItem(RELOAD_KEY) || "0");
      // Never reload in a loop if the deployment itself is missing an asset.
      if (previous && now - previous < RELOAD_COOLDOWN_MS) return;
      window.sessionStorage.setItem(RELOAD_KEY, String(now));
      window.location.reload();
    } catch {
      // Storage can be disabled in privacy contexts; keep the visible fallback.
    }
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    const title = this.state.isChunkLoadError
      ? "Truvi needs a quick refresh"
      : "This page could not load";
    const description = this.state.isChunkLoadError
      ? "A page asset did not finish loading. The page tried one automatic refresh. Reload once more if the problem continues."
      : "Something went wrong while opening this page. Your account and saved data have not been changed.";

    return (
      <main
        role="alert"
        aria-live="assertive"
        style={{
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          padding: "24px",
          color: "#e8edf7",
          background: "#070b13",
          fontFamily: "Inter, system-ui, sans-serif",
        }}
      >
        <section
          style={{
            width: "min(100%, 440px)",
            padding: "28px",
            border: "1px solid rgba(148,163,184,.22)",
            borderRadius: "18px",
            background: "linear-gradient(145deg, rgba(17,27,43,.96), rgba(8,13,23,.98))",
            boxShadow: "0 24px 80px rgba(0,0,0,.32)",
          }}
        >
          <div aria-hidden="true" style={{ fontSize: "28px", marginBottom: "14px" }}>↻</div>
          <h1 style={{ margin: "0 0 10px", fontSize: "20px", fontWeight: 650 }}>{title}</h1>
          <p style={{ margin: "0 0 22px", color: "#9eacc1", fontSize: "14px", lineHeight: 1.65 }}>{description}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              width: "100%",
              minHeight: "44px",
              border: 0,
              borderRadius: "10px",
              color: "#fff",
              background: "linear-gradient(120deg, #5369e8, #6d50c7)",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Reload page
          </button>
        </section>
      </main>
    );
  }
}

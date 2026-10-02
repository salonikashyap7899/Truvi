import { Component, type ReactNode } from "react";

/**
 * Renders nothing (or a fallback) when a child crashes, instead of letting
 * the error unmount the whole app. Used around decorative WebGL scenes so a
 * failed CDN asset fetch or an unsupported device never blanks the page.
 */
export class SilentErrorBoundary extends Component<
  { children: ReactNode; fallback?: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? (this.props.fallback ?? null) : this.props.children;
  }
}

export default SilentErrorBoundary;

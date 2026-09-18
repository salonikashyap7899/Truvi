import { useEffect } from "react";
import { Link } from "react-router-dom";
import { X, ShieldCheck, LogIn, UserPlus } from "lucide-react";

interface Props {
  onClose: () => void;
  /** Kept for callers; the gate is now an account prompt, not an enquiry form. */
  projectName?: string;
  projectId?: string;
}

/**
 * Account gate shown to signed-out visitors — the same log in / create-account
 * choice offered in the menu, surfaced here instead of a lead-capture form. The
 * buttons go to the app's original auth pages (/login, /join).
 */
export default function VisitorGateModal({ onClose }: Props) {
  // Lock the page behind the modal so only the card scrolls, never the site.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Card */}
      <div className="relative w-full max-w-sm overflow-hidden rounded-2xl border border-white/10 bg-[#0a0d14]/95 shadow-2xl backdrop-blur-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/5 px-6 py-4">
          <div className="flex items-center gap-2 font-display text-sm font-semibold tracking-tight text-white">
            <span className="grid size-5 place-items-center rounded-md bg-gradient-to-br from-[var(--trust)] to-[var(--tech)] text-[9px] font-bold">T</span>
            TRUVI
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-white/10 hover:text-white"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-6 text-center">
          <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-gradient-to-br from-[var(--trust)]/25 to-[var(--tech)]/15 text-sky-300">
            <ShieldCheck size={22} />
          </div>
          <h2 className="mt-4 font-display text-lg font-semibold text-white">Sign in to continue</h2>
          <p className="mx-auto mt-1.5 max-w-xs text-sm text-muted-foreground">
            Create your free account or log in to unlock verified listings, Truvi Scores and saved searches.
          </p>

          <div className="mt-6 space-y-3">
            <Link
              to="/join"
              onClick={onClose}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-[var(--trust)] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[var(--trust)]/85"
            >
              <UserPlus size={16} /> Create free account
            </Link>
            <Link
              to="/login"
              onClick={onClose}
              className="flex w-full items-center justify-center gap-2 rounded-full border border-white/15 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/[0.08]"
            >
              <LogIn size={16} /> Log in
            </Link>
          </div>

          <button
            onClick={onClose}
            className="mt-4 text-xs text-muted-foreground transition hover:text-white"
          >
            Continue browsing
          </button>
        </div>
      </div>
    </div>
  );
}

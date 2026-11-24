import { useState, useRef, useEffect } from "react";
import { Info } from "lucide-react";
import { useTheme } from "@/lib/theme";

interface SectionInfoTooltipProps {
  title?: string;
  content: string;
  className?: string;
  side?: "top" | "bottom" | "left" | "right";
}

/**
 * Universal Section Info Button for Admin Dashboard.
 * Replaces long static subheadings and explanatory paragraphs below titles with an
 * elegant, accessible hover/focus popover tooltip.
 */
export function SectionInfoTooltip({
  title,
  content,
  className = "",
  side = "bottom",
}: SectionInfoTooltipProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const { theme } = useTheme();
  const isLight = theme === "light";

  // Close on Escape or click outside
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function handleClickOutside(e: MouseEvent) {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("mousedown", handleClickOutside);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("mousedown", handleClickOutside);
    };
  }, [open]);

  const sideClasses = {
    top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
    bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
    left: "right-full top-1/2 -translate-y-1/2 mr-2",
    right: "left-full top-1/2 -translate-y-1/2 ml-2",
  };

  return (
    <span className={`relative inline-flex items-center ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={title ? `Information about ${title}` : "Section information"}
        aria-expanded={open}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className={`inline-flex items-center justify-center w-4 h-4 rounded-full transition-all focus:outline-none focus:ring-2 focus:ring-violet-500/50 ${
          isLight
            ? "text-slate-400 hover:text-slate-700 hover:bg-slate-100"
            : "text-slate-400 hover:text-slate-200 hover:bg-white/10"
        }`}
      >
        <Info className="w-3.5 h-3.5 stroke-[2.2]" />
      </button>

      {open && (
        <div
          ref={popoverRef}
          role="tooltip"
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
          className={`absolute z-50 w-64 sm:w-72 p-3 text-xs leading-relaxed rounded-xl border shadow-xl backdrop-blur-xl pointer-events-auto transition-all animate-in fade-in-0 zoom-in-95 ${
            sideClasses[side]
          } ${
            isLight
              ? "bg-white/95 border-slate-200 text-slate-700 shadow-slate-200/80"
              : "bg-[#0B1120]/95 border-white/10 text-slate-300 shadow-black/60"
          }`}
        >
          {title && (
            <div
              className={`font-semibold mb-1 pb-1 border-b text-[11px] uppercase tracking-wider ${
                isLight ? "text-slate-900 border-slate-100" : "text-white border-white/10"
              }`}
            >
              {title}
            </div>
          )}
          <p className="text-[11px] leading-normal">{content}</p>
        </div>
      )}
    </span>
  );
}

export default SectionInfoTooltip;

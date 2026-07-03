import { useNavigate } from "react-router-dom";
import { useCompareStore } from "@/store/compareStore";
import { Button } from "@/components/ui/button";
import { GitCompareArrows, X } from "lucide-react";

/**
 * Floating action bar that appears at the bottom of the screen once 2+ properties
 * are selected for comparison. Navigates to /buyer/compare with IDs in the URL.
 */
export function CompareBar() {
  const navigate = useNavigate();
  const { selectedIds, clear } = useCompareStore();
  const count = selectedIds.length;

  if (count < 2) return null;

  function openComparePage() {
    navigate(`/buyer/compare?ids=${selectedIds.join(",")}`);
  }

  return (
    <div className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-2xl border border-neutral-700 bg-[#1A2436] px-5 py-3 shadow-2xl shadow-black/50 backdrop-blur-sm">
      <span className="text-sm text-neutral-300">
        {count} {count === 1 ? "property" : "properties"} selected
      </span>
      <Button size="sm" onClick={openComparePage} className="gap-1.5">
        <GitCompareArrows size={14} />
        Compare ({count})
      </Button>
      <button
        onClick={clear}
        aria-label="Clear selection"
        className="ml-1 flex items-center gap-1 text-xs text-neutral-500 hover:text-white transition-colors"
      >
        <X size={13} />
        Clear
      </button>
    </div>
  );
}

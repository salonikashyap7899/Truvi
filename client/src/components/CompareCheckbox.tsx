import { useCompareStore } from "@/store/compareStore";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface CompareCheckboxProps {
  projectId: string;
  className?: string;
}

/**
 * "Compare" checkbox placed on property cards.
 * Connects to the global compareStore; shows a toast if the user tries to
 * add a 5th property (max is 4).
 */
export function CompareCheckbox({ projectId, className }: CompareCheckboxProps) {
  const { toggle, isSelected } = useCompareStore();
  const checked = isSelected(projectId);

  function handleChange() {
    const result = toggle(projectId);
    if (result === "full") {
      toast.error("You can compare up to 4 properties at a time. Remove one first.");
    }
  }

  return (
    <label
      className={cn(
        "flex cursor-pointer select-none items-center gap-1.5 text-xs text-muted-foreground hover:text-white transition-colors",
        className
      )}
      onClick={(e) => e.stopPropagation()}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={handleChange}
        className="h-3.5 w-3.5 cursor-pointer accent-blue-500"
      />
      Compare
    </label>
  );
}

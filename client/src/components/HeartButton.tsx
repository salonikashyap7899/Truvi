import { useState } from "react";
import { Heart } from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface HeartButtonProps {
  projectId: string;
  initialSaved: boolean;
  onToggle?: (projectId: string, saved: boolean) => void;
  className?: string;
  size?: number;
}

/**
 * Filled/outline heart that lets a logged-in BUYER save or unsave a project.
 * Optimistically updates the UI and rolls back on error.
 */
export function HeartButton({
  projectId,
  initialSaved,
  onToggle,
  className,
  size = 20,
}: HeartButtonProps) {
  const [saved, setSaved] = useState(initialSaved);
  const [loading, setLoading] = useState(false);

  async function toggle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (loading) return;

    const next = !saved;
    setSaved(next); // optimistic update
    setLoading(true);

    try {
      if (next) {
        await api.post("/buyer/save", { projectId });
        toast.success("Property saved");
      } else {
        await api.delete(`/buyer/save/${projectId}`);
        toast.success("Property removed from saved");
      }
      onToggle?.(projectId, next);
    } catch (err: any) {
      setSaved(!next); // rollback
      toast.error(err?.response?.data?.error || "Could not update saved properties");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={toggle}
      aria-label={saved ? "Remove from saved properties" : "Save property"}
      disabled={loading}
      className={cn(
        "flex items-center justify-center rounded-full p-1.5 transition-colors",
        "hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400",
        loading && "opacity-50 cursor-wait",
        className
      )}
    >
      <Heart
        size={size}
        className={cn(
          "transition-colors",
          saved ? "fill-rose-500 stroke-rose-500" : "stroke-neutral-400 fill-none hover:stroke-rose-400"
        )}
      />
    </button>
  );
}

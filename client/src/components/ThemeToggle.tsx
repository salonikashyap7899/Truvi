import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/lib/theme";

/**
 * Global light/dark switch. Drop it into any nav, header or auth screen — it
 * reads and flips the shared theme store, so every instance stays in sync.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggle } = useTheme();
  const isDark = theme === "dark";
  const label = isDark ? "Switch to light mode" : "Switch to dark mode";
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-glass text-foreground/75 backdrop-blur transition-colors hover:text-foreground ${className ?? ""}`}
    >
      {isDark ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}

export default ThemeToggle;

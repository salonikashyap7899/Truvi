import { cn } from "@/lib/utils";
import { forwardRef } from "react";
import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "outline" | "ghost" | "destructive";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-[var(--trust)] text-white shadow-[0_0_24px_-6px_var(--trust)] hover:bg-[var(--trust)]/85",
  secondary: "glass text-foreground hover:bg-white/10",
  outline: "border border-white/15 bg-transparent text-foreground hover:bg-white/5",
  ghost: "bg-transparent text-foreground/80 hover:bg-white/5 hover:text-foreground",
  destructive: "bg-red-600 text-white hover:bg-red-500",
};

const sizeClasses: Record<Size, string> = {
  sm: "h-8 px-3 text-sm",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-6 text-base",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", disabled, ...props }, ref) => (
    <button
      ref={ref}
      disabled={disabled}
      className={cn(
        "inline-flex cursor-pointer items-center justify-center gap-2 rounded-full font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed",
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
      {...props}
    />
  )
);
Button.displayName = "Button";

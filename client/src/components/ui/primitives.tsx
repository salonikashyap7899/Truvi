import { cn } from "@/lib/utils";
import type { HTMLAttributes, InputHTMLAttributes, LabelHTMLAttributes, TextareaHTMLAttributes } from "react";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-2xl glass p-5 shadow-[var(--shadow-elegant)] transition hover:border-[var(--input)]",
        className
      )}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("text-sm font-medium text-muted-foreground", className)} {...props} />;
}

export function CardValue({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mt-1 font-display text-2xl font-semibold", className)} {...props} />;
}

const badgeVariants: Record<string, string> = {
  default: "bg-muted text-foreground/90",
  success: "bg-emerald-500/15 text-emerald-300",
  warning: "bg-amber-500/15 text-amber-300",
  danger: "bg-red-500/15 text-red-300",
  info: "bg-[var(--trust)]/15 text-sky-300",
  featured: "bg-gradient-to-r from-amber-400 to-orange-500 text-white",
  gold: "bg-[var(--gold)]/20 text-amber-200",
  silver: "bg-white/15 text-neutral-200",
  platinum: "bg-sky-500/15 text-sky-300",
  diamond: "bg-[var(--tech)]/20 text-violet-300",
};

export function Badge({
  className,
  variant = "default",
  ...props
}: HTMLAttributes<HTMLSpanElement> & { variant?: keyof typeof badgeVariants }) {
  return (
    <span
      className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", badgeVariants[variant], className)}
      {...props}
    />
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-10 w-full rounded-lg border border-border bg-[var(--field)] px-3 text-sm text-foreground outline-none backdrop-blur-sm transition placeholder:text-muted-foreground/60 focus:border-[var(--trust)] focus:ring-1 focus:ring-[var(--trust)]",
        className
      )}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "w-full rounded-lg border border-border bg-[var(--field)] p-2 text-sm text-foreground outline-none backdrop-blur-sm transition placeholder:text-muted-foreground/60 focus:border-[var(--trust)] focus:ring-1 focus:ring-[var(--trust)]",
        className
      )}
      {...props}
    />
  );
}

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("mb-1.5 block text-sm font-medium text-foreground/80", className)} {...props} />;
}

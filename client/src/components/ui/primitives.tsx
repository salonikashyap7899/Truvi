import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import type { HTMLAttributes, InputHTMLAttributes, LabelHTMLAttributes, TextareaHTMLAttributes } from "react";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-2xl glass p-5 shadow-[var(--shadow-elegant)] transition hover:border-white/15",
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
  default: "bg-white/10 text-foreground/90",
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
        "h-10 w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 text-sm text-foreground outline-none backdrop-blur-sm transition placeholder:text-muted-foreground/60 focus:border-[var(--trust)] focus:ring-1 focus:ring-[var(--trust)]",
        className
      )}
      {...props}
    />
  );
}

/**
 * Password field with a show/hide (eye) toggle, so people can check what they
 * typed — especially useful on phones where a mistyped password is otherwise
 * invisible. Same look as <Input>; the caller must NOT pass a `type`.
 */
export function PasswordInput({ className, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        {...props}
        type={show ? "text" : "password"}
        className={cn(
          "h-10 w-full rounded-lg border border-white/10 bg-white/[0.04] pl-3 pr-11 text-sm text-foreground outline-none backdrop-blur-sm transition placeholder:text-muted-foreground/60 focus:border-[var(--trust)] focus:ring-1 focus:ring-[var(--trust)]",
          className
        )}
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? "Hide password" : "Show password"}
        aria-pressed={show}
        tabIndex={-1}
        className="absolute inset-y-0 right-0 grid w-11 place-items-center text-muted-foreground/70 transition hover:text-foreground"
      >
        {show ? <EyeOff size={17} /> : <Eye size={17} />}
      </button>
    </div>
  );
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "w-full rounded-lg border border-white/10 bg-white/[0.04] p-2 text-sm text-foreground outline-none backdrop-blur-sm transition placeholder:text-muted-foreground/60 focus:border-[var(--trust)] focus:ring-1 focus:ring-[var(--trust)]",
        className
      )}
      {...props}
    />
  );
}

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("mb-1.5 block text-sm font-medium text-foreground/80", className)} {...props} />;
}

import { Loader2 } from "lucide-react";
import { forwardRef, useState, type ButtonHTMLAttributes, type HTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";

import { cn } from "@/lib/utils";
import { initials } from "@/lib/format";

// ── Button ────────────────────────────────────────────────────────────

type Variant = "primary" | "secondary" | "ghost" | "danger" | "success";
type Size = "sm" | "md" | "lg" | "icon";

const variants: Record<Variant, string> = {
  primary: "bg-accent text-accent-fg hover:brightness-110 shadow-sm",
  secondary: "bg-surface text-text border border-border hover:bg-surface-2",
  ghost: "text-muted hover:text-text hover:bg-surface-2",
  danger: "bg-rose-600 text-white hover:bg-rose-500 shadow-sm",
  success: "bg-emerald-600 text-white hover:bg-emerald-500 shadow-sm",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-xs gap-1.5 pointer-coarse:h-9",
  md: "h-9 px-3.5 text-sm gap-2 pointer-coarse:h-10",
  lg: "h-11 px-5 text-sm gap-2",
  icon: "h-9 w-9 justify-center pointer-coarse:size-10",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", loading, icon, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(
        "inline-flex shrink-0 items-center rounded-lg font-medium whitespace-nowrap transition-all duration-150 select-none active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50",
        variants[variant],
        sizes[size],
        className,
      )}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : icon}
      {children}
    </button>
  );
});

// ── Card ──────────────────────────────────────────────────────────────

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-2xl border border-border bg-surface shadow-card", className)}
      {...rest}
    />
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-4 px-5 pt-5 pb-3", className)}>
      <div className="min-w-0">
        <h3 className="text-sm font-semibold">{title}</h3>
        {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

// ── Badge ─────────────────────────────────────────────────────────────

export type Tone = "neutral" | "accent" | "green" | "amber" | "red" | "blue" | "violet" | "cyan";

const tones: Record<Tone, string> = {
  neutral: "bg-surface-2 text-muted ring-border",
  accent: "bg-accent/10 text-accent ring-accent/20",
  green: "bg-emerald-500/10 text-emerald-600 ring-emerald-500/20 dark:text-emerald-400",
  amber: "bg-amber-500/10 text-amber-700 ring-amber-500/25 dark:text-amber-400",
  red: "bg-rose-500/10 text-rose-600 ring-rose-500/20 dark:text-rose-400",
  blue: "bg-sky-500/10 text-sky-700 ring-sky-500/20 dark:text-sky-400",
  violet: "bg-violet-500/10 text-violet-700 ring-violet-500/20 dark:text-violet-400",
  cyan: "bg-cyan-500/10 text-cyan-700 ring-cyan-500/20 dark:text-cyan-400",
};

export function Badge({
  tone = "neutral",
  dot,
  className,
  children,
}: {
  tone?: Tone;
  dot?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ring-1 ring-inset",
        tones[tone],
        className,
      )}
    >
      {dot && <span className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

// ── Form controls ─────────────────────────────────────────────────────

const field =
  "w-full rounded-lg border border-border bg-surface px-3 text-sm text-text placeholder:text-muted/70 pointer-coarse:text-base transition focus:border-accent focus:outline-none focus:ring-3 focus:ring-[var(--ring)] disabled:opacity-60";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { icon?: ReactNode }>(
  function Input({ className, icon, ...rest }, ref) {
    if (!icon) return <input ref={ref} className={cn(field, "h-9 pointer-coarse:h-10", className)} {...rest} />;
    return (
      <div className="relative">
        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted">{icon}</span>
        <input ref={ref} className={cn(field, "h-9 pl-9 pointer-coarse:h-10", className)} {...rest} />
      </div>
    );
  },
);

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    // `w-44` sarkhi width dili tar `w-full` kadha (nahitar CSS order madhe w-full jinkto).
    <select className={cn(/\bw-/.test(className ?? "") ? field.replace("w-full ", "") : field, "h-9 cursor-pointer pr-8 pointer-coarse:h-10", className)} {...rest}>
      {children}
    </select>
  );
}

/** React 19: `ref` sadha prop (chat input focus / cursor sathi). */
export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & { ref?: React.Ref<HTMLTextAreaElement> }) {
  return <textarea className={cn(field, "min-h-24 py-2 leading-relaxed", className)} {...rest} />;
}

export function Label({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="mb-1.5 flex items-baseline justify-between">
      <span className="text-xs font-medium">{children}</span>
      {hint && <span className="text-[11px] text-muted">{hint}</span>}
    </div>
  );
}

/** On / off switch. */
export function Toggle({
  checked,
  onChange,
  disabled,
  size = "md",
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  size?: "sm" | "md";
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative shrink-0 rounded-full transition-colors duration-200 disabled:opacity-50",
        size === "md" ? "h-6 w-11" : "h-5 w-9",
        checked ? "bg-accent" : "bg-border",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 left-0.5 rounded-full bg-white shadow transition-transform duration-200 ease-[cubic-bezier(0.3,1.5,0.6,1)]",
          size === "md" ? "size-5" : "size-4",
          checked && (size === "md" ? "translate-x-5" : "translate-x-4"),
        )}
      />
    </button>
  );
}

// ── Segmented tabs ────────────────────────────────────────────────────

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode; count?: number }[];
  className?: string;
}) {
  return (
    <div className={cn("inline-flex max-w-full overflow-x-auto rounded-lg bg-surface-2 p-0.5", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap transition pointer-coarse:py-2",
            value === o.value ? "bg-surface text-text shadow-card" : "text-muted hover:text-text",
          )}
        >
          {o.label}
          {o.count !== undefined && o.count > 0 && (
            <span
              className={cn(
                "rounded-full px-1.5 text-[10px] tabular",
                value === o.value ? "bg-accent text-accent-fg" : "bg-border text-muted",
              )}
            >
              {o.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

// ── Feedback ──────────────────────────────────────────────────────────

export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn("relative overflow-hidden rounded-md bg-surface-2", className)}>
      <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.4s_infinite] bg-gradient-to-r from-transparent via-white/40 to-transparent dark:via-white/5" />
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("size-5 animate-spin text-muted", className)} />;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-14 text-center", className)}>
      {icon && (
        <div className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-surface-2 text-muted">
          {icon}
        </div>
      )}
      <p className="text-sm font-semibold">{title}</p>
      {description && <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// ── Avatar ────────────────────────────────────────────────────────────

const avatarColors = [
  "from-indigo-500 to-violet-500",
  "from-sky-500 to-cyan-500",
  "from-emerald-500 to-teal-500",
  "from-amber-500 to-orange-500",
  "from-rose-500 to-pink-500",
  "from-fuchsia-500 to-purple-500",
];

export function Avatar({
  name,
  seed,
  size = "md",
  src,
}: {
  name: string;
  seed?: string;
  size?: "sm" | "md" | "lg";
  /** Profile photo — load fail zala tar initials. */
  src?: string | null;
}) {
  const [broken, setBroken] = useState(false);
  const key = seed ?? name;
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  const box = cn(
    "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full",
    size === "sm" && "size-7 text-[10px]",
    size === "md" && "size-9 text-xs",
    size === "lg" && "size-14 text-lg",
  );
  if (src?.startsWith("https://") && !broken) {
    return (
      <span className={cn(box, "bg-surface-2")}>
        <img src={src} alt="" loading="lazy" className="size-full object-cover" onError={() => setBroken(true)} />
      </span>
    );
  }
  return (
    <span
      className={cn(box, "bg-gradient-to-br font-semibold text-white", avatarColors[Math.abs(h) % avatarColors.length])}
    >
      {initials(name)}
    </span>
  );
}

// ── Key-value row ─────────────────────────────────────────────────────

export function KV({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 text-sm">
      <span className="shrink-0 text-muted">{label}</span>
      <span className="min-w-0 text-right font-medium break-words">{children}</span>
    </div>
  );
}

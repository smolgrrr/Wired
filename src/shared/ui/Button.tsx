import type { ButtonHTMLAttributes } from "react";

type ButtonVariant = "primary" | "ghost" | "danger";
type ButtonSize = "sm" | "md";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-surface-raised border border-ghost text-primary hover:border-signal/30 disabled:opacity-50",
  ghost: "bg-transparent text-secondary hover:text-primary disabled:opacity-50",
  danger: "border border-danger-dim text-danger hover:border-danger disabled:opacity-50",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "text-meta px-3 py-1.5",
  md: "text-body px-4 py-2",
};

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  className = "",
  disabled,
  children,
  ...props
}: ButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <button
      type="button"
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={[
        "inline-flex items-center justify-center rounded-sm min-h-[24px] min-w-[24px]",
        "transition-colors duration-hover",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal-ghost focus-visible:ring-offset-2 focus-visible:ring-offset-void",
        variantClasses[variant],
        sizeClasses[size],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...props}
    >
      {children}
    </button>
  );
}
import type { InputHTMLAttributes } from "react";
import { useId } from "react";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
}

export function Input({
  label,
  hint,
  error,
  id: idProp,
  className = "",
  ...props
}: InputProps) {
  const generatedId = useId();
  const id = idProp ?? generatedId;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(" ") || undefined;

  return (
    <div className="w-full">
      {label && (
        <label htmlFor={id} className="block text-meta text-secondary mb-1">
          {label}
        </label>
      )}
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={[
          "w-full min-h-[24px] rounded-sm bg-surface border px-3 py-2 text-body text-primary",
          "border-ghost transition-colors duration-hover",
          "focus-visible:outline-none focus-visible:border-signal",
          "focus-visible:ring-2 focus-visible:ring-signal-ghost focus-visible:ring-offset-2 focus-visible:ring-offset-void",
          error ? "border-danger-dim" : "",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
        {...props}
      />
      {hint && !error && (
        <p id={hintId} className="mt-1 text-meta text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="mt-1 text-meta text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
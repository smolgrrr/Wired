import type { TextareaHTMLAttributes } from "react";
import { forwardRef, useId } from "react";

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  variant?: "default" | "compose";
  label?: string;
}

const variantClasses: Record<NonNullable<TextareaProps["variant"]>, string> = {
  default:
    "rounded-sm bg-surface border border-ghost px-3 py-2 resize-y",
  compose:
    "min-h-[var(--compose-min-height)] resize-none bg-surface border-0 border-b border-ghost rounded-none px-3 py-2",
};

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  {
    variant = "default",
    label,
    id: idProp,
    className = "",
    ...props
  },
  ref,
) {
  const generatedId = useId();
  const id = idProp ?? generatedId;

  return (
    <div className="w-full">
      {label && (
        <label htmlFor={id} className="block text-meta text-secondary mb-1">
          {label}
        </label>
      )}
      <textarea
        ref={ref}
        id={id}
        className={[
          "w-full text-body text-primary caret-[var(--signal)]",
          "transition-colors duration-hover",
          "focus-visible:outline-none focus-visible:border-signal",
          "focus-visible:ring-2 focus-visible:ring-signal-ghost focus-visible:ring-offset-2 focus-visible:ring-offset-void",
          variantClasses[variant],
          className,
        ]
          .filter(Boolean)
          .join(" ")}
        {...props}
      />
    </div>
  );
});

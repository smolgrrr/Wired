import { useRef, type KeyboardEvent } from "react";

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

export interface SegmentedControlProps<T extends string> {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  orientation?: "horizontal" | "vertical";
  "aria-label": string;
  className?: string;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  orientation = "horizontal",
  "aria-label": ariaLabel,
  className = "",
}: SegmentedControlProps<T>) {
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const isVertical = orientation === "vertical";

  const focusOption = (index: number) => {
    const option = options[index];
    if (!option) return;
    onChange(option.value);
    buttonRefs.current[index]?.focus();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const prevKey = isVertical ? "ArrowUp" : "ArrowLeft";
    const nextKey = isVertical ? "ArrowDown" : "ArrowRight";

    if (event.key === prevKey) {
      event.preventDefault();
      const nextIndex = index === 0 ? options.length - 1 : index - 1;
      focusOption(nextIndex);
      return;
    }

    if (event.key === nextKey) {
      event.preventDefault();
      const nextIndex = index === options.length - 1 ? 0 : index + 1;
      focusOption(nextIndex);
      return;
    }

    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      onChange(options[index].value);
    }
  };

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      aria-orientation={orientation}
      className={[
        "inline-flex bg-surface border border-ghost rounded-sm p-0.5",
        isVertical ? "flex-col" : "flex-row",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {options.map((option, index) => {
        const isSelected = option.value === value;

        return (
          <button
            key={option.value}
            ref={(element) => {
              buttonRefs.current[index] = element;
            }}
            type="button"
            role="radio"
            aria-checked={isSelected}
            tabIndex={isSelected ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={[
              "min-h-[24px] min-w-[24px] px-3 py-1.5 text-meta rounded-sm transition-colors duration-hover",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal-ghost focus-visible:ring-offset-2 focus-visible:ring-offset-void",
              isSelected
                ? "bg-surface-raised text-signal"
                : "bg-transparent text-muted hover:text-secondary",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
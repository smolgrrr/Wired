import { Button } from "./Button";
import { Input } from "./Input";

type SignalStepperProps = {
  value: string;
  onChange: (value: string) => void;
  min?: number | string;
  label?: string;
};

export function SignalStepper({
  value,
  onChange,
  min = 16,
  label = "signal",
}: SignalStepperProps) {
  const numericValue = parseInt(value, 10) || 0;
  const minValue = typeof min === "string" ? parseInt(min, 10) || 0 : min;

  return (
    <div className="inline-flex items-center gap-0.5 bg-surface border border-ghost rounded-sm px-1 py-0.5">
      <span className="text-meta text-muted px-1">{label}</span>
      <Input
        type="number"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        min={min}
        containerClassName="w-auto"
        className="w-12 !min-h-[24px] !py-1 !px-2 text-meta border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0"
        aria-label={`${label} difficulty`}
      />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => onChange(String(Math.max(minValue, numericValue - 1)))}
        aria-label={`decrease ${label}`}
      >
        -
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => onChange(String(numericValue + 1))}
        aria-label={`increase ${label}`}
      >
        +
      </Button>
    </div>
  );
}
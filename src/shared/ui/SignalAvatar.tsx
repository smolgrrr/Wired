import { pubkeyToGrid } from "@lib/pubkeyToGrid";

type SignalAvatarProps = {
  pubkey: string;
  size?: "sm" | "md";
  className?: string;
};

const sizePixels = {
  sm: 20,
  md: 24,
} as const;

export function SignalAvatar({ pubkey, size = "sm", className = "" }: SignalAvatarProps) {
  const grid = pubkeyToGrid(pubkey);
  const pixels = sizePixels[size];
  const pubkeySlice = pubkey.slice(0, 8);

  return (
    <svg
      width={pixels}
      height={pixels}
      viewBox="0 0 4 4"
      role="img"
      aria-label={`author ${pubkeySlice}`}
      className={["shrink-0", className].filter(Boolean).join(" ")}
    >
      {grid.map((filled, index) => {
        if (!filled) return null;
        const x = index % 4;
        const y = Math.floor(index / 4);
        return (
          <rect
            key={index}
            x={x}
            y={y}
            width={1}
            height={1}
            fill="var(--signal-dim)"
          />
        );
      })}
    </svg>
  );
}
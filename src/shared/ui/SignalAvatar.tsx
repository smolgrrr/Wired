import { useState } from "react";
import { pubkeyToGrid } from "@lib/pubkeyToGrid";
import { optimizedAvatarUrl } from "@lib/optimizedImageUrl";

type SignalAvatarProps = {
  pubkey: string;
  pictureUrl?: string;
  label?: string;
  size?: "sm" | "md";
  className?: string;
  priority?: boolean;
};

const sizePixels = {
  sm: 20,
  md: 24,
} as const;

function GridAvatar({
  pubkey,
  label,
  size,
  className,
}: {
  pubkey: string;
  label: string;
  size: "sm" | "md";
  className: string;
}) {
  const grid = pubkeyToGrid(pubkey);
  const pixels = sizePixels[size];

  return (
    <svg
      width={pixels}
      height={pixels}
      viewBox="0 0 4 4"
      role="img"
      aria-label={label}
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

export function SignalAvatar({
  pubkey,
  pictureUrl,
  label,
  size = "sm",
  className = "",
  priority = false,
}: SignalAvatarProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const [useRawUrl, setUseRawUrl] = useState(false);
  const pixels = sizePixels[size];
  const ariaLabel = label ?? `author ${pubkey.slice(0, 8)}`;

  if (pictureUrl && !imageFailed) {
    const src = useRawUrl
      ? pictureUrl
      : optimizedAvatarUrl(pictureUrl, pixels);

    return (
      <img
        src={src}
        alt=""
        width={pixels}
        height={pixels}
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : undefined}
        decoding="async"
        aria-label={ariaLabel}
        onError={() => {
          if (!useRawUrl) {
            setUseRawUrl(true);
            return;
          }
          setImageFailed(true);
        }}
        className={[
          "shrink-0 rounded-sm border border-ghost object-cover",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
        style={{ width: pixels, height: pixels }}
      />
    );
  }

  return (
    <GridAvatar pubkey={pubkey} label={ariaLabel} size={size} className={className} />
  );
}
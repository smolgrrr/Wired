import { useState } from "react";
import type { MediaItem } from "@lib/mediaUtils";

function MediaFallback() {
  return (
    <p className="text-meta text-muted py-2" role="status">
      signal lost
    </p>
  );
}

function MediaImage({ item, compact }: { item: MediaItem; compact?: boolean }) {
  const [failed, setFailed] = useState(false);

  if (failed) return <MediaFallback />;

  return (
    <img
      src={item.url}
      alt=""
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className={[
        "w-full rounded border border-ghost object-contain",
        compact ? "max-h-[120px]" : "max-h-[32rem]",
      ].join(" ")}
      style={
        item.width && item.height
          ? { aspectRatio: `${item.width} / ${item.height}` }
          : undefined
      }
    />
  );
}

function GridImage({
  item,
  compact,
  hiddenCount = 0,
  fillHeight = false,
}: {
  item: MediaItem;
  compact?: boolean;
  hiddenCount?: number;
  fillHeight?: boolean;
}) {
  const [failed, setFailed] = useState(false);

  if (failed) return <MediaFallback />;

  return (
    <div
      className={[
        "relative overflow-hidden rounded border border-ghost",
        fillHeight ? "h-full min-h-0" : "aspect-square",
        compact ? "max-h-[120px]" : "max-h-[32rem]",
      ].join(" ")}
    >
      <img
        src={item.url}
        alt=""
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
        className={[
          "h-full w-full object-cover",
          fillHeight ? "min-h-full" : "aspect-square",
        ].join(" ")}
      />
      {hiddenCount > 0 && (
        <div
          className="absolute inset-0 flex items-center justify-center bg-void/70 text-body text-primary"
          aria-label={`${hiddenCount} more images`}
        >
          +{hiddenCount}
        </div>
      )}
    </div>
  );
}

function MediaVideo({ item }: { item: MediaItem }) {
  const [failed, setFailed] = useState(false);

  if (failed) return <MediaFallback />;

  return (
    <video
      src={item.url}
      controls
      preload="metadata"
      playsInline
      onError={() => setFailed(true)}
      className="max-h-[32rem] w-full rounded border border-ghost"
    />
  );
}

function MediaAudio({ item }: { item: MediaItem }) {
  const [failed, setFailed] = useState(false);

  if (failed) return <MediaFallback />;

  return (
    <audio
      src={item.url}
      controls
      preload="metadata"
      onError={() => setFailed(true)}
      className="w-full"
    />
  );
}

export function MediaAttachment({ item, compact }: { item: MediaItem; compact?: boolean }) {
  switch (item.type) {
    case "image":
      return <MediaImage item={item} compact={compact} />;
    case "video":
      return <MediaVideo item={item} />;
    case "audio":
      return <MediaAudio item={item} />;
  }
}

export function MediaGrid({
  items,
  hiddenCount = 0,
  compact,
}: {
  items: MediaItem[];
  hiddenCount?: number;
  compact?: boolean;
}) {
  if (items.length === 0) return null;

  if (items.length === 2) {
    return (
      <div className="grid grid-cols-2 gap-3">
        <GridImage item={items[0]} compact={compact} />
        <GridImage item={items[1]} compact={compact} />
      </div>
    );
  }

  if (items.length === 3) {
    return (
      <div className="grid grid-cols-2 grid-rows-2 gap-3">
        <div className="row-span-2 min-h-0">
          <GridImage item={items[0]} compact={compact} fillHeight />
        </div>
        <GridImage item={items[1]} compact={compact} />
        <GridImage item={items[2]} compact={compact} />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3">
      <GridImage item={items[0]} compact={compact} />
      <GridImage item={items[1]} compact={compact} />
      <GridImage item={items[2]} compact={compact} />
      <GridImage
        item={items[3]}
        compact={compact}
        hiddenCount={hiddenCount}
      />
    </div>
  );
}

export function NoteMedia({ items }: { items: MediaItem[] }) {
  if (items.length === 0) return null;

  return (
    <div
      className="flex flex-col gap-3"
      aria-label={items.length > 1 ? `${items.length} attachments` : "attachment"}
    >
      {items.map((item) => (
        <MediaAttachment key={item.url} item={item} />
      ))}
    </div>
  );
}
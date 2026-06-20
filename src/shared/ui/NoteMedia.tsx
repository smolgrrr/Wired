import { useState } from "react";
import type { MediaItem } from "@lib/mediaUtils";
import {
  optimizedImageSrcSet,
  optimizedImageUrl,
  pickOptimizedWidth,
} from "@lib/optimizedImageUrl";

function MediaFallback() {
  return (
    <p className="text-meta text-muted py-2" role="status">
      signal lost
    </p>
  );
}

function useOptimizedImage(
  url: string,
  width: number,
  srcSetWidths: readonly number[],
) {
  const [useRaw, setUseRaw] = useState(false);

  if (useRaw) {
    return { src: url, srcSet: undefined, onError: () => setUseRaw(true) };
  }

  return {
    src: optimizedImageUrl(url, width),
    srcSet: optimizedImageSrcSet(url, srcSetWidths),
    onError: () => setUseRaw(true),
  };
}

function MediaImage({
  item,
  compact,
  priority = false,
}: {
  item: MediaItem;
  compact?: boolean;
  priority?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const maxWidth = compact ? 384 : 828;
  const width = pickOptimizedWidth(item.width, maxWidth);
  const srcSetWidths = compact ? [384, 640] : [640, 828, 1200];
  const { src, srcSet, onError } = useOptimizedImage(item.url, width, srcSetWidths);

  if (failed) return <MediaFallback />;

  const hasDimensions = Boolean(item.width && item.height);

  return (
    <img
      src={src}
      srcSet={srcSet}
      sizes={compact ? "384px" : "(max-width: 768px) 100vw, 828px"}
      alt=""
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : undefined}
      decoding="async"
      onError={() => {
        onError();
        if (src === item.url) setFailed(true);
      }}
      className={[
        "w-full rounded border border-ghost object-contain",
        compact ? "max-h-[120px]" : "max-h-[32rem]",
      ].join(" ")}
      style={
        hasDimensions
          ? { aspectRatio: `${item.width} / ${item.height}` }
          : { aspectRatio: "4 / 3", minHeight: compact ? "5rem" : "12rem" }
      }
    />
  );
}

function GridImage({
  item,
  compact,
  hiddenCount = 0,
  fillHeight = false,
  priority = false,
}: {
  item: MediaItem;
  compact?: boolean;
  hiddenCount?: number;
  fillHeight?: boolean;
  priority?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const maxWidth = compact ? 384 : 640;
  const width = pickOptimizedWidth(item.width, maxWidth);
  const srcSetWidths = compact ? [384, 640] : [384, 640, 828];
  const { src, srcSet, onError } = useOptimizedImage(item.url, width, srcSetWidths);

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
        src={src}
        srcSet={srcSet}
        sizes={compact ? "384px" : "(max-width: 768px) 50vw, 640px"}
        alt=""
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : undefined}
        decoding="async"
        onError={() => {
          onError();
          if (src === item.url) setFailed(true);
        }}
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

export function MediaAttachment({
  item,
  compact,
  priority = false,
}: {
  item: MediaItem;
  compact?: boolean;
  priority?: boolean;
}) {
  switch (item.type) {
    case "image":
      return <MediaImage item={item} compact={compact} priority={priority} />;
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
  priority = false,
}: {
  items: MediaItem[];
  hiddenCount?: number;
  compact?: boolean;
  priority?: boolean;
}) {
  if (items.length === 0) return null;

  if (items.length === 2) {
    return (
      <div className="grid grid-cols-2 gap-3">
        <GridImage item={items[0]} compact={compact} priority={priority} />
        <GridImage item={items[1]} compact={compact} />
      </div>
    );
  }

  if (items.length === 3) {
    return (
      <div className="grid grid-cols-2 grid-rows-2 gap-3">
        <div className="row-span-2 min-h-0">
          <GridImage item={items[0]} compact={compact} fillHeight priority={priority} />
        </div>
        <GridImage item={items[1]} compact={compact} />
        <GridImage item={items[2]} compact={compact} />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3">
      <GridImage item={items[0]} compact={compact} priority={priority} />
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
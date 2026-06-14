import { useState } from "react";
import type { MediaItem } from "../../utils/mediaUtils";

function MediaFallback() {
  return (
    <p className="text-meta text-muted py-2" role="status">
      signal lost
    </p>
  );
}

function MediaImage({ item }: { item: MediaItem }) {
  const [failed, setFailed] = useState(false);

  if (failed) return <MediaFallback />;

  return (
    <img
      src={item.url}
      alt=""
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className="max-h-[32rem] w-full rounded border border-ghost object-contain"
      style={
        item.width && item.height
          ? { aspectRatio: `${item.width} / ${item.height}` }
          : undefined
      }
    />
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

function MediaAttachment({ item }: { item: MediaItem }) {
  switch (item.type) {
    case "image":
      return <MediaImage item={item} />;
    case "video":
      return <MediaVideo item={item} />;
    case "audio":
      return <MediaAudio item={item} />;
  }
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
import { useCallback, useEffect, useRef, useState } from "react";
import type { MediaItem } from "@lib/mediaUtils";
import {
  optimizedImageSrcSet,
  optimizedImageUrl,
  pickOptimizedWidth,
} from "@lib/optimizedImageUrl";
import { useInView } from "../hooks/useInView";

function MediaFallback() {
  return (
    <p className="text-meta text-muted py-2" role="status">
      signal lost
    </p>
  );
}

type MediaOrientation = "landscape" | "portrait" | "square";

function getOrientation(width?: number, height?: number): MediaOrientation {
  if (!width || !height) return "landscape";
  const ratio = width / height;
  if (ratio > 1.1) return "landscape";
  if (ratio < 0.9) return "portrait";
  return "square";
}

function aspectRatioFromDimensions(width?: number, height?: number): string {
  if (width && height) return `${width} / ${height}`;
  return "16 / 9";
}

function dimensionAttrs(
  width?: number,
  height?: number,
): { width?: number; height?: number } {
  if (!width || !height) return {};
  return { width, height };
}

function imageClasses(orientation: MediaOrientation, compact?: boolean): string {
  const base = "rounded border border-ghost object-contain";

  if (compact) {
    switch (orientation) {
      case "portrait":
        return [base, "mx-auto block max-w-[min(100%,12rem)] max-h-[16rem]"].join(" ");
      case "square":
        return [base, "mx-auto block max-w-[14rem] max-h-[14rem]"].join(" ");
      default:
        return [base, "mx-auto block max-w-full max-h-[12rem]"].join(" ");
    }
  }

  return [base, "w-full max-h-[32rem]"].join(" ");
}

function videoWrapperClasses(orientation: MediaOrientation, compact?: boolean): string {
  const base = "relative overflow-hidden rounded border border-ghost bg-surface";

  if (compact) {
    switch (orientation) {
      case "portrait":
        return [base, "mx-auto max-w-[min(100%,10rem)] max-h-[14rem]"].join(" ");
      case "square":
        return [base, "mx-auto max-w-[12rem] max-h-[12rem]"].join(" ");
      default:
        return [base, "mx-auto max-w-full max-h-[12rem]"].join(" ");
    }
  }

  switch (orientation) {
    case "portrait":
      return [base, "mx-auto w-full max-w-[min(100%,18rem)] max-h-[min(60vh,32rem)]"].join(" ");
    case "square":
      return [base, "mx-auto w-full max-w-[24rem] max-h-[32rem]"].join(" ");
    default:
      return [base, "w-full max-h-[min(60vh,32rem)]"].join(" ");
  }
}

function useOptimizedImage(
  url: string,
  width: number,
  srcSetWidths: readonly number[],
) {
  const [useRaw, setUseRaw] = useState(false);

  useEffect(() => {
    setUseRaw(false);
  }, [url]);

  const optimizedSrc = optimizedImageUrl(url, width);
  const isOptimized = optimizedSrc !== url;

  if (useRaw) {
    return {
      src: url,
      srcSet: undefined,
      isOptimized: false,
      onError: () => undefined,
    };
  }

  return {
    src: optimizedSrc,
    srcSet: isOptimized ? optimizedImageSrcSet(url, srcSetWidths) : undefined,
    isOptimized,
    onError: () => {
      if (isOptimized) setUseRaw(true);
    },
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
  const { src, srcSet, isOptimized, onError } = useOptimizedImage(
    item.url,
    width,
    srcSetWidths,
  );

  if (failed) return <MediaFallback />;

  const hasDimensions = Boolean(item.width && item.height);
  const orientation = getOrientation(item.width, item.height);

  return (
    <img
      src={src}
      srcSet={srcSet}
      sizes={compact ? "384px" : "(max-width: 768px) 100vw, 828px"}
      {...dimensionAttrs(item.width, item.height)}
      alt=""
      loading={priority ? "eager" : "lazy"}
      {...(priority ? { fetchpriority: "high" } : {})}
      decoding="async"
      onError={() => {
        onError();
        if (!isOptimized) setFailed(true);
      }}
      className={imageClasses(orientation, compact)}
      style={
        hasDimensions
          ? { aspectRatio: `${item.width} / ${item.height}` }
          : { aspectRatio: "4 / 3", minHeight: compact ? "6rem" : "12rem" }
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
  const { src, srcSet, isOptimized, onError } = useOptimizedImage(
    item.url,
    width,
    srcSetWidths,
  );

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
        {...dimensionAttrs(item.width, item.height)}
        alt=""
        loading={priority ? "eager" : "lazy"}
        {...(priority ? { fetchpriority: "high" } : {})}
        decoding="async"
        onError={() => {
          onError();
          if (!isOptimized) setFailed(true);
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

function MediaVideo({
  item,
  compact,
  priority = false,
}: {
  item: MediaItem;
  compact?: boolean;
  priority?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const primedRef = useRef(false);
  const { ref: inViewRef, inView } = useInView({ rootMargin: "600px" });
  const [failed, setFailed] = useState(false);
  const [started, setStarted] = useState(false);
  const [previewReady, setPreviewReady] = useState(false);
  const [resolvedDimensions, setResolvedDimensions] = useState({
    width: item.width,
    height: item.height,
  });

  const orientation = getOrientation(resolvedDimensions.width, resolvedDimensions.height);
  const aspectRatio = aspectRatioFromDimensions(
    resolvedDimensions.width,
    resolvedDimensions.height,
  );
  const hasPoster = Boolean(item.posterUrl);
  const shouldPrimePreview = priority || inView;
  const requestFirstFrame = useCallback(() => {
    if (hasPoster) return;

    const video = videoRef.current;
    if (!video) return;

    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      setPreviewReady(true);
      return;
    }

    try {
      if (Number.isFinite(video.duration) && video.duration > 0) {
        video.currentTime = Math.min(0.001, video.duration);
      }
    } catch {
      // Cross-origin or streaming media may reject seeking; native controls remain usable.
    }
  }, [hasPoster]);
  const handleLoadedMetadata = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    if (
      !item.width &&
      !item.height &&
      video.videoWidth > 0 &&
      video.videoHeight > 0
    ) {
      setResolvedDimensions({
        width: video.videoWidth,
        height: video.videoHeight,
      });
    }

    if (shouldPrimePreview) requestFirstFrame();
  }, [item.width, item.height, requestFirstFrame, shouldPrimePreview]);

  useEffect(() => {
    if (hasPoster || !shouldPrimePreview || primedRef.current) return;

    const video = videoRef.current;
    if (!video) return;

    primedRef.current = true;
    video.load();
    requestFirstFrame();
  }, [hasPoster, requestFirstFrame, shouldPrimePreview]);

  if (failed) return <MediaFallback />;

  return (
    <div
      ref={inViewRef}
      className={videoWrapperClasses(orientation, compact)}
      style={{ aspectRatio }}
    >
      <video
        ref={videoRef}
        src={item.url}
        poster={item.posterUrl}
        {...dimensionAttrs(resolvedDimensions.width, resolvedDimensions.height)}
        controls
        preload={hasPoster || !shouldPrimePreview ? "metadata" : "auto"}
        playsInline
        onPlay={() => setStarted(true)}
        onLoadedMetadata={handleLoadedMetadata}
        onLoadedData={() => setPreviewReady(true)}
        onCanPlay={() => setPreviewReady(true)}
        onSeeked={() => setPreviewReady(true)}
        onError={() => setFailed(true)}
        className="h-full w-full object-contain"
      />
      {!hasPoster && !started && !previewReady && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-surface text-meta text-muted">
          <span
            aria-hidden="true"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-ghost bg-void/60 text-primary"
          >
            <span className="ml-0.5 h-0 w-0 border-y-[7px] border-l-[11px] border-y-transparent border-l-current" />
          </span>
          <span className="sr-only">video preview</span>
        </div>
      )}
    </div>
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
      return <MediaVideo item={item} compact={compact} priority={priority} />;
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

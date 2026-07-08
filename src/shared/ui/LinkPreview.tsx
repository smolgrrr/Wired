import { useState } from "react";
import type { LinkMetadata } from "@link/link";
import { domainFromUrl } from "@lib/url";
import { useInView } from "../hooks/useInView";
import { useLinkMetadata } from "../hooks/useLinkMetadata";

const SHELL_CLASS =
  "block overflow-hidden rounded border border-[var(--border-ghost)] transition-colors duration-hover hover:border-signal/30 focus-visible:outline-none";

function LinkPreviewImageSlot({
  imageUrl,
  onImageError,
}: {
  imageUrl?: string;
  onImageError: () => void;
}) {
  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt=""
        loading="lazy"
        decoding="async"
        onError={onImageError}
        className="aspect-[1.91/1] max-h-48 w-full object-cover"
      />
    );
  }

  return (
    <div
      aria-hidden="true"
      className="aspect-[1.91/1] max-h-48 w-full bg-[var(--surface-raised)]"
    />
  );
}

function LinkPreviewSkeleton() {
  return (
    <div aria-hidden="true" className="space-y-2">
      <div className="h-4 w-3/4 rounded bg-[var(--surface-raised)]" />
      <div className="h-3 w-full rounded bg-[var(--surface-raised)]" />
      <div className="h-3 w-1/2 rounded bg-[var(--surface-raised)]" />
    </div>
  );
}

function LinkPreviewText({
  title,
  description,
  domain,
  failed = false,
}: {
  title?: string;
  description?: string;
  domain: string;
  failed?: boolean;
}) {
  return (
    <div className="min-h-[4.5rem] px-3 py-2">
      {failed ? (
        <p className="text-meta text-muted" role="status">
          signal lost
        </p>
      ) : (
        <>
          {title && <p className="line-clamp-2 text-body text-primary">{title}</p>}
          {description && (
            <p className="mt-1 line-clamp-1 text-body text-secondary">{description}</p>
          )}
        </>
      )}
      <p className="mt-1 text-meta text-muted">{domain}</p>
    </div>
  );
}

function LinkPreviewShell({
  url,
  domain,
  label,
  showImageSlot,
  imageUrl,
  title,
  description,
  loading = false,
  failed = false,
  onImageError,
}: {
  url: string;
  domain: string;
  label: string;
  showImageSlot: boolean;
  imageUrl?: string;
  title?: string;
  description?: string;
  loading?: boolean;
  failed?: boolean;
  onImageError?: () => void;
}) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      className={SHELL_CLASS}
    >
      {showImageSlot && (
        <LinkPreviewImageSlot imageUrl={imageUrl} onImageError={onImageError ?? (() => undefined)} />
      )}
      <div className="min-h-[4.5rem] px-3 py-2">
        {loading ? (
          <>
            <p className="sr-only" role="status">
              resolving link…
            </p>
            <LinkPreviewSkeleton />
            <p className="mt-2 text-meta text-muted">{domain}</p>
          </>
        ) : (
          <LinkPreviewText
            title={title}
            description={description}
            domain={domain}
            failed={failed}
          />
        )}
      </div>
    </a>
  );
}

function idleLabel(domain: string): string {
  return `external link: ${domain}`;
}

function readyLabel(metadata: LinkMetadata): string {
  return metadata.title
    ? `${metadata.title} — ${metadata.domain}`
    : `external link: ${metadata.domain}`;
}

export function LinkPreview({ url }: { url: string }) {
  const { ref, inView } = useInView({ rootMargin: "600px" });
  const state = useLinkMetadata(url, inView);
  const domain = domainFromUrl(url);
  const [imageFailed, setImageFailed] = useState(false);

  if (!inView) {
    return (
      <div ref={ref}>
        <LinkPreviewShell
          url={url}
          domain={domain}
          label={idleLabel(domain)}
          showImageSlot
          title={undefined}
          description={undefined}
        />
      </div>
    );
  }

  if (state.status === "loading" || state.status === "idle") {
    return (
      <div ref={ref}>
        <LinkPreviewShell
          url={url}
          domain={domain}
          label={idleLabel(domain)}
          showImageSlot
          loading
        />
      </div>
    );
  }

  if (state.status === "failed") {
    return (
      <div ref={ref}>
        <LinkPreviewShell
          url={url}
          domain={domain}
          label={idleLabel(domain)}
          showImageSlot={false}
          failed
        />
      </div>
    );
  }

  const { metadata } = state;
  const showImage = Boolean(metadata.image && !imageFailed);

  return (
    <div ref={ref}>
      <LinkPreviewShell
        url={url}
        domain={metadata.domain}
        label={readyLabel(metadata)}
        showImageSlot={showImage}
        imageUrl={showImage ? metadata.image : undefined}
        title={metadata.title}
        description={metadata.description}
        onImageError={() => setImageFailed(true)}
      />
    </div>
  );
}
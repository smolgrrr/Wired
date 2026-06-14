import { useState } from "react";
import { useLinkMetadata } from "../hooks/useLinkMetadata";

function domainFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function LinkPreview({ url }: { url: string }) {
  const state = useLinkMetadata(url);
  const domain = domainFromUrl(url);
  const [imageFailed, setImageFailed] = useState(false);

  if (state.status === "loading") {
    return (
      <p className="text-meta text-muted" role="status">
        resolving link…
      </p>
    );
  }

  if (state.status === "failed") {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`external link: ${domain}`}
        className="block rounded border border-[var(--border-ghost)] px-3 py-2 transition-colors duration-hover hover:border-signal/30 focus-visible:outline-none"
      >
        <p className="text-meta text-muted" role="status">
          signal lost
        </p>
        <p className="mt-1 text-meta text-muted">{domain}</p>
      </a>
    );
  }

  const { metadata } = state;
  const label = metadata.title
    ? `${metadata.title} — ${metadata.domain}`
    : `external link: ${metadata.domain}`;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      className="block overflow-hidden rounded border border-[var(--border-ghost)] transition-colors duration-hover hover:border-signal/30 focus-visible:outline-none"
    >
      {metadata.image && !imageFailed && (
        <img
          src={metadata.image}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setImageFailed(true)}
          className="max-h-48 w-full object-cover"
        />
      )}
      <div className="px-3 py-2">
        {metadata.title && (
          <p className="line-clamp-2 text-body text-primary">{metadata.title}</p>
        )}
        {metadata.description && (
          <p className="mt-1 line-clamp-1 text-body text-secondary">
            {metadata.description}
          </p>
        )}
        <p className="mt-1 text-meta text-muted">{metadata.domain}</p>
      </div>
    </a>
  );
}
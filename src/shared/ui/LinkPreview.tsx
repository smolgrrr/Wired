import { useState } from "react";
import { domainFromUrl } from "@lib/url";
import { useInView } from "../hooks/useInView";
import { useLinkMetadata } from "../hooks/useLinkMetadata";

function DomainStub({ url, domain }: { url: string; domain: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`external link: ${domain}`}
      className="block rounded border border-[var(--border-ghost)] px-3 py-2 transition-colors duration-hover hover:border-signal/30 focus-visible:outline-none"
    >
      <p className="text-meta text-muted">{domain}</p>
    </a>
  );
}

export function LinkPreview({ url }: { url: string }) {
  const { ref, inView } = useInView();
  const state = useLinkMetadata(url, inView);
  const domain = domainFromUrl(url);
  const [imageFailed, setImageFailed] = useState(false);

  if (!inView || state.status === "idle") {
    return (
      <div ref={ref}>
        <DomainStub url={url} domain={domain} />
      </div>
    );
  }

  if (state.status === "loading") {
    return (
      <div ref={ref}>
        <p className="text-meta text-muted" role="status">
          resolving link…
        </p>
      </div>
    );
  }

  if (state.status === "failed") {
    return (
      <div ref={ref}>
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
      </div>
    );
  }

  const { metadata } = state;
  const label = metadata.title
    ? `${metadata.title} — ${metadata.domain}`
    : `external link: ${metadata.domain}`;

  return (
    <div ref={ref}>
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
    </div>
  );
}
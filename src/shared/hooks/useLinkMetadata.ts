import { useEffect, useState } from "react";

export type LinkMetadata = {
  title?: string;
  description?: string;
  image?: string;
  domain: string;
};

type LinkMetadataState =
  | { status: "loading" }
  | { status: "ready"; metadata: LinkMetadata }
  | { status: "failed" };

const cache = new Map<string, LinkMetadataState>();
const inflight = new Map<string, Promise<LinkMetadataState>>();

function domainFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

async function fetchMetadata(url: string): Promise<LinkMetadataState> {
  try {
    const response = await fetch(`/api/unfurl?url=${encodeURIComponent(url)}`);
    if (!response.ok) {
      return { status: "failed" };
    }

    const metadata = (await response.json()) as LinkMetadata;
    return {
      status: "ready",
      metadata: {
        ...metadata,
        domain: metadata.domain || domainFromUrl(url),
      },
    };
  } catch {
    return { status: "failed" };
  }
}

function loadMetadata(url: string): Promise<LinkMetadataState> {
  const cached = cache.get(url);
  if (cached && cached.status !== "loading") {
    return Promise.resolve(cached);
  }

  const pending = inflight.get(url);
  if (pending) return pending;

  const request = fetchMetadata(url).then((result) => {
    cache.set(url, result);
    inflight.delete(url);
    return result;
  });

  cache.set(url, { status: "loading" });
  inflight.set(url, request);
  return request;
}

export function useLinkMetadata(url: string): LinkMetadataState {
  const [state, setState] = useState<LinkMetadataState>(
    () => cache.get(url) ?? { status: "loading" },
  );

  useEffect(() => {
    let cancelled = false;

    void loadMetadata(url).then((result) => {
      if (!cancelled) {
        setState(result);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [url]);

  return state;
}
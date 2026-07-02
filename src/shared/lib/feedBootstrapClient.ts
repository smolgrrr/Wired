import type { Event } from "nostr-tools";
import type { ProcessedEvent, RelayHintsByEventId } from "../../nostr/types";
import type { ProfileMetadata } from "./profile";

export type FeedBootstrapResponse = {
  fetchedAt: number;
  processedEvents: ProcessedEvent[];
  profiles: Record<string, ProfileMetadata>;
};

export const VERCEL_FEED_BOOTSTRAP_URL = "/api/feed/bootstrap";
export const FEED_SNAPSHOT_URL_ENV = "VITE_FEED_SNAPSHOT_URL";

type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

function configuredFeedSnapshotUrl(): string | null {
  const url = import.meta.env[FEED_SNAPSHOT_URL_ENV]?.trim();
  return url || null;
}

export function feedBootstrapUrls(
  externalSnapshotUrl: string | null = configuredFeedSnapshotUrl(),
): string[] {
  return externalSnapshotUrl
    ? [externalSnapshotUrl, VERCEL_FEED_BOOTSTRAP_URL]
    : [VERCEL_FEED_BOOTSTRAP_URL];
}

function isFeedBootstrapResponse(value: unknown): value is FeedBootstrapResponse {
  if (!value || typeof value !== "object") return false;

  const candidate = value as Partial<FeedBootstrapResponse>;

  return (
    typeof candidate.fetchedAt === "number" &&
    Array.isArray(candidate.processedEvents) &&
    !!candidate.profiles &&
    typeof candidate.profiles === "object"
  );
}

export async function fetchFeedBootstrapSnapshot(
  fetcher: FetchLike = fetch,
  externalSnapshotUrl: string | null = configuredFeedSnapshotUrl(),
): Promise<FeedBootstrapResponse | null> {
  for (const url of feedBootstrapUrls(externalSnapshotUrl)) {
    try {
      const response = await fetcher(url);
      if (!response.ok) continue;

      const snapshot = (await response.json()) as unknown;
      if (isFeedBootstrapResponse(snapshot)) {
        return snapshot;
      }
    } catch {
      // Try the next bootstrap source.
    }
  }

  return null;
}

export function eventsFromProcessed(processedEvents: ProcessedEvent[]): Event[] {
  const events: Event[] = [];
  const seen = new Set<string>();

  processedEvents.forEach((processed) => {
    [processed.postEvent, ...processed.replies].forEach((event) => {
      if (seen.has(event.id)) return;
      seen.add(event.id);
      events.push(event);
    });
  });

  return events;
}

export function relayHintsFromProcessed(
  processedEvents: ProcessedEvent[],
): RelayHintsByEventId {
  const relayHintsByEventId = new Map<string, string[]>();

  processedEvents.forEach((processed) => {
    if (!processed.relayHints || processed.relayHints.length === 0) return;
    relayHintsByEventId.set(processed.postEvent.id, processed.relayHints);
  });

  return relayHintsByEventId;
}

export {
  BOOTSTRAP_AGE_HOURS,
  BOOTSTRAP_FILTER_DIFFICULTY,
  canUseFeedBootstrap,
} from "../../../lib/feedBootstrap";

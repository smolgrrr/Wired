import type { Event } from "nostr-tools";
import type { ProcessedEvent, RelayHintsByEventId } from "../../nostr/types";
import type { ProfileMetadata } from "./profile";

export type FeedBootstrapResponse = {
  fetchedAt: number;
  processedEvents: ProcessedEvent[];
  events: Event[];
  relayHintsByEventId: Record<string, string[]>;
  profiles: Record<string, ProfileMetadata>;
};

export const VERCEL_FEED_BOOTSTRAP_URL = "/api/feed/bootstrap";
export const FEED_SNAPSHOT_URL_ENV = "VITE_FEED_SNAPSHOT_URL";

type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

let cachedSnapshot: FeedBootstrapResponse | null = null;
let snapshotPromise: Promise<FeedBootstrapResponse | null> | null = null;

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
    Array.isArray(candidate.events) &&
    !!candidate.relayHintsByEventId &&
    typeof candidate.relayHintsByEventId === "object" &&
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

export function loadFeedBootstrapSnapshot(
  fetcher: FetchLike = fetch,
  externalSnapshotUrl: string | null = configuredFeedSnapshotUrl(),
): Promise<FeedBootstrapResponse | null> {
  if (cachedSnapshot) return Promise.resolve(cachedSnapshot);
  if (snapshotPromise) return snapshotPromise;

  snapshotPromise = fetchFeedBootstrapSnapshot(fetcher, externalSnapshotUrl)
    .then((snapshot) => {
      cachedSnapshot = snapshot;
      return snapshot;
    })
    .finally(() => {
      snapshotPromise = null;
    });

  return snapshotPromise;
}

export function cachedFeedBootstrapSnapshot(): FeedBootstrapResponse | null {
  return cachedSnapshot;
}

export function resetFeedBootstrapSnapshotCache(): void {
  cachedSnapshot = null;
  snapshotPromise = null;
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

export function eventsFromSnapshot(snapshot: FeedBootstrapResponse): Event[] {
  const events: Event[] = [];
  const seen = new Set<string>();

  [...snapshot.events, ...eventsFromProcessed(snapshot.processedEvents)].forEach((event) => {
    if (seen.has(event.id)) return;
    seen.add(event.id);
    events.push(event);
  });

  return events;
}

export function relayHintsFromSnapshot(
  snapshot: FeedBootstrapResponse,
): RelayHintsByEventId {
  const relayHintsByEventId = new Map<string, string[]>();

  Object.entries(snapshot.relayHintsByEventId).forEach(([eventId, relays]) => {
    relayHintsByEventId.set(eventId, [...new Set(relays)]);
  });

  snapshot.processedEvents.forEach((processed) => {
    if (!processed.relayHints || processed.relayHints.length === 0) return;
    const existing = relayHintsByEventId.get(processed.postEvent.id) ?? [];
    relayHintsByEventId.set(
      processed.postEvent.id,
      [...new Set([...existing, ...processed.relayHints])],
    );
  });

  return relayHintsByEventId;
}

export function snapshotEventById(snapshot: FeedBootstrapResponse): Map<string, Event> {
  return new Map(eventsFromSnapshot(snapshot).map((event) => [event.id, event]));
}

function buildRepliesByParent(events: Event[]): Map<string, Event[]> {
  const repliesByParent = new Map<string, Event[]>();

  events.forEach((event) => {
    if (event.kind !== 1) return;

    event.tags.forEach((tag) => {
      if (tag[0] !== "e" || !tag[1]) return;

      const replies = repliesByParent.get(tag[1]) ?? [];
      replies.push(event);
      repliesByParent.set(tag[1], replies);
    });
  });

  return repliesByParent;
}

export function threadEventsFromSnapshot(
  snapshot: FeedBootstrapResponse,
  threadId: string,
): Event[] {
  const eventsById = snapshotEventById(snapshot);
  const opEvent = eventsById.get(threadId);
  if (!opEvent) return [];

  const repliesByParent = buildRepliesByParent(eventsFromSnapshot(snapshot));
  const threadEvents: Event[] = [opEvent];
  const seen = new Set<string>([opEvent.id]);
  const pending = [...(repliesByParent.get(threadId) ?? [])];

  while (pending.length > 0) {
    const event = pending.shift();
    if (!event || seen.has(event.id)) continue;

    seen.add(event.id);
    threadEvents.push(event);
    pending.push(...(repliesByParent.get(event.id) ?? []));
  }

  opEvent.tags.forEach((tag) => {
    if (tag[0] !== "e" || !tag[1] || seen.has(tag[1])) return;

    const mentioned = eventsById.get(tag[1]);
    if (!mentioned) return;

    seen.add(mentioned.id);
    threadEvents.push(mentioned);
  });

  return threadEvents;
}

export {
  BOOTSTRAP_AGE_HOURS,
  BOOTSTRAP_FILTER_DIFFICULTY,
  canUseFeedBootstrap,
} from "../../../lib/feedBootstrap";

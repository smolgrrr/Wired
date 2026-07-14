import { Relay, type Event, useWebSocketImplementation } from "nostr-tools";
import { WebSocket } from "ws";
import { THREAD_RELAYS } from "../src/config.js";
import {
  isFeedBootstrapSnapshot,
  type FeedBootstrapSnapshot,
} from "../src/shared/lib/feedBootstrapTypes.js";
import { decodeThreadRef, uniqueRelays } from "../src/shared/lib/threadRefs.js";
import { cleanThreadExcerpt } from "../src/shared/lib/threadExcerpt.js";

useWebSocketImplementation(WebSocket);

const SNAPSHOT_TIMEOUT_MS = 1_500;
const RELAY_TIMEOUT_MS = 2_500;

export type ThreadPreview = {
  eventId: string;
  excerpt: string;
  replyCount: number;
};

export type ResolveThreadPreviewOptions = {
  origin: string;
  snapshotUrl?: string;
  fetchImpl?: typeof fetch;
  relayFallback?: (eventId: string, relayHints: readonly string[]) => Promise<Event[]>;
};

export type FetchThreadEventsOptions = {
  configuredRelayUrls?: readonly string[];
  connectRelay?: typeof Relay.connect;
  timeoutMs?: number;
};

function replyCountFromEvents(events: readonly Event[], eventId: string): number {
  return new Set(
    events
      .filter(
        (event) =>
          event.id !== eventId &&
          event.tags.some((tag) => tag[0] === "e" && tag[1] === eventId),
      )
      .map((event) => event.id),
  ).size;
}

export function previewFromSnapshot(
  snapshot: FeedBootstrapSnapshot,
  eventId: string,
): ThreadPreview | null {
  const event = snapshot.eventsById[eventId];
  if (!event) return null;

  const processed = snapshot.processedEvents.find(
    (candidate) => candidate.postEventId === eventId,
  );

  return {
    eventId,
    excerpt: cleanThreadExcerpt(event.content) || "An anonymous signal on Wired.",
    replyCount:
      processed?.threadReplyCount ??
      replyCountFromEvents(Object.values(snapshot.eventsById), eventId),
  };
}

async function fetchSnapshot(
  url: string,
  fetchImpl: typeof fetch,
): Promise<FeedBootstrapSnapshot | null> {
  try {
    const response = await fetchImpl(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(SNAPSHOT_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const value: unknown = await response.json();
    return isFeedBootstrapSnapshot(value) ? value : null;
  } catch {
    return null;
  }
}

export async function fetchThreadEventsFromRelays(
  eventId: string,
  relayHints: readonly string[],
  options: FetchThreadEventsOptions = {},
): Promise<Event[]> {
  const relayUrls = uniqueRelays([
    ...relayHints,
    ...(options.configuredRelayUrls ?? THREAD_RELAYS),
  ]);
  const timeoutMs = options.timeoutMs ?? RELAY_TIMEOUT_MS;
  const connectRelay = options.connectRelay ?? Relay.connect;
  const relays: Relay[] = [];
  const events = new Map<string, Event>();
  let acceptingConnections = true;
  let connectionTimer: ReturnType<typeof setTimeout> | undefined;

  const connectionAttempts = Promise.all(
    relayUrls.map(async (url) => {
      try {
        const relay = await connectRelay(url);
        if (!acceptingConnections) {
          relay.close();
          return;
        }
        relays.push(relay);
      } catch {
        // A preview can succeed from any available relay.
      }
    }),
  );
  await Promise.race([
    connectionAttempts,
    new Promise<void>((resolve) => {
      connectionTimer = setTimeout(resolve, timeoutMs);
    }),
  ]);
  acceptingConnections = false;
  if (connectionTimer) clearTimeout(connectionTimer);

  if (relays.length === 0) return [];

  await new Promise<void>((resolve) => {
    const settledRelays = new Set<number>();
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      subscriptions.forEach((subscription) => subscription.close());
      resolve();
    };
    const timer = setTimeout(finish, timeoutMs);
    const settleRelay = (index: number) => {
      settledRelays.add(index);
      if (settledRelays.size >= relays.length) finish();
    };
    const subscriptions = relays.map((relay, index) =>
      relay.subscribe(
        [
          { ids: [eventId], kinds: [1], limit: 1 },
          { "#e": [eventId], kinds: [1], limit: 500 },
        ],
        {
          onevent: (event) => events.set(event.id, event),
          oneose: () => settleRelay(index),
          onclose: () => settleRelay(index),
        },
      ),
    );
  });

  relays.forEach((relay) => relay.close());
  return [...events.values()];
}

export async function resolveThreadPreview(
  ref: string | undefined,
  {
    origin,
    snapshotUrl = process.env.VITE_FEED_SNAPSHOT_URL,
    fetchImpl = fetch,
    relayFallback = fetchThreadEventsFromRelays,
  }: ResolveThreadPreviewOptions,
): Promise<ThreadPreview | null> {
  const decoded = decodeThreadRef(ref);
  if (!decoded) return null;

  const snapshotUrls = uniqueRelays(
    [snapshotUrl, new URL("/api/feed/bootstrap", origin).toString()].filter(
      (url): url is string => Boolean(url),
    ),
  );

  const snapshots = await Promise.all(
    snapshotUrls.map((url) => fetchSnapshot(url, fetchImpl)),
  );
  const snapshotPreview = snapshots
    .map((snapshot) => snapshot && previewFromSnapshot(snapshot, decoded.id))
    .find((preview): preview is ThreadPreview => Boolean(preview));
  if (snapshotPreview) return snapshotPreview;

  const events = await relayFallback(decoded.id, decoded.relays);
  const event = events.find((candidate) => candidate.id === decoded.id);
  if (!event) return null;

  return {
    eventId: event.id,
    excerpt: cleanThreadExcerpt(event.content) || "An anonymous signal on Wired.",
    replyCount: replyCountFromEvents(events, event.id),
  };
}

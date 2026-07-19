import type { Event } from "nostr-tools";
import { THREAD_RELAYS } from "../src/config.js";
import {
  isFeedBootstrapSnapshot,
  type FeedBootstrapSnapshot,
} from "../src/shared/lib/feedBootstrapTypes.js";
import { decodeThreadRef, uniqueRelays } from "../src/shared/lib/threadRefs.js";
import { cleanThreadExcerpt } from "../src/shared/lib/threadExcerpt.js";
import { withFiniteRelaySession } from "./serverRelaySession.js";

const SNAPSHOT_TIMEOUT_MS = 1_500;
const RELAY_TIMEOUT_MS = 2_500;
const PREVIEW_REPLY_PARENT_CHUNK_SIZE = 50;
const PREVIEW_FRONTIER_EARLY_FLUSH_MS = 25;

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
  onResolution?: (observation: {
    eventId: string;
    outcome: "snapshot-hit" | "relay-fallback" | "missing";
  }) => void;
};

export type FetchThreadEventsOptions = {
  configuredRelayUrls?: readonly string[];
  timeoutMs?: number;
  signal?: AbortSignal;
  recursiveReplies?: boolean;
};

function replyCountFromEvents(events: readonly Event[], eventId: string): number {
  const childIdsByParent = new Map<string, Set<string>>();
  events.forEach((event) => {
    event.tags.forEach((tag) => {
      if (tag[0] !== "e" || !tag[1]) return;
      const childIds = childIdsByParent.get(tag[1]) ?? new Set<string>();
      childIds.add(event.id);
      childIdsByParent.set(tag[1], childIds);
    });
  });
  const reachableIds = new Set([eventId]);
  const queue = [eventId];
  for (let index = 0; index < queue.length; index += 1) {
    const parentId = queue[index]!;
    childIdsByParent.get(parentId)?.forEach((childId) => {
      if (reachableIds.has(childId)) return;
      reachableIds.add(childId);
      queue.push(childId);
    });
  }
  return reachableIds.size - 1;
}

function chunkIds(ids: readonly string[], chunkSize: number): string[][] {
  const chunks: string[][] = [];
  for (let index = 0; index < ids.length; index += chunkSize) {
    chunks.push(ids.slice(index, index + chunkSize));
  }
  return chunks;
}

function recursivePreviewRepliesEnabled(): boolean {
  const configured = process.env.WIRED_PREVIEW_RECURSIVE_REPLIES?.trim().toLowerCase();
  return configured !== "0" && configured !== "false";
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
  const recursiveReplies =
    options.recursiveReplies ?? recursivePreviewRepliesEnabled();
  return withFiniteRelaySession(
    { relayUrls, connectDeadlineMs: timeoutMs, signal: options.signal },
    async (session) => {
      const events = new Map<string, Event>();
      const queryDeadlineAt = Date.now() + timeoutMs;
      const remainingQueryMs = () => Math.max(0, queryDeadlineAt - Date.now());
      const recursiveParentIds = new Set<string>();
      const pendingParentIds = new Set<string>();
      let activeFrontierQuery: {
        controller: AbortController;
        promise: Promise<unknown>;
      } | null = null;
      let frontierFlush: Promise<void> | null = null;
      let frontierFlushTimer: ReturnType<typeof setTimeout> | null = null;
      let resolveFrontierFlush: (() => void) | null = null;
      const currentFrontierQuery = () => activeFrontierQuery;

      const addEvent = (event: Event) => {
        if (events.has(event.id)) return;
        events.set(event.id, event);
        if (
          recursiveReplies &&
          event.id !== eventId &&
          !recursiveParentIds.has(event.id)
        ) {
          recursiveParentIds.add(event.id);
          pendingParentIds.add(event.id);
          scheduleFrontier();
        }
      };
      const queryParentChunks = (parentChunks: string[][]) => {
        const deadlineMs = remainingQueryMs();
        if (deadlineMs === 0) return;
        activeFrontierQuery?.controller.abort();
        const controller = new AbortController();
        let operation!: {
          controller: AbortController;
          promise: Promise<unknown>;
        };
        const promise = session.query({
          filters: parentChunks.map((parentIds) => ({
            "#e": parentIds,
            kinds: [1],
          })),
          relayUrls,
          deadlineMs,
          signal: controller.signal,
          onEvent: addEvent,
        });
        operation = { controller, promise };
        activeFrontierQuery = operation;
        void promise.finally(() => {
          if (activeFrontierQuery === operation) activeFrontierQuery = null;
          if (pendingParentIds.size > 0) flushScheduledFrontier();
        });
      };
      const flushFrontier = () => {
        if (remainingQueryMs() === 0) {
          pendingParentIds.clear();
          return;
        }
        pendingParentIds.clear();
        queryParentChunks(
          chunkIds([...recursiveParentIds], PREVIEW_REPLY_PARENT_CHUNK_SIZE),
        );
      };
      function flushScheduledFrontier() {
        if (!frontierFlush) return;
        if (frontierFlushTimer) clearTimeout(frontierFlushTimer);
        frontierFlushTimer = null;
        const resolve = resolveFrontierFlush;
        resolveFrontierFlush = null;
        frontierFlush = null;
        flushFrontier();
        resolve?.();
      }
      function scheduleFrontier() {
        if (frontierFlush) return;
        frontierFlush = new Promise<void>((resolve) => {
          resolveFrontierFlush = resolve;
          frontierFlushTimer = setTimeout(
            flushScheduledFrontier,
            PREVIEW_FRONTIER_EARLY_FLUSH_MS,
          );
        });
      }

      await session.query({
        filters: [
          { ids: [eventId], kinds: [1], limit: 1 },
          { "#e": [eventId], kinds: [1], limit: 500 },
        ],
        relayUrls,
        deadlineMs: remainingQueryMs(),
        signal: options.signal,
        onEvent: addEvent,
      });
      flushScheduledFrontier();

      if (recursiveReplies) {
        while (
          frontierFlush ||
          pendingParentIds.size > 0 ||
          currentFrontierQuery()
        ) {
          if (frontierFlush) await frontierFlush;
          if (pendingParentIds.size > 0 && !frontierFlush) flushFrontier();
          const activeQuery = currentFrontierQuery();
          if (activeQuery) await activeQuery.promise;
        }
      }
      return [...events.values()];
    },
  );
}

export async function resolveThreadPreview(
  ref: string | undefined,
  {
    origin,
    snapshotUrl = process.env.VITE_FEED_SNAPSHOT_URL,
    fetchImpl = fetch,
    relayFallback = fetchThreadEventsFromRelays,
    onResolution = () => {},
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
  if (snapshotPreview) {
    try { onResolution({ eventId: decoded.id, outcome: "snapshot-hit" }); } catch {}
    return snapshotPreview;
  }

  const events = await relayFallback(decoded.id, decoded.relays);
  const event = events.find((candidate) => candidate.id === decoded.id);
  if (!event) {
    try { onResolution({ eventId: decoded.id, outcome: "missing" }); } catch {}
    return null;
  }

  try { onResolution({ eventId: decoded.id, outcome: "relay-fallback" }); } catch {}

  return {
    eventId: event.id,
    excerpt: cleanThreadExcerpt(event.content) || "An anonymous signal on Wired.",
    replyCount: replyCountFromEvents(events, event.id),
  };
}
